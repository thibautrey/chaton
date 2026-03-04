import { ipcMain } from 'electron'
import { UpdateService } from '../lib/update/update-service.js'

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
      // Get the latest release data
      const release = await UpdateService.checkForUpdates()
      
      if (release) {
        // In a real implementation, we would apply the update here
        // For now, we'll store the changelog and restart the app to simulate the update
        await UpdateService.applyUpdate('')
        await UpdateService.restartApp()
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
