import electron from 'electron';
const { ipcMain, app } = electron;
import { UpdateService } from '../lib/update/update-service.js'
import { join, basename } from 'path'
import { existsSync, readdirSync } from 'fs'

export function registerUpdateIpc() {
  ipcMain.handle('check-for-updates', async () => {
    try {
      const release = await UpdateService.checkForUpdates()
      
      if (release) {
        return {
          available: true,
          version: release.tag_name,
          releaseNotes: release.body,
          publishedAt: release.published_at
        }
      }
      
      return { available: false }
    } catch (error) {
      console.error('Error in check-for-updates handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return { available: false, error: errorMessage }
    }
  })

  ipcMain.handle('download-update', async () => {
    try {
      const release = await UpdateService.checkForUpdates()
      
      if (!release) {
        throw new Error('No updates available')
      }

      const downloadedFile = await UpdateService.downloadUpdate(release)
      
      return { success: true, filePath: downloadedFile }
    } catch (error) {
      console.error('Error in download-update handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('apply-update', async (event, releaseData) => {
    try {
      // The download service saves the file with the original asset name.
      // Recompute the expected filename from the selected release so apply uses
      // the same path as the downloader instead of guessing from the directory contents.
      const updateDir = join(app.getPath('userData'), 'updates')

      if (!existsSync(updateDir)) {
        console.log('No update directory found - no update has been downloaded yet')
        return { success: false, error: 'No downloaded update found. Please download the update first.' }
      }

      const asset = releaseData?.assets ? (UpdateService as any).findAssetForPlatform(releaseData.assets) : null
      const downloadedFile = asset?.name

      if (!downloadedFile) {
        const files = readdirSync(updateDir)
        const fallbackFile = files.find(file =>
          file.endsWith('.dmg') ||
          file.endsWith('.exe') ||
          file.endsWith('.AppImage') ||
          file.endsWith('.deb') ||
          file.endsWith('.rpm')
        ) || files[0]

        if (!fallbackFile) {
          console.error('No downloaded update file found in:', updateDir)
          return { success: false, error: 'No downloaded update found. Please download the update first.' }
        }

        const fullPath = join(updateDir, fallbackFile)
        console.log(`Applying update from fallback file: ${fullPath}`)

        if (existsSync(fullPath)) {
          await UpdateService.applyUpdate(fullPath, releaseData)
          await UpdateService.restartApp()
          return { success: true }
        }

        console.error('Downloaded fallback file not found:', fullPath)
        return { success: false, error: 'No downloaded update found. Please download the update first.' }
      }
      
      const fullPath = join(updateDir, downloadedFile)
      console.log(`Applying update from file: ${fullPath}`)
      
      if (existsSync(fullPath)) {
        await UpdateService.applyUpdate(fullPath, releaseData)
        await UpdateService.restartApp()
      } else {
        console.error('Downloaded file not found:', fullPath)
        throw new Error('Downloaded update file not found')
      }
      
      return { success: true }
    } catch (error) {
      console.error('Error in apply-update handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('read-changelog', async (event, version: string) => {
    try {
      return await UpdateService.readChangelogFromFile(version)
    } catch (error) {
      console.error('Error in read-changelog handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return null
    }
  })

  ipcMain.handle('fetch-changelog', async (event, version: string) => {
    try {
      return await UpdateService.fetchAndStoreChangelogForVersion(version)
    } catch (error) {
      console.error('Error in fetch-changelog handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return null
    }
  })
}
