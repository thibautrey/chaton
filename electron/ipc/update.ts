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

      if (!existsSync(updateDir)) {
        console.log('No update directory found - no update has been downloaded yet')
        return { success: false, error: 'No downloaded update found. Please download the update first.' }
      }
      
      // List files in the update directory to find the downloaded file
      const files = readdirSync(updateDir)
      
      if (files.length === 0) {
        console.error('No downloaded update file found in:', updateDir)
        throw new Error('Downloaded update file not found')
      }
      
      // Find the most recently downloaded file by looking for common update file extensions
      const downloadedFile = files.find(file => 
        file.endsWith('.dmg') || 
        file.endsWith('.exe') || 
        file.endsWith('.AppImage') || 
        file.endsWith('.deb') || 
        file.endsWith('.rpm')
      ) || files[0] // Fallback to first file if no matching extension found
      
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
