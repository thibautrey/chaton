import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
})

contextBridge.exposeInMainWorld('dashboard', {
  platform: process.platform,
  pickProjectFolder: () => ipcRenderer.invoke('dialog:pickProjectFolder') as Promise<string | null>,
  importProjectFromFolder: (folderPath: string) => ipcRenderer.invoke('projects:importFromFolder', folderPath),
  getInitialState: () => ipcRenderer.invoke('workspace:getInitialState'),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('workspace:updateSettings', settings),
})
