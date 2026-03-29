import electron from 'electron';
const { app, ipcMain, BrowserWindow, shell } = electron;
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, createWriteStream, readdirSync, readFileSync, writeFileSync, statSync, renameSync } from 'fs'
import https from 'https'
import http from 'http'
import { promisify } from 'util'
import { pipeline as streamPipeline } from 'stream'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import type { RequestOptions } from 'https'

const pipeline = promisify(streamPipeline)
const execFilePromise = promisify(execFile)

interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  assets: Array<{
    name: string
    browser_download_url: string
  }>
  published_at: string
}

interface GitHubApiError {
  message?: string
}

export class UpdateService {
  private static readonly REPO_OWNER = 'thibautrey'
  private static readonly REPO_NAME = 'chaton'
  private static readonly UPDATE_DIR = join(app.getPath('userData'), 'updates')
  private static readonly UPDATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
  private static readonly CURRENT_VERSION = app.getVersion() || '0.1.0'
  private static readonly DOWNLOAD_REQUEST_TIMEOUT_MS = 2 * 60 * 1000
  private static readonly DOWNLOAD_MAX_RETRIES = 3
  private static readonly DOWNLOAD_RETRY_BASE_DELAY_MS = 1_500
  private static lastUpdateCheckAt: number | null = null
  private static cachedUpdateCheck: GitHubRelease | null = null
  private static updateCheckInFlight: Promise<GitHubRelease | null> | null = null
  private static changelogsPrefetched = false
  private static updateArtifactsCleaned = false

  static async checkForUpdates(): Promise<GitHubRelease | null> {
    await this.cleanupUpdateArtifacts()

    // Return cached result only if cache is valid AND had a successful result
    if (this.lastUpdateCheckAt) {
      console.log('Update check already performed this session; using cached result')
      return this.cachedUpdateCheck
    }

    if (this.updateCheckInFlight) {
      return this.updateCheckInFlight
    }

    this.updateCheckInFlight = (async () => {
      try {
        const releases = await this.fetchReleases()
        const latestRelease = releases[0]

        if (!latestRelease) {
          console.log('No releases found')
          return null
        }

        // Extract version from tag, handling both v1.2.3 and 1.2.3 formats
        const latestVersion = latestRelease.tag_name.replace(/^v/, '')
        console.log(`Current version: ${this.CURRENT_VERSION}, Latest version: ${latestVersion}`)

        if (this.isNewerVersion(latestVersion, this.CURRENT_VERSION)) {
          console.log('New update available:', latestRelease.name)
          return latestRelease
        }

        console.log('No updates available')
        return null
      } catch (error) {
        console.error('Error checking for updates:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Check update error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
        throw new Error(`Failed to check for updates: ${errorMessage}`)
      }
    })()

    try {
      const result = await this.updateCheckInFlight
      this.cachedUpdateCheck = result
      this.lastUpdateCheckAt = Date.now()
      return result
    } finally {
      this.updateCheckInFlight = null
    }
  }

  private static getGitHubApiHeaders() {
    return {
      'User-Agent': 'Chatons-Update-Checker',
      'Accept': 'application/vnd.github.v3+json'
    }
  }

  private static async fetchReleases(): Promise<GitHubRelease[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.REPO_OWNER}/${this.REPO_NAME}/releases`,
        headers: this.getGitHubApiHeaders(),
        timeout: 15000
      }

      const req = https.request(options, (res: any) => {
        let data = ''

        res.on('data', (chunk: Buffer) => {
          data += chunk
        })

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const releases = JSON.parse(data)
              resolve(releases)
            } catch (e) {
              reject(new Error('Failed to parse releases'))
            }
          } else if (res.statusCode === 301 || res.statusCode === 302) {
            // Handle redirects
            const redirectUrl = res.headers.location
            if (redirectUrl) {
              console.log(`Following redirect to: ${redirectUrl}`)
              // Recursively follow redirect
              this.fetchReleasesFromUrl(redirectUrl).then(resolve).catch(reject)
            } else {
              reject(new Error(`Redirect without location header`))
            }
          } else if (res.statusCode === 403 || res.statusCode === 429) {
            const remaining = res.headers['x-ratelimit-remaining']
            console.warn(`GitHub API rate limited (${res.statusCode}), remaining: ${remaining}`)
            reject(new Error('GitHub API rate limit exceeded. Please try again later.'))
          } else {
            reject(new Error(`GitHub API returned status ${res.statusCode}`))
          }
        })
      })

      req.on('error', (error: Error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('GitHub API request timed out'))
      })

      req.end()
    })
  }

  private static async fetchReleasesFromUrl(url: string): Promise<GitHubRelease[]> {
    return new Promise((resolve, reject) => {
      // Determine protocol from URL
      const protocol = url.startsWith('https') ? https : http
      
      const req = protocol.get(url, { headers: this.getGitHubApiHeaders(), timeout: 15000 }, (res: any) => {
        let data = ''

        res.on('data', (chunk: Buffer) => {
          data += chunk
        })

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const releases = JSON.parse(data)
              resolve(releases)
            } catch (e) {
              reject(new Error('Failed to parse releases'))
            }
          } else if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location
            if (redirectUrl) {
              this.fetchReleasesFromUrl(redirectUrl).then(resolve).catch(reject)
            } else {
              reject(new Error(`Redirect without location header`))
            }
          } else {
            reject(new Error(`API returned status ${res.statusCode}`))
          }
        })
      })

      req.on('error', (error: Error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('API request timed out'))
      })
    })
  }

  private static async fetchReleaseByTag(version: string): Promise<GitHubRelease | null> {
    return new Promise((resolve, reject) => {
      const normalizedVersion = version.replace(/^v/i, '').trim()
      const tag = normalizedVersion.startsWith('v') ? normalizedVersion : `v${normalizedVersion}`
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.REPO_OWNER}/${this.REPO_NAME}/releases/tags/${encodeURIComponent(tag)}`,
        headers: this.getGitHubApiHeaders(),
        timeout: 15000
      }

      const req = https.request(options, (res: any) => {
        let data = ''

        res.on('data', (chunk: Buffer) => {
          data += chunk
        })

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const release = JSON.parse(data) as GitHubRelease
              resolve(release)
            } catch {
              reject(new Error('Failed to parse release details'))
            }
            return
          }

          if (res.statusCode === 404) {
            resolve(null)
            return
          }

          if (res.statusCode === 403 || res.statusCode === 429) {
            const remaining = res.headers['x-ratelimit-remaining']
            console.warn(`GitHub API rate limited (${res.statusCode}), remaining: ${remaining}`)
            reject(new Error('GitHub API rate limit exceeded. Please try again later.'))
            return
          }

          try {
            const payload = JSON.parse(data) as GitHubApiError
            reject(new Error(payload.message || `GitHub API returned status ${res.statusCode}`))
          } catch {
            reject(new Error(`GitHub API returned status ${res.statusCode}`))
          }
        })
      })

      req.on('error', (error: Error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error('GitHub API request timed out'))
      })

      req.end()
    })
  }

  private static isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number)
    const currentParts = current.split('.').map(Number)

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latestPart = latestParts[i] || 0
      const currentPart = currentParts[i] || 0

      if (latestPart > currentPart) return true
      if (latestPart < currentPart) return false
    }

    return false
  }

  static async downloadUpdate(release: GitHubRelease): Promise<string> {
    try {
      if (!existsSync(this.UPDATE_DIR)) {
        mkdirSync(this.UPDATE_DIR, { recursive: true })
      }

      await this.cleanupPartialDownloads()

      const asset = this.findAssetForPlatform(release.assets)
      if (!asset) {
        throw new Error('No suitable asset found for this platform')
      }

      const downloadUrl = asset.browser_download_url
      const filePath = join(this.UPDATE_DIR, asset.name)
      const tempFilePath = `${filePath}.tmp`

      console.log(`Downloading update from ${downloadUrl}`)

      let lastError: Error | null = null
      for (let attempt = 1; attempt <= this.DOWNLOAD_MAX_RETRIES; attempt++) {
        try {
          await this.downloadFileWithRedirects({
            url: downloadUrl,
            filePath,
            tempFilePath,
            assetName: asset.name,
            attempt
          })

          console.log(`Update downloaded to ${filePath}`)
          return filePath
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          const isLastAttempt = attempt === this.DOWNLOAD_MAX_RETRIES
          console.warn(`Update download attempt ${attempt}/${this.DOWNLOAD_MAX_RETRIES} failed:`, lastError)

          if (isLastAttempt || !this.shouldRetryDownload(lastError)) {
            break
          }

          const delayMs = this.DOWNLOAD_RETRY_BASE_DELAY_MS * attempt
          console.log(`Retrying update download in ${delayMs}ms`)
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }

      throw lastError ?? new Error('Failed to download update')
    } catch (error) {
      console.error('Error downloading update:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Download error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      throw new Error(`Failed to download update: ${errorMessage}`)
    }
  }

  private static async downloadFileWithRedirects(params: {
    url: string
    filePath: string
    tempFilePath: string
    assetName: string
    attempt: number
  }): Promise<void> {
    const { url, filePath, tempFilePath, assetName, attempt } = params

    await new Promise<void>((resolve, reject) => {
      let fileStream = createWriteStream(tempFilePath, { flags: 'w' })
      let downloadedBytes = 0
      let totalBytes = 0
      let redirectCount = 0
      const maxRedirects = 5
      let settled = false
      let activeRequest: http.ClientRequest | null = null
      let idleTimer: NodeJS.Timeout | null = null

      const safeCleanupTempFile = () => {
        try {
          if (existsSync(tempFilePath)) rmSync(tempFilePath)
        } catch (cleanupError) {
          console.warn('Failed to remove partial update download:', cleanupError)
        }
      }

      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer)
          idleTimer = null
        }
      }

      const resetIdleTimer = (currentUrl: string) => {
        clearIdleTimer()
        idleTimer = setTimeout(() => {
          console.warn(`Update download stalled after ${downloadedBytes} bytes from ${currentUrl}`)
          finalizeError(new Error('Download request timed out'))
        }, this.DOWNLOAD_REQUEST_TIMEOUT_MS)
      }

      const finalizeError = (error: Error) => {
        if (settled) return
        settled = true
        clearIdleTimer()
        activeRequest?.removeAllListeners()
        activeRequest?.destroy()
        fileStream.destroy()
        safeCleanupTempFile()
        reject(error)
      }

      const recreateFileStream = () => {
        if (!fileStream.destroyed) {
          fileStream.destroy()
        }
        fileStream = createWriteStream(tempFilePath, { flags: 'w' })
      }

      const broadcastProgress = (progress: number) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed()) continue
          const webContents = win.webContents
          if (webContents.isDestroyed()) continue
          try {
            webContents.send('download-progress', progress)
          } catch (err) {
            console.warn('[download progress] Failed to send to window:', err)
          }
        }
      }

      const makeRequest = (requestUrl: string) => {
        if (settled) {
          return
        }

        if (redirectCount >= maxRedirects) {
          finalizeError(new Error('Too many redirects'))
          return
        }

        console.log(`Downloading ${assetName} (attempt ${attempt}/${this.DOWNLOAD_MAX_RETRIES}) from: ${requestUrl}`)
        const protocol = requestUrl.startsWith('https') ? https : http
        const requestOptions: RequestOptions = {
          timeout: 30_000,
          headers: {
            'User-Agent': 'Chatons-Updater'
          }
        }

        const request = protocol.get(requestUrl, requestOptions, (response) => {
          if (settled) {
            response.resume()
            return
          }

          resetIdleTimer(requestUrl)

          if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
            const redirectUrl = response.headers.location
            if (redirectUrl) {
              console.log(`Following redirect to: ${redirectUrl}`)
              downloadedBytes = 0
              totalBytes = 0

              let finalRedirectUrl = redirectUrl
              try {
                const redirectUrlObj = new URL(redirectUrl, requestUrl)
                finalRedirectUrl = redirectUrlObj.toString()
              } catch (e) {
                console.error('Failed to parse redirect URL:', e)
                finalizeError(new Error('Invalid redirect URL'))
                return
              }

              response.resume()
              recreateFileStream()
              redirectCount++
              makeRequest(finalRedirectUrl)
              return
            }
          }

          if (response.statusCode !== 200) {
            response.resume()
            finalizeError(new Error(`Failed to download file: HTTP ${response.statusCode}`))
            return
          }

          recreateFileStream()

          totalBytes = parseInt(response.headers['content-length'] || '0', 10)
          console.log(`Starting download of ${assetName}: ${totalBytes} bytes`)

          response.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            resetIdleTimer(requestUrl)
            if (totalBytes > 0) {
              const progress = Math.round((downloadedBytes / totalBytes) * 100)
              console.log(`Download progress: ${downloadedBytes}/${totalBytes} bytes (${progress}%)`)
              broadcastProgress(progress)
            }
          })

          response.on('end', () => {
            console.log('Download stream ended')
            clearIdleTimer()
          })

          response.on('aborted', () => {
            finalizeError(new Error('Download response was aborted'))
          })

          pipeline(response, fileStream)
            .then(() => {
              if (settled) {
                return
              }

              console.log('Pipeline completed successfully')

              try {
                if (!existsSync(tempFilePath)) {
                  throw new Error('Downloaded file was not created')
                }

                const stats = statSync(tempFilePath)
                if (stats.size === 0) {
                  safeCleanupTempFile()
                  throw new Error('Downloaded file is empty')
                }

                if (totalBytes > 0 && stats.size !== totalBytes) {
                  safeCleanupTempFile()
                  throw new Error(`Downloaded file size (${stats.size}) does not match expected size (${totalBytes})`)
                }

                if (existsSync(filePath)) {
                  rmSync(filePath)
                }

                settled = true
                clearIdleTimer()
                renameSync(tempFilePath, filePath)

                console.log(`Update file validated and moved to ${filePath}`)
                broadcastProgress(100)
                resolve()
              } catch (validationError) {
                console.error('File validation error:', validationError)
                finalizeError(validationError instanceof Error ? validationError : new Error(String(validationError)))
              }
            })
            .catch((error: Error) => {
              if (settled) {
                return
              }
              console.error('Pipeline error:', error)
              finalizeError(error)
            })
        })

        activeRequest = request
        resetIdleTimer(requestUrl)

        request.on('socket', (socket) => {
          socket.setTimeout(this.DOWNLOAD_REQUEST_TIMEOUT_MS)
          socket.on('timeout', () => {
            if (settled) {
              return
            }
            finalizeError(new Error('Download request timed out'))
          })
        })

        request.on('error', (error: Error) => {
          if (settled) {
            return
          }
          finalizeError(error)
        })

        request.on('timeout', () => {
          if (settled) {
            return
          }
          finalizeError(new Error('Download request timed out'))
        })
      }

      makeRequest(url)
    })
  }

  private static shouldRetryDownload(error: Error): boolean {
    const message = error.message.toLowerCase()
    return message.includes('timed out')
      || message.includes('econnreset')
      || message.includes('socket hang up')
      || message.includes('response was aborted')
      || message.includes('pipeline')
  }

  private static async cleanupPartialDownloads(): Promise<void> {
    try {
      if (!existsSync(this.UPDATE_DIR)) {
        return
      }

      const files = readdirSync(this.UPDATE_DIR)
      for (const file of files) {
        if (file.endsWith('.tmp') || file.endsWith('.exe.bak') || file.endsWith('.dmg.bak')) {
          const filePath = join(this.UPDATE_DIR, file)
          try {
            rmSync(filePath)
            console.log(`Cleaned up old file: ${file}`)
          } catch (e) {
            console.warn(`Failed to clean up ${file}:`, e)
          }
        }
      }
    } catch (error) {
      console.warn('Error cleaning up partial downloads:', error)
      // Don't fail if cleanup fails
    }
  }

  private static async cleanupUpdateArtifacts(): Promise<void> {
    if (this.updateArtifactsCleaned) {
      return
    }

    this.updateArtifactsCleaned = true

    try {
      if (!existsSync(this.UPDATE_DIR)) {
        return
      }

      const files = readdirSync(this.UPDATE_DIR)
      const pendingUpdateVersion = this.readPendingUpdateVersion()
      const currentVersion = this.CURRENT_VERSION.replace(/^v/i, '')
      const hasInstalledNewerVersion = pendingUpdateVersion !== null && this.isNewerVersion(currentVersion, pendingUpdateVersion)
      const now = Date.now()

      for (const file of files) {
        const filePath = join(this.UPDATE_DIR, file)
        const shouldDeleteAfterInstall = hasInstalledNewerVersion && this.isUpdateArtifact(file)

        if (!shouldDeleteAfterInstall) {
          const stats = statSync(filePath)
          const isExpired = now - stats.mtimeMs > this.UPDATE_RETENTION_MS
          if (!isExpired || !this.isUpdateArtifact(file)) {
            continue
          }
        }

        try {
          rmSync(filePath, { force: true })
          console.log(`Removed stale update artifact: ${file}`)
        } catch (error) {
          console.warn(`Failed to remove update artifact ${file}:`, error)
        }
      }
    } catch (error) {
      console.warn('Error cleaning update artifacts:', error)
    }
  }

  private static readPendingUpdateVersion(): string | null {
    try {
      const flagFile = join(this.UPDATE_DIR, '.update-pending')
      if (!existsSync(flagFile)) {
        return null
      }

      const content = readFileSync(flagFile, 'utf-8')
      const parsed = JSON.parse(content) as { version?: string }
      return typeof parsed.version === 'string' ? parsed.version.replace(/^v/i, '') : null
    } catch (error) {
      console.warn('Failed to read pending update flag:', error)
      return null
    }
  }

  private static isUpdateArtifact(fileName: string): boolean {
    return fileName === '.update-pending'
      || fileName === 'install-update.sh'
      || fileName === 'install-update.bat'
      || fileName.endsWith('.tmp')
      || fileName.endsWith('.exe')
      || fileName.endsWith('.dmg')
      || fileName.endsWith('.AppImage')
      || fileName.endsWith('.deb')
      || fileName.endsWith('.rpm')
      || fileName.endsWith('.exe.bak')
      || fileName.endsWith('.dmg.bak')
  }

  private static findAssetForPlatform(assets: GitHubRelease['assets']): GitHubRelease['assets'][0] | null {
    const platform = process.platform
    const arch = process.arch

    console.log(`Looking for asset matching platform=${platform}, arch=${arch}`)

    // Look for platform and architecture-specific assets
    for (const asset of assets) {
      if (platform === 'darwin' && asset.name.includes('.dmg')) {
        // For macOS, check architecture
        // arm64 DMG typically includes "arm64" or "aarch64" in name, or "universal" for universal binaries
        // x64 DMG typically includes "x64" or "intel" in name, or may be unnamed (legacy)
        const isArm = asset.name.toLowerCase().includes('arm64') || asset.name.toLowerCase().includes('aarch64')
        const isIntel = asset.name.toLowerCase().includes('x64') || asset.name.toLowerCase().includes('intel')
        const isUniversal = asset.name.toLowerCase().includes('universal')

        if (arch === 'arm64' && (isArm || isUniversal)) {
          console.log(`Found matching ARM64 DMG: ${asset.name}`)
          return asset
        }
        if (arch === 'x64' && (isIntel || isUniversal)) {
          console.log(`Found matching x64 DMG: ${asset.name}`)
          return asset
        }
        // Fallback: if no explicit arch in name but architecture matches requirement
        if (!isArm && !isIntel && arch === 'x64') {
          console.log(`Found generic DMG (assuming x64): ${asset.name}`)
          return asset
        }
      }

      if (platform === 'win32' && asset.name.includes('.exe')) {
        // Windows executables are typically available for both architectures
        const isArm = asset.name.toLowerCase().includes('arm64') || asset.name.toLowerCase().includes('aarch64')
        const isIntel = asset.name.toLowerCase().includes('x64') || asset.name.toLowerCase().includes('ia32')

        if (arch === 'arm64' && isArm) {
          console.log(`Found matching ARM64 executable: ${asset.name}`)
          return asset
        }
        if ((arch === 'x64' || arch === 'ia32') && (isIntel || !isArm)) {
          console.log(`Found matching Windows executable: ${asset.name}`)
          return asset
        }
      }

      if (platform === 'linux' && (asset.name.includes('.AppImage') || asset.name.includes('.deb') || asset.name.includes('.rpm'))) {
        // Linux packages may also have architecture variants
        const isArm = asset.name.toLowerCase().includes('arm64') || asset.name.toLowerCase().includes('aarch64') || asset.name.toLowerCase().includes('armv7')
        const isIntel = asset.name.toLowerCase().includes('x64') || asset.name.toLowerCase().includes('amd64') || asset.name.toLowerCase().includes('ia32')

        if (arch === 'arm64' && isArm) {
          console.log(`Found matching ARM64 package: ${asset.name}`)
          return asset
        }
        if ((arch === 'x64' || arch === 'ia32') && (isIntel || !isArm)) {
          console.log(`Found matching Linux package: ${asset.name}`)
          return asset
        }
      }
    }

    // Fallback: return the first asset if no specific one found
    console.warn(`No exact architecture match found. Falling back to first available asset for platform ${platform}`)
    return assets.length > 0 ? assets[0] : null
  }

  static async applyUpdate(downloadedFile: string, release?: GitHubRelease): Promise<void> {
    try {
      console.log('Applying update...')

      // Store the changelog for display after restart if release data is provided
      if (release) {
        this.storeChangelogForDisplay(release)
      }

      // On macOS, we need to mount the DMG and copy the app
      if (process.platform === 'darwin' && downloadedFile.endsWith('.dmg')) {
        await this.applyMacUpdate(downloadedFile)
      }
      // On Windows, we can directly replace the executable
      else if (process.platform === 'win32' && downloadedFile.endsWith('.exe')) {
        await this.applyWindowsUpdate(downloadedFile)
      }
      // On Linux, handle AppImage or package managers
      else if (process.platform === 'linux') {
        await this.applyLinuxUpdate(downloadedFile)
      }
    } catch (error) {
      console.error('Error applying update:', error)
      throw error
    }
  }

  private static storeChangelogForDisplay(release: GitHubRelease) {
    try {
      const changelogData = {
        version: release.tag_name,
        content: release.body,
        timestamp: new Date().toISOString()
      }

      const changelogDir = join(app.getPath('userData'), 'changelogs')
      if (!existsSync(changelogDir)) {
        mkdirSync(changelogDir, { recursive: true })
      }

      const changelogFile = join(changelogDir, `changelog-${release.tag_name.replace(/\//g, '-')}.json`)
      writeFileSync(changelogFile, JSON.stringify(changelogData, null, 2))

      console.log(`Changelog stored for version ${release.tag_name}`)
    } catch (error) {
      console.error('Error storing changelog:', error)
    }
  }

  private static async applyMacUpdate(dmgPath: string): Promise<void> {
    if (!existsSync(dmgPath)) {
      throw new Error(`Downloaded DMG not found: ${dmgPath}`)
    }

    const opened = await shell.openPath(dmgPath)
    if (opened) {
      throw new Error(`Failed to open downloaded DMG: ${opened}`)
    }

    // Store flag indicating update is pending installation
    this.storePendingUpdateFlag('darwin')
    
    console.log(`Opened macOS update DMG: ${dmgPath}`)
    console.log('User must manually complete the DMG installation in Finder')
  }

  private static async applyWindowsUpdate(exePath: string): Promise<void> {
    if (!existsSync(exePath)) {
      throw new Error(`Downloaded installer not found: ${exePath}`)
    }

    console.log('Preparing Windows update...')
    
    // For Windows, we need to run the installer as admin
    // We'll create a batch script that restarts and runs the installer
    try {
      // Store the installer path for the restart process
      const installerScript = join(this.UPDATE_DIR, 'install-update.bat')
      
      const scriptContent = `@echo off
REM Wait for app to close
timeout /t 2 /nobreak

REM Run the installer with admin rights if available
call :runAs "${exePath}"
exit /b

:runAs
if '%1'=='' exit /b
for /f "tokens=*" %%A in ('whoami /priv ^| find "SeImpersonate"') do (
  REM We have admin rights, run directly
  "${exePath}" /S /D=%ProgramFiles%\\Chatons
  exit /b
)

REM If we get here, run with UAC prompt
powershell -Command "Start-Process '${exePath}' -ArgumentList '/S /D=%ProgramFiles%\\Chatons' -Verb RunAs"
      `
      
      writeFileSync(installerScript, scriptContent)
      
      // Make the script executable and run it
      await execFilePromise('cmd.exe', ['/c', 'start', installerScript], { detached: true } as any)
      
      this.storePendingUpdateFlag('win32')
      console.log('Windows installer will run after app closes')
    } catch (error) {
      console.error('Error setting up Windows update:', error)
      throw new Error(`Failed to prepare Windows update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private static async applyLinuxUpdate(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      throw new Error(`Downloaded installer not found: ${filePath}`)
    }

    console.log('Preparing Linux update...')
    
    try {
      // Check what type of installer we have
      if (filePath.endsWith('.AppImage')) {
        // For AppImage, make it executable and run it
        await execFilePromise('chmod', ['+x', filePath])
        
        // Store path for after restart
        const installerScript = join(this.UPDATE_DIR, 'install-update.sh')
        const scriptContent = `#!/bin/bash
# Wait for app to close
sleep 2

# Run the new version
"${filePath}" &
        `
        
        writeFileSync(installerScript, scriptContent)
        await execFilePromise('chmod', ['+x', installerScript])
        
        this.storePendingUpdateFlag('linux')
        console.log('AppImage update will run after app closes')
      } else if (filePath.endsWith('.deb')) {
        // For deb, use sudo dpkg
        const installerScript = join(this.UPDATE_DIR, 'install-update.sh')
        const scriptContent = `#!/bin/bash
# Wait for app to close
sleep 2

# Install deb package with sudo (may need password)
sudo dpkg -i "${filePath}"
        `
        
        writeFileSync(installerScript, scriptContent)
        await execFilePromise('chmod', ['+x', installerScript])
        
        this.storePendingUpdateFlag('linux')
        console.log('Deb package update will install after app closes')
      } else if (filePath.endsWith('.rpm')) {
        // For rpm, use sudo rpm
        const installerScript = join(this.UPDATE_DIR, 'install-update.sh')
        const scriptContent = `#!/bin/bash
# Wait for app to close
sleep 2

# Install rpm package with sudo (may need password)
sudo rpm -i "${filePath}"
        `
        
        writeFileSync(installerScript, scriptContent)
        await execFilePromise('chmod', ['+x', installerScript])
        
        this.storePendingUpdateFlag('linux')
        console.log('RPM package update will install after app closes')
      } else {
        throw new Error(`Unsupported Linux installer format: ${filePath}`)
      }
    } catch (error) {
      console.error('Error setting up Linux update:', error)
      throw new Error(`Failed to prepare Linux update: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private static storePendingUpdateFlag(platform: string): void {
    try {
      const flagFile = join(this.UPDATE_DIR, '.update-pending')
      const flagData = {
        platform,
        timestamp: new Date().toISOString(),
        version: this.CURRENT_VERSION
      }
      writeFileSync(flagFile, JSON.stringify(flagData, null, 2))
      console.log('Stored pending update flag')
    } catch (error) {
      console.warn('Failed to store pending update flag:', error)
    }
  }

  static async restartApp(): Promise<void> {
    // macOS DMG installs are user-driven after the DMG opens, so keep the app running.
    // The user will complete the installation manually in Finder
    if (process.platform === 'darwin') {
      console.log('DMG is open - user must complete installation manually')
      return
    }

    // For Windows and Linux, restart the app to complete the installation
    console.log('Restarting app to complete update installation...')
    app.relaunch()
    app.quit()
  }

  static async readChangelogFromFile(version: string): Promise<{version: string, content: string} | null> {
    try {
      const changelogDir = join(app.getPath('userData'), 'changelogs')
      if (!existsSync(changelogDir)) {
        return null
      }

      // Try to find a changelog file for this version
      // Files are stored with v prefix (e.g. changelog-v0.133.0.json)
      // but version may arrive without it, so match both formats
      const files = readdirSync(changelogDir)
      const normalizedVersion = version.replace(/^v/i, '')
      const versionPattern = new RegExp(`^changelog-v?${JSON.stringify(normalizedVersion).slice(1, -1)}(?:\\.|$)`)

      const changelogFile = files.find(file => versionPattern.test(file))

      if (changelogFile) {
        const filePath = join(changelogDir, changelogFile)
        const content = readFileSync(filePath, 'utf-8')
        const changelogData = JSON.parse(content)
        return {
          version: changelogData.version,
          content: changelogData.content
        }
      }

      return null
    } catch (error) {
      console.error('Error reading changelog file:', error)
      return null
    }
  }

  static async prefetchAndStoreChangelogs(): Promise<void> {
    try {
      if (this.changelogsPrefetched) {
        console.log('Skipping changelog prefetch: already prefetched this session')
        return
      }

      console.log('Prefetching changelogs from GitHub...')
      const releases = await this.fetchReleases()
      
      const changelogDir = join(app.getPath('userData'), 'changelogs')
      if (!existsSync(changelogDir)) {
        mkdirSync(changelogDir, { recursive: true })
      }

      // Store changelogs for all releases
      for (const release of releases) {
        const changelogData = {
          version: release.tag_name,
          content: release.body,
          timestamp: new Date().toISOString()
        }

        const changelogFile = join(changelogDir, `changelog-${release.tag_name.replace(/\//g, '-')}.json`)
        
        // Only write if file doesn't exist or if content is different
        try {
          if (existsSync(changelogFile)) {
            const existingContent = readFileSync(changelogFile, 'utf-8')
            const existingData = JSON.parse(existingContent)
            if (existingData.content === changelogData.content) {
              continue // Skip if content is the same
            }
          }
          
          writeFileSync(changelogFile, JSON.stringify(changelogData, null, 2))
          console.log(`Changelog stored/updated for version ${release.tag_name}`)
        } catch (error) {
          console.error(`Error storing changelog for version ${release.tag_name}:`, error)
        }
      }
      
      console.log('Changelog prefetch completed')
      this.changelogsPrefetched = true
    } catch (error) {
      console.error('Error prefetching changelogs:', error)
    }
  }

  static async fetchAndStoreChangelogForVersion(version: string): Promise<{version: string, content: string} | null> {
    try {
      console.log(`Fetching changelog for version ${version} from GitHub...`)

      const directRelease = await this.fetchReleaseByTag(version)
      if (directRelease) {
        const changelogData = {
          version: directRelease.tag_name,
          content: directRelease.body,
          timestamp: new Date().toISOString()
        }

        const changelogDir = join(app.getPath('userData'), 'changelogs')
        if (!existsSync(changelogDir)) {
          mkdirSync(changelogDir, { recursive: true })
        }

        const changelogFile = join(changelogDir, `changelog-${directRelease.tag_name.replace(/\//g, '-')}.json`)
        writeFileSync(changelogFile, JSON.stringify(changelogData, null, 2))
        console.log(`Changelog fetched directly and stored for version ${directRelease.tag_name}`)

        return {
          version: changelogData.version,
          content: changelogData.content
        }
      }

      const releases = await this.fetchReleases()
      
      // Normalize version for comparison (handle v prefix and ensure consistent format)
      const normalizeVersion = (v: string) => v.replace(/^v/, '').trim().toLowerCase()
      const normalizedVersion = normalizeVersion(version)
      
      // Fall back to scanning releases when the direct tag lookup does not resolve.
      const targetRelease = releases.find(release => {
        const tagNormalized = normalizeVersion(release.tag_name)
        const nameNormalized = normalizeVersion(release.name)
        
        return tagNormalized === normalizedVersion || nameNormalized === normalizedVersion
      })
      
      if (!targetRelease) {
        console.log(`No release found for version ${version}. Available releases:`, releases.slice(0, 5).map(r => r.tag_name))
        return null
      }
      
      const changelogData = {
        version: targetRelease.tag_name,
        content: targetRelease.body,
        timestamp: new Date().toISOString()
      }
      
      // Store the changelog
      const changelogDir = join(app.getPath('userData'), 'changelogs')
      if (!existsSync(changelogDir)) {
        mkdirSync(changelogDir, { recursive: true })
      }
      
      const changelogFile = join(changelogDir, `changelog-${targetRelease.tag_name.replace(/\//g, '-')}.json`)
      writeFileSync(changelogFile, JSON.stringify(changelogData, null, 2))
      console.log(`Changelog fetched and stored for version ${targetRelease.tag_name}`)
      
      return {
        version: changelogData.version,
        content: changelogData.content
      }
    } catch (error) {
      console.error(`Error fetching changelog for version ${version}:`, error)
      return null
    }
  }
}
