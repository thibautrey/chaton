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
      // The download service saves the file with the original asset name
      // We need to find the downloaded file in the UPDATE_DIR
      const updateDir = join(app.getPath('userData'), 'updates')
      
      // List files in the update directory to find the downloaded file
      const files = readdirSync(updateDir)
      const downloadedFile = files.find(file => file.endsWith('.dmg') || file.endsWith('.exe') || file.endsWith('.AppImage') || file.endsWith('.deb') || file.endsWith('.rpm'))
      
      if (!downloadedFile) {
        console.error('No downloaded update file found in:', updateDir)
        throw new Error('Downloaded update file not found')
      }
      
      const fullPath = join(updateDir, downloadedFile)
      console.log(`Applying update from file: ${fullPath}`)
      
      if (existsSync(fullPath)) {
        await UpdateService.applyUpdate(fullPath)
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
}
