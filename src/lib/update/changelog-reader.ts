// This file is for the renderer process and provides a way to read changelogs
// that works in the browser environment

export async function readChangelogFromFile(version: string): Promise<{version: string, content: string} | null> {
  try {
    if (!window.electron?.ipcRenderer) {
      console.warn('Electron IPC bridge not available; skipping changelog file read')
      return null
    }

    // In the renderer process, we'll use the Electron IPC to communicate with the main process
    // to read the changelog files
    const { ipcRenderer } = window.electron
    
    const changelogData = await ipcRenderer.invoke('read-changelog', version)
    
    if (changelogData) {
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
