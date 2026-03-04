import { useState, useEffect } from 'react'

interface UpdateInfo {
  available: boolean
  version: string
  releaseNotes: string
  downloading: boolean
  downloadProgress: number
}

declare global {
  interface Window {
    updater: {
      checkForUpdates: () => Promise<any>
      downloadUpdate: () => Promise<any>
      applyUpdate: () => Promise<any>
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
    downloadProgress: 0
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
          downloadProgress: 0
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
        setUpdateInfo(prev => ({ ...prev, downloadProgress: progress }))
      })

      try {
        const release = await window.updater.checkForUpdates()
        await window.updater.downloadUpdate()
        await window.updater.applyUpdate(release)
      } finally {
        removeProgressListener()
      }
    } catch (error) {
      console.error('Error downloading or applying update:', error)
      setUpdateInfo(prev => ({ ...prev, downloading: false }))
    }
  }

  useEffect(() => {
    // Check for updates when component mounts
    checkForUpdates()
  }, [])

  return {
    updateInfo,
    checkForUpdates,
    downloadUpdate
  }
}
