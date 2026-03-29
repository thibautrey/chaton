import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync, createWriteStream, writeFileSync, readdirSync, readFileSync } from 'fs'
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

  static async checkForUpdates(): Promise<GitHubRelease | null> {
    try {
      const releases = await this.fetchReleases()
      const latestRelease = releases[0]
      
      if (!latestRelease) {
        console.log('No releases found')
        return null
      }

      const latestVersion = latestRelease.tag_name.replace('v', '')
      console.log(`Current version: ${this.CURRENT_VERSION}, Latest version: ${latestVersion}`)

      if (this.isNewerVersion(latestVersion, this.CURRENT_VERSION)) {
        console.log('New update available:', latestRelease.name)
        return latestRelease
      }

      console.log('No updates available')
      return null
    } catch (error) {
      console.error('Error checking for updates:', error)
      return null
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

      const req = https.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const releases = JSON.parse(data)
              resolve(releases)
            } catch {
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

      await new Promise<void>((resolve, reject) => {
        const fileStream = createWriteStream(filePath)
        const request = https.get(downloadUrl, (response) => {
          if (response.statusCode !== 200) {
            fileStream.close()
            reject(new Error(`Failed to download file: HTTP ${response.statusCode}`))
            return
          }

          pipeline(response, fileStream)
            .then(() => resolve())
            .catch((error: Error) => reject(error))
        })

        request.on('error', (error: Error) => {
          fileStream.close()
          reject(error)
        })
      })
      console.log(`Update downloaded to ${filePath}`)
      return filePath
    } catch (error) {
      console.error('Error downloading update:', error)
      throw error
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

  static async applyUpdate(downloadedFile: string, release: GitHubRelease): Promise<void> {
    try {
      console.log('Applying update...')
      
      // Store the changelog for display after restart
      this.storeChangelogForDisplay(release)
      
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

  private static storeChangelogForDisplay(release: GitHubRelease): void {
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
      // Files are stored with v prefix (e.g. changelog-v0.133.0.json)
      // but version may arrive without it, so match both formats
      const files = readdirSync(changelogDir)
      const normalizedVersion = version.replace(/^v/i, '')
      // Escape special regex characters to prevent injection
      const escapedVersion = normalizedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const versionPattern = new RegExp(`^changelog-v?${escapedVersion}(?:\\.|$)`)
      
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
}

export const readChangelogFromFile = UpdateService.readChangelogFromFile.bind(UpdateService)
