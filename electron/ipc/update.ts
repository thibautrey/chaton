import electron from 'electron';
const { ipcMain, app } = electron;
import { UpdateService } from '../lib/update/update-service.js'
import { join } from 'path'
import { existsSync } from 'fs'

function getUserFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    
    // Provide user-friendly messages for common errors
    if (message.includes('HTTP 404')) {
      return 'The update file was not found on the server. Please try again later.';
    }
    if (message.includes('HTTP 403')) {
      return 'Access to the update file is forbidden. Please try again later.';
    }
    if (message.includes('HTTP 500') || message.includes('HTTP 502') || message.includes('HTTP 503')) {
      return 'The update server is currently unavailable. Please try again later.';
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return 'Unable to connect to the update server. Please check your internet connection.';
    }
    if (message.includes('ETIMEDOUT') || message.includes('timed out')) {
      return 'Connection to update server timed out. Please check your internet connection.';
    }
    if (message.includes('No suitable asset')) {
      return `No update available for your platform (${process.platform}). Please check the releases page.`;
    }
    if (message.includes('Too many redirects')) {
      return 'Too many redirects while downloading the update. Please try again later.';
    }
    if (message.includes('ENOSPC')) {
      return 'Not enough disk space to download the update. Please free up some space and try again.';
    }
    if (message.includes('does not match expected size')) {
      return 'Downloaded file appears to be corrupted or incomplete. Please try downloading again.';
    }
    if (message.includes('empty')) {
      return 'Download was incomplete (empty file). Please try again.';
    }
    
    return message;
  }
  
  return 'An unknown error occurred while checking for updates.';
}

// Store downloaded file info for apply-update handler
interface DownloadedUpdateInfo {
  filePath: string
  release: any
  timestamp: number
}
let lastDownloadedUpdate: DownloadedUpdateInfo | null = null

export function registerUpdateIpc() {
  ipcMain.handle('check-for-updates', async () => {
    try {
      const release = await UpdateService.checkForUpdates()
      
      if (release) {
        return {
          available: true,
          version: release.tag_name,
          releaseNotes: release.body,
          publishedAt: release.published_at,
          assets: release.assets
        }
      }
      
      return { available: false }
    } catch (error) {
      console.error('Error in check-for-updates handler:', error)
      const errorMessage = getUserFriendlyError(error)
      console.error('Check update error details:', { message: errorMessage, original: error instanceof Error ? error.message : String(error) })
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
      
      // Store info for later apply
      lastDownloadedUpdate = {
        filePath: downloadedFile,
        release: release,
        timestamp: Date.now()
      }
      
      return { success: true, filePath: downloadedFile }
    } catch (error) {
      console.error('Error in download-update handler:', error)
      const errorMessage = getUserFriendlyError(error)
      console.error('Download error details:', { message: errorMessage, original: error instanceof Error ? error.message : String(error) })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle('apply-update', async (event, releaseData) => {
    try {
      // Use the stored download info if available (more reliable than reconstruction)
      if (!lastDownloadedUpdate || Date.now() - lastDownloadedUpdate.timestamp > 3600000) {
        // More than 1 hour old, might be stale
        throw new Error('Update was downloaded more than an hour ago. Please download again.')
      }

      const filePath = lastDownloadedUpdate.filePath
      const release = lastDownloadedUpdate.release

      if (!existsSync(filePath)) {
        console.error('Downloaded file not found:', filePath)
        throw new Error('Downloaded update file not found. Please download the update again.')
      }

      console.log(`Applying update from file: ${filePath}`)
      
      await UpdateService.applyUpdate(filePath, release)
      await UpdateService.restartApp()
      
      return { success: true }
    } catch (error) {
      console.error('Error in apply-update handler:', error)
      const errorMessage = getUserFriendlyError(error)
      console.error('Apply update error details:', { message: errorMessage, original: error instanceof Error ? error.message : String(error) })
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
      console.log(`IPC: fetch-changelog handler called for version ${version}`)
      const result = await UpdateService.fetchAndStoreChangelogForVersion(version)
      if (!result) {
        console.warn(`IPC: No changelog found for version ${version}`)
      }
      return result
    } catch (error) {
      console.error('Error in fetch-changelog handler:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error details:', { message: errorMessage, stack: error instanceof Error ? error.stack : undefined })
      return null
    }
  })
}
