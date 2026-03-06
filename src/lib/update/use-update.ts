import { useState, useEffect } from 'react'

interface UpdateInfo {
  available: boolean
  version: string
  releaseNotes: string
  downloading: boolean
  downloadProgress: number
  error: string | null
}

declare global {
  interface Window {
    updater: {
      checkForUpdates: () => Promise<any>
      downloadUpdate: () => Promise<any>
      applyUpdate: (release: any) => Promise<any>
      onDownloadProgress: (listener: (progress: number) => void) => () => void
    }
  }
}

export function useUpdate() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    version: '',
    releaseNotes: '',
    downloading: false,
    downloadProgress: 0,
    error: null
  })

  const checkForUpdates = async () => {
    try {
      if (!window.updater) {
        console.warn('Updater API not available')
        return
      }

      const result = await window.updater.checkForUpdates()
      if (result && result.available) {
        setUpdateInfo({
          available: true,
          version: result.version,
          releaseNotes: result.releaseNotes,
          downloading: false,
          downloadProgress: 0,
          error: null
        })
      }
    } catch (error) {
      console.error('Error checking for updates:', error)
    }
  }

  const downloadUpdate = async () => {
    try {
      if (!window.updater) {
        console.warn('Updater API not available')
        return
      }

      setUpdateInfo(prev => ({ ...prev, downloading: true, downloadProgress: 0 }))

      // Set up progress listener
      const removeProgressListener = window.updater.onDownloadProgress((progress) => {
        setUpdateInfo(prev => ({ ...prev, downloadProgress: progress, error: null }))
      })

      try {
        const release = await window.updater.checkForUpdates()
        if (!release || !release.available) {
          throw new Error('No updates available')
        }

        const downloadResult = await window.updater.downloadUpdate()
        if (!downloadResult || !downloadResult.success) {
          throw new Error(downloadResult?.error || 'Failed to download update')
        }

        const applyResult = await window.updater.applyUpdate(release)
        if (!applyResult || !applyResult.success) {
          throw new Error(applyResult?.error || 'Failed to apply update')
        }
      } finally {
        removeProgressListener()
      }
    } catch (error) {
      console.error('Error downloading or applying update:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Update error details:', errorMessage)
      setUpdateInfo(prev => ({ ...prev, downloading: false, error: errorMessage }))
    }
  }

  useEffect(() => {
    // Check for updates when component mounts, only once per app load.
    if (import.meta.env.DEV) {
      return
    }

    if (typeof sessionStorage === 'undefined') {
      checkForUpdates()
      return
    }

    const storageKey = 'chaton.updateCheckAt'
    const existing = sessionStorage.getItem(storageKey)
    if (!existing) {
      sessionStorage.setItem(storageKey, new Date().toISOString())
      checkForUpdates()
      return
    }

    // No-op: already checked this session.
  }, [])

  const retryDownload = async () => {
    setUpdateInfo(prev => ({ ...prev, error: null }))
    await downloadUpdate()
  }

  return {
    updateInfo,
    checkForUpdates,
    downloadUpdate,
    retryDownload
  }
}
