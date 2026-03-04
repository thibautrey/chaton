import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
})

contextBridge.exposeInMainWorld('chaton', {
  platform: process.platform,
  pickProjectFolder: () => ipcRenderer.invoke('dialog:pickProjectFolder') as Promise<string | null>,
  importProjectFromFolder: (folderPath: string) => ipcRenderer.invoke('projects:importFromFolder', folderPath),
  deleteProject: (projectId: string) => ipcRenderer.invoke('projects:delete', projectId),
  getInitialState: () => ipcRenderer.invoke('workspace:getInitialState'),
  updateSettings: (settings: unknown) => ipcRenderer.invoke('workspace:updateSettings', settings),
  createConversationForProject: (
    projectId: string,
    options?: { modelProvider?: string; modelId?: string; thinkingLevel?: string },
  ) => ipcRenderer.invoke('conversations:createForProject', projectId, options),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('conversations:delete', conversationId),
  listPiModels: () => ipcRenderer.invoke('models:listPi'),
  syncPiModels: () => ipcRenderer.invoke('models:syncPi'),
  setPiModelScoped: (provider: string, id: string, scoped: boolean) =>
    ipcRenderer.invoke('models:setPiScoped', provider, id, scoped),
  getPiConfigSnapshot: () => ipcRenderer.invoke('pi:getConfigSnapshot'),
  updatePiSettingsJson: (next: unknown) => ipcRenderer.invoke('pi:updateSettingsJson', next),
  updatePiModelsJson: (next: unknown) => ipcRenderer.invoke('pi:updateModelsJson', next),
  runPiCommand: (action: unknown, params: unknown) => ipcRenderer.invoke('pi:runCommand', action, params),
  getPiDiagnostics: () => ipcRenderer.invoke('pi:getDiagnostics'),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  installExtension: (id: string) => ipcRenderer.invoke('extensions:install', id),
  toggleExtension: (id: string, enabled: boolean) => ipcRenderer.invoke('extensions:toggle', id, enabled),
  removeExtension: (id: string) => ipcRenderer.invoke('extensions:remove', id),
  runExtensionHealthCheck: () => ipcRenderer.invoke('extensions:runHealthCheck'),
  getExtensionLogs: (id: string) => ipcRenderer.invoke('extensions:getLogs', id),
  openPath: (target: unknown) => ipcRenderer.invoke('pi:openPath', target),
  exportPiSessionHtml: (sessionFile: unknown, outputFile: unknown) =>
    ipcRenderer.invoke('pi:exportSessionHtml', sessionFile, outputFile),
  getConversationMessageCache: (conversationId: string) => ipcRenderer.invoke('conversations:getMessageCache', conversationId),
  requestConversationAutoTitle: (conversationId: string, firstMessage: string) =>
    ipcRenderer.invoke('conversations:requestAutoTitle', conversationId, firstMessage),
  piStartSession: (conversationId: string) => ipcRenderer.invoke('pi:startSession', conversationId),
  piStopSession: (conversationId: string) => ipcRenderer.invoke('pi:stopSession', conversationId),
  piSendCommand: (conversationId: string, command: unknown) => ipcRenderer.invoke('pi:sendCommand', conversationId, command),
  piGetSnapshot: (conversationId: string) => ipcRenderer.invoke('pi:getSnapshot', conversationId),
  piRespondExtensionUi: (conversationId: string, response: unknown) =>
    ipcRenderer.invoke('pi:respondExtensionUi', conversationId, response),
  onPiEvent: (listener: (event: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload)
    ipcRenderer.on('pi:event', wrapped)
    return () => {
      ipcRenderer.removeListener('pi:event', wrapped)
    }
  },
  onConversationUpdated: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload)
    ipcRenderer.on('workspace:conversationUpdated', wrapped)
    return () => {
      ipcRenderer.removeListener('workspace:conversationUpdated', wrapped)
    }
  },
  getLanguagePreference: () => ipcRenderer.invoke('settings:getLanguagePreference'),
  updateLanguagePreference: (language: string) => ipcRenderer.invoke('settings:updateLanguagePreference', language),
})
