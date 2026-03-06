import electron from 'electron';
const { app, ipcMain, BrowserWindow } = electron;
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, createWriteStream, readdirSync, readFileSync, writeFileSync } from 'fs'
import https from 'https'
import { promisify } from 'util'
import { pipeline as streamPipeline } from 'stream'

const pipeline = promisify(streamPipeline)

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

export class UpdateService {
  private static readonly REPO_OWNER = 'thibautrey'
  private static readonly REPO_NAME = 'chaton'
  private static readonly UPDATE_DIR = join(app.getPath('userData'), 'updates')
  private static readonly CURRENT_VERSION = app.getVersion() || '0.1.0'
  private static lastUpdateCheckAt: number | null = null
  private static cachedUpdateCheck: GitHubRelease | null = null
  private static updateCheckInFlight: Promise<GitHubRelease | null> | null = null

  static async checkForUpdates(): Promise<GitHubRelease | null> {
    if (this.lastUpdateCheckAt) {
      console.log('Update check already performed this session; using cached result')
      return this.cachedUpdateCheck
    }

    if (this.updateCheckInFlight) {
      return this.updateCheckInFlight
    }

    this.updateCheckInFlight = (async () => {
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
    })()

    try {
      const result = await this.updateCheckInFlight
      this.cachedUpdateCheck = result
      this.lastUpdateCheckAt = Date.now()
      return result
    } catch (error) {
      console.error('Error checking for updates:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Check update error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      this.cachedUpdateCheck = null
      this.lastUpdateCheckAt = Date.now()
      throw new Error(`Failed to check for updates: ${errorMessage}`)
    } finally {
      this.updateCheckInFlight = null
    }
  }

  private static async fetchReleases(): Promise<GitHubRelease[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.REPO_OWNER}/${this.REPO_NAME}/releases`,
        headers: {
          'User-Agent': 'Chatons-Update-Checker',
          'Accept': 'application/vnd.github.v3+json'
        }
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
          } else {
            reject(new Error(`GitHub API returned status ${res.statusCode}`))
          }
        })
      })

      req.on('error', (error: Error) => {
        reject(error)
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
      // Create updates directory if it doesn't exist
      if (!existsSync(this.UPDATE_DIR)) {
        mkdirSync(this.UPDATE_DIR, { recursive: true })
      }

      // Find the appropriate asset for the current platform
      const asset = this.findAssetForPlatform(release.assets)
      if (!asset) {
        throw new Error('No suitable asset found for this platform')
      }

      const downloadUrl = asset.browser_download_url
      const filePath = join(this.UPDATE_DIR, asset.name)

      console.log(`Downloading update from ${downloadUrl}`)

      // Use native https with manual redirect handling
      await new Promise<void>((resolve, reject) => {
        let fileStream = createWriteStream(filePath)
        let downloadedBytes = 0
        let totalBytes = 0
        let redirectCount = 0
        const maxRedirects = 5

        const makeRequest = (url: string) => {
          // Prevent infinite redirect loops
          if (redirectCount >= maxRedirects) {
            fileStream.close()
            reject(new Error('Too many redirects'))
            return
          }

          console.log(`Making request to: ${url}`)
          const request = https.get(url, (response) => {
            // Handle redirects (301, 302, 303, 307, 308)
            if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
              const redirectUrl = response.headers.location
              if (redirectUrl) {
                console.log(`Following redirect to: ${redirectUrl}`)
                fileStream.close()
                // Create a new file stream for the redirected request
                fileStream = createWriteStream(filePath)
                downloadedBytes = 0  // Reset byte counter for new request

                // Handle relative redirects by combining with original URL
                let finalRedirectUrl = redirectUrl
                try {
                  const redirectUrlObj = new URL(redirectUrl, url)
                  finalRedirectUrl = redirectUrlObj.toString()
                } catch (e) {
                  console.error('Failed to parse redirect URL:', e)
                  reject(new Error('Invalid redirect URL'))
                  return
                }

                redirectCount++
                makeRequest(finalRedirectUrl)
                return
              }
            }

            if (response.statusCode !== 200) {
              fileStream.close()
              reject(new Error(`Failed to download file: HTTP ${response.statusCode}`))
              return
            }

            // Get content length from the final (non-redirect) response
            totalBytes = parseInt(response.headers['content-length'] || '0', 10)
            console.log(`Starting download of ${totalBytes} bytes`)

            response.on('data', (chunk: Buffer) => {
              downloadedBytes += chunk.length
              if (totalBytes > 0) {
                const progress = Math.round((downloadedBytes / totalBytes) * 100)
                console.log(`Download progress: ${downloadedBytes}/${totalBytes} bytes (${progress}%)`)
                // Send progress to all windows
                for (const window of BrowserWindow.getAllWindows()) {
                  window.webContents.send('download-progress', progress)
                }
              }
            })

            response.on('end', () => {
              console.log('Download stream ended')
            })

            pipeline(response, fileStream)
              .then(() => {
                console.log('Pipeline completed successfully')
                // Ensure final progress is 100%
                for (const window of BrowserWindow.getAllWindows()) {
                  window.webContents.send('download-progress', 100)
                }
                resolve()
              })
              .catch((error: Error) => {
                console.error('Pipeline error:', error)
                reject(error)
              })
          })

          request.on('error', (error: Error) => {
            fileStream.close()
            reject(error)
          })
        }

        makeRequest(downloadUrl)
      })
      console.log(`Update downloaded to ${filePath}`)
      // Ensure final progress is 100%
      ipcMain.emit('download-progress', 100)
      return filePath
    } catch (error) {
      console.error('Error downloading update:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Download error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      throw new Error(`Failed to download update: ${errorMessage}`)
    }
  }

  private static findAssetForPlatform(assets: GitHubRelease['assets']): GitHubRelease['assets'][0] | null {
    const platform = process.platform

    // Look for platform-specific assets
    for (const asset of assets) {
      if (platform === 'darwin' && asset.name.includes('.dmg')) {
        return asset
      }
      if (platform === 'win32' && asset.name.includes('.exe')) {
        return asset
      }
      if (platform === 'linux' && (asset.name.includes('.AppImage') || asset.name.includes('.deb') || asset.name.includes('.rpm'))) {
        return asset
      }
    }

    // Fallback: return the first asset if no specific one found
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
    return new Promise((resolve) => {
      // For macOS, we'll use a simple approach: notify the user to install the DMG
      // In a real implementation, you might use applescript or other methods to mount and copy
      console.log('Mac update would be applied here')

      // Clean up the downloaded file
      if (existsSync(dmgPath)) {
        rmSync(dmgPath)
      }

      resolve()
    })
  }

  private static async applyWindowsUpdate(exePath: string): Promise<void> {
    return new Promise((resolve) => {
      // For Windows, we would replace the current executable
      // This is complex and usually requires a separate updater process
      console.log('Windows update would be applied here')

      // Clean up the downloaded file
      if (existsSync(exePath)) {
        rmSync(exePath)
      }

      resolve()
    })
  }

  private static async applyLinuxUpdate(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      // For Linux, handle AppImage or package updates
      console.log('Linux update would be applied here')

      // Clean up the downloaded file
      if (existsSync(filePath)) {
        rmSync(filePath)
      }

      resolve()
    })
  }

  static async restartApp(): Promise<void> {
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
      const files = readdirSync(changelogDir)
      const versionPattern = new RegExp(`changelog-${version.replace(/\./g, '\\.')}`)

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
      if (this.lastUpdateCheckAt) {
        console.log('Skipping changelog prefetch: update check already performed this session')
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
    } catch (error) {
      console.error('Error prefetching changelogs:', error)
    }
  }

  static async fetchAndStoreChangelogForVersion(version: string): Promise<{version: string, content: string} | null> {
    try {
      console.log(`Fetching changelog for version ${version} from GitHub...`)
      const releases = await this.fetchReleases()
      
      // Find the release that matches the version
      const targetRelease = releases.find(release => 
        release.tag_name === version || 
        release.tag_name === `v${version}` || 
        release.name === version || 
        release.name === `v${version}`
      )
      
      if (!targetRelease) {
        console.log(`No release found for version ${version}`)
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
