// This file is for the renderer process and provides a way to read changelogs
// that works in the browser environment

type ChangelogData = {
  version: string
  content: string
}

export async function readChangelogFromFile(version: string): Promise<ChangelogData | null> {
  try {
    if (!window.electron?.ipcRenderer) {
      console.warn('Electron IPC bridge not available; skipping changelog file read')
      return null
    }

    // In the renderer process, we'll use the Electron IPC to communicate with the main process
    // to read the changelog files
    const { ipcRenderer } = window.electron
    
    const changelogData = await ipcRenderer.invoke('read-changelog', version) as ChangelogData | null

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

export async function fetchChangelogFromGitHub(version: string): Promise<ChangelogData | null> {
  try {
    if (!window.electron?.ipcRenderer) {
      console.warn('Electron IPC bridge not available; cannot fetch changelog from GitHub')
      return null
    }

    const { ipcRenderer } = window.electron
    
    const changelogData = await ipcRenderer.invoke('fetch-changelog', version) as ChangelogData | null

    if (changelogData) {
      return {
        version: changelogData.version,
        content: changelogData.content
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching changelog from GitHub:', error)
    return null
  }
}
