import electron from "electron";
const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  isWindowFocused: () => ipcRenderer.invoke("window:isFocused"),
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke("window:showNotification", title, body),
});

contextBridge.exposeInMainWorld("electronAPI", {
  closeWindow: () => ipcRenderer.invoke("window:close"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
});

contextBridge.exposeInMainWorld("chaton", {
  platform: process.platform,
  pickProjectFolder: () =>
    ipcRenderer.invoke("dialog:pickProjectFolder") as Promise<string | null>,
  importProjectFromFolder: (folderPath: string) =>
    ipcRenderer.invoke("projects:importFromFolder", folderPath),
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke("projects:delete", projectId),
  getInitialState: () => ipcRenderer.invoke("workspace:getInitialState"),
  getGitDiffSummary: (conversationId: string) =>
    ipcRenderer.invoke("workspace:getGitDiffSummary", conversationId),
  getGitFileDiff: (conversationId: string, filePath: string) =>
    ipcRenderer.invoke("workspace:getGitFileDiff", conversationId, filePath),
  getWorktreeGitInfo: (conversationId: string) =>
    ipcRenderer.invoke("workspace:getWorktreeGitInfo", conversationId),
  generateWorktreeCommitMessage: (conversationId: string) =>
    ipcRenderer.invoke(
      "workspace:generateWorktreeCommitMessage",
      conversationId,
    ),
  commitWorktree: (conversationId: string, message: string) =>
    ipcRenderer.invoke("workspace:commitWorktree", conversationId, message),
  mergeWorktreeIntoMain: (conversationId: string) =>
    ipcRenderer.invoke("workspace:mergeWorktreeIntoMain", conversationId),
  pushWorktreeBranch: (conversationId: string) =>
    ipcRenderer.invoke("workspace:pushWorktreeBranch", conversationId),
  updateSettings: (settings: unknown) =>
    ipcRenderer.invoke("workspace:updateSettings", settings),
  createConversationForProject: (
    projectId: string,
    options?: {
      modelProvider?: string;
      modelId?: string;
      thinkingLevel?: string;
      accessMode?: "secure" | "open";
      channelExtensionId?: string;
    },
  ) => ipcRenderer.invoke("conversations:createForProject", projectId, options),
  enableConversationWorktree: (conversationId: string) =>
    ipcRenderer.invoke("conversations:enableWorktree", conversationId),
  disableConversationWorktree: (conversationId: string) =>
    ipcRenderer.invoke("conversations:disableWorktree", conversationId),
  createConversationGlobal: (options?: {
    modelProvider?: string;
    modelId?: string;
    thinkingLevel?: string;
    accessMode?: "secure" | "open";
    channelExtensionId?: string;
  }) => ipcRenderer.invoke("conversations:createGlobal", options),
  setConversationAccessMode: (
    conversationId: string,
    accessMode: "secure" | "open",
  ) =>
    ipcRenderer.invoke(
      "conversations:setAccessMode",
      conversationId,
      accessMode,
    ),
  deleteConversation: (conversationId: string, force?: boolean) =>
    ipcRenderer.invoke("conversations:delete", conversationId, force),
  listPiModels: () => ipcRenderer.invoke("models:listPi"),
  syncPiModels: () => ipcRenderer.invoke("models:syncPi"),
  discoverProviderModels: (providerConfig: Record<string, unknown>) =>
    ipcRenderer.invoke("models:discoverProvider", providerConfig),
  setPiModelScoped: (provider: string, id: string, scoped: boolean) =>
    ipcRenderer.invoke("models:setPiScoped", provider, id, scoped),
  getPiConfigSnapshot: () => ipcRenderer.invoke("pi:getConfigSnapshot"),
  updatePiSettingsJson: (next: unknown) =>
    ipcRenderer.invoke("pi:updateSettingsJson", next),
  resolveProviderBaseUrl: (rawUrl: string) =>
    ipcRenderer.invoke("pi:resolveProviderBaseUrl", rawUrl),
  updatePiModelsJson: (next: unknown) =>
    ipcRenderer.invoke("pi:updateModelsJson", next),
  updatePiAuthJson: (next: unknown) =>
    ipcRenderer.invoke("pi:updateAuthJson", next),
  runPiCommand: (action: unknown, params: unknown) =>
    ipcRenderer.invoke("pi:runCommand", action, params),
  getPiDiagnostics: () => ipcRenderer.invoke("pi:getDiagnostics"),
  getPiAuthJson: () => ipcRenderer.invoke("pi:getAuthJson"),
  oauthLogin: (providerId: string) =>
    ipcRenderer.invoke("pi:oauthLogin", providerId),
  oauthPromptReply: (value: string) =>
    ipcRenderer.send("pi:oauthPromptReply", value),
  oauthPromptCancel: () => ipcRenderer.send("pi:oauthPromptCancel"),
  oauthLoginCancel: () => ipcRenderer.send("pi:oauthLoginCancel"),
  onOAuthEvent: (
    callback: (event: {
      type: string;
      url?: string;
      instructions?: string;
      message?: string;
      placeholder?: string;
      allowEmpty?: boolean;
    }) => void,
  ) => {
    const listener = (_: Electron.IpcRendererEvent, ev: unknown) =>
      callback(
        ev as {
          type: string;
          url?: string;
          instructions?: string;
          message?: string;
          placeholder?: string;
          allowEmpty?: boolean;
        },
      );
    ipcRenderer.on("pi:oauthEvent", listener);
    return () => ipcRenderer.off("pi:oauthEvent", listener);
  },
  listSkillsCatalog: () => ipcRenderer.invoke("skills:listCatalog"),
  getSkillsMarketplace: () => ipcRenderer.invoke("skills:getMarketplace"),
  getSkillsMarketplaceFiltered: (options: unknown) =>
    ipcRenderer.invoke("skills:getMarketplaceFiltered", options),
  getSkillsRatings: (skillSource?: string) =>
    ipcRenderer.invoke("skills:getRatings", skillSource),
  addSkillRating: (skillSource: string, rating: number, review?: string) =>
    ipcRenderer.invoke("skills:addRating", skillSource, rating, review),
  getSkillAverageRating: (skillSource: string) =>
    ipcRenderer.invoke("skills:getAverageRating", skillSource),
  listExtensions: () => ipcRenderer.invoke("extensions:list"),
  listExtensionCatalog: () => ipcRenderer.invoke("extensions:listCatalog"),
  getExtensionMarketplace: () =>
    ipcRenderer.invoke("extensions:getMarketplace"),
  quickActionsListUsage: () => ipcRenderer.invoke("quickActions:listUsage"),
  quickActionsRecordUse: (actionId: string) =>
    ipcRenderer.invoke("quickActions:recordUse", actionId),
  getExtensionManifest: (id: string) =>
    ipcRenderer.invoke("extensions:getManifest", id),
  registerExtensionUi: () => ipcRenderer.invoke("extensions:registerUi"),
  getExtensionMainViewHtml: (viewId: string) =>
    ipcRenderer.invoke("extensions:getMainViewHtml", viewId),
  installExtension: (id: string) =>
    ipcRenderer.invoke("extensions:install", id),
  getExtensionInstallState: (id: string) =>
    ipcRenderer.invoke("extensions:installState", id),
  cancelExtensionInstall: (id: string) =>
    ipcRenderer.invoke("extensions:cancelInstall", id),
  toggleExtension: (id: string, enabled: boolean) =>
    ipcRenderer.invoke("extensions:toggle", id, enabled),
  removeExtension: (id: string) => ipcRenderer.invoke("extensions:remove", id),
  runExtensionHealthCheck: () =>
    ipcRenderer.invoke("extensions:runHealthCheck"),
  getExtensionLogs: (id: string) =>
    ipcRenderer.invoke("extensions:getLogs", id),
  checkExtensionUpdates: () => ipcRenderer.invoke("extensions:checkUpdates"),
  updateExtension: (id: string) => ipcRenderer.invoke("extensions:update", id),
  updateAllExtensions: () => ipcRenderer.invoke("extensions:updateAll"),
  publishExtension: (id: string, npmToken?: string) =>
    ipcRenderer.invoke("extensions:publish", id, npmToken),
  checkStoredNpmToken: () => ipcRenderer.invoke("extensions:checkStoredNpmToken"),
  clearStoredNpmToken: () => ipcRenderer.invoke("extensions:clearStoredNpmToken"),
  extensionEventSubscribe: (
    extensionId: string,
    topic: string,
    options?: { projectId?: string; conversationId?: string },
  ) =>
    ipcRenderer.invoke(
      "extensions:events:subscribe",
      extensionId,
      topic,
      options,
    ),
  extensionEventPublish: (
    extensionId: string,
    topic: string,
    payload: unknown,
    meta?: { idempotencyKey?: string },
  ) =>
    ipcRenderer.invoke(
      "extensions:events:publish",
      extensionId,
      topic,
      payload,
      meta,
    ),
  extensionQueueEnqueue: (
    extensionId: string,
    topic: string,
    payload: unknown,
    opts?: { idempotencyKey?: string; availableAt?: string },
  ) =>
    ipcRenderer.invoke(
      "extensions:queue:enqueue",
      extensionId,
      topic,
      payload,
      opts,
    ),
  extensionQueueConsume: (
    extensionId: string,
    topic: string,
    consumerId: string,
    opts?: { limit?: number },
  ) =>
    ipcRenderer.invoke(
      "extensions:queue:consume",
      extensionId,
      topic,
      consumerId,
      opts,
    ),
  extensionQueueAck: (extensionId: string, messageId: string) =>
    ipcRenderer.invoke("extensions:queue:ack", extensionId, messageId),
  extensionQueueNack: (
    extensionId: string,
    messageId: string,
    retryAt?: string,
    errorMessage?: string,
  ) =>
    ipcRenderer.invoke(
      "extensions:queue:nack",
      extensionId,
      messageId,
      retryAt,
      errorMessage,
    ),
  extensionQueueDeadLetterList: (extensionId: string, topic?: string) =>
    ipcRenderer.invoke("extensions:queue:deadLetter:list", extensionId, topic),
  extensionStorageKvGet: (extensionId: string, key: string) =>
    ipcRenderer.invoke("extensions:storage:kv:get", extensionId, key),
  extensionStorageKvSet: (extensionId: string, key: string, value: unknown) =>
    ipcRenderer.invoke("extensions:storage:kv:set", extensionId, key, value),
  extensionStorageKvDelete: (extensionId: string, key: string) =>
    ipcRenderer.invoke("extensions:storage:kv:delete", extensionId, key),
  extensionStorageKvList: (extensionId: string) =>
    ipcRenderer.invoke("extensions:storage:kv:list", extensionId),
  extensionStorageFilesRead: (extensionId: string, relativePath: string) =>
    ipcRenderer.invoke(
      "extensions:storage:files:read",
      extensionId,
      relativePath,
    ),
  extensionStorageFilesWrite: (
    extensionId: string,
    relativePath: string,
    content: string,
  ) =>
    ipcRenderer.invoke(
      "extensions:storage:files:write",
      extensionId,
      relativePath,
      content,
    ),
  extensionHostCall: (
    extensionId: string,
    method: string,
    params?: Record<string, unknown>,
  ) => ipcRenderer.invoke("extensions:hostCall", extensionId, method, params),
  extensionCall: (
    callerExtensionId: string,
    extensionId: string,
    apiName: string,
    versionRange: string,
    payload: unknown,
  ) =>
    ipcRenderer.invoke(
      "extensions:call",
      callerExtensionId,
      extensionId,
      apiName,
      versionRange,
      payload,
    ),
  extensionRuntimeHealth: () => ipcRenderer.invoke("extensions:runtime:health"),
  restartAppForExtension: () => ipcRenderer.invoke("extensions:restartApp"),
  openExtensionsFolder: () =>
    ipcRenderer.invoke("extensions:openExtensionsFolder"),
  openPath: (target: unknown) => ipcRenderer.invoke("pi:openPath", target),
  exportPiSessionHtml: (sessionFile: unknown, outputFile: unknown) =>
    ipcRenderer.invoke("pi:exportSessionHtml", sessionFile, outputFile),
  getConversationMessageCache: (conversationId: string) =>
    ipcRenderer.invoke("conversations:getMessageCache", conversationId),
  requestConversationAutoTitle: (
    conversationId: string,
    firstMessage: string,
  ) =>
    ipcRenderer.invoke(
      "conversations:requestAutoTitle",
      conversationId,
      firstMessage,
    ),
  piStartSession: (conversationId: string) =>
    ipcRenderer.invoke("pi:startSession", conversationId),
  piStopSession: (conversationId: string) =>
    ipcRenderer.invoke("pi:stopSession", conversationId),
  piSendCommand: (conversationId: string, command: unknown) =>
    ipcRenderer.invoke("pi:sendCommand", conversationId, command),
  piGetSnapshot: (conversationId: string) =>
    ipcRenderer.invoke("pi:getSnapshot", conversationId),
  piRespondExtensionUi: (conversationId: string, response: unknown) =>
    ipcRenderer.invoke("pi:respondExtensionUi", conversationId, response),
  onPiEvent: (listener: (event: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on("pi:event", wrapped);
    return () => {
      ipcRenderer.removeListener("pi:event", wrapped);
    };
  },
  onConversationUpdated: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on("workspace:conversationUpdated", wrapped);
    return () => {
      ipcRenderer.removeListener("workspace:conversationUpdated", wrapped);
    };
  },
  onExtensionOpenMainView: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on("extensions:openMainView", wrapped);
    return () => {
      ipcRenderer.removeListener("extensions:openMainView", wrapped);
    };
  },
  onExtensionNotification: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on("extension:notification", wrapped);
    return () => {
      ipcRenderer.removeListener("extension:notification", wrapped);
    };
  },
  getLanguagePreference: () =>
    ipcRenderer.invoke("settings:getLanguagePreference"),
  updateLanguagePreference: (language: string) =>
    ipcRenderer.invoke("settings:updateLanguagePreference", language),
  detectVscode: () => ipcRenderer.invoke("vscode:detect"),
  detectOllama: () => ipcRenderer.invoke("ollama:detect"),
  detectLmStudio: () => ipcRenderer.invoke("lmstudio:detect"),
  openWorktreeInVscode: (worktreePath: string) =>
    ipcRenderer.invoke("vscode:openWorktree", worktreePath),
  openProjectFolder: (projectId: string) =>
    ipcRenderer.invoke("workspace:openProjectFolder", projectId),
  detectProjectCommands: (conversationId: string) =>
    ipcRenderer.invoke("workspace:detectProjectCommands", conversationId),
  startProjectCommandTerminal: (
    conversationId: string,
    commandId: string,
    customCommandText?: string,
  ) =>
    ipcRenderer.invoke(
      "workspace:startProjectCommandTerminal",
      conversationId,
      commandId,
      customCommandText,
    ),
  readProjectCommandTerminal: (runId: string, afterSeq?: number) =>
    ipcRenderer.invoke("workspace:readProjectCommandTerminal", runId, afterSeq),
  stopProjectCommandTerminal: (runId: string) =>
    ipcRenderer.invoke("workspace:stopProjectCommandTerminal", runId),
  // Composer drafts
  saveDraft: (key: string, content: string) =>
    ipcRenderer.invoke("composer:saveDraft", key, content),
  getDraft: (key: string) =>
    ipcRenderer.invoke("composer:getDraft", key),
  getAllDrafts: () =>
    ipcRenderer.invoke("composer:getAllDrafts"),
  deleteDraft: (key: string) =>
    ipcRenderer.invoke("composer:deleteDraft", key),
  // Sandboxed command execution
  executeNodeCommand: (
    command: string,
    args: string[],
    cwd?: string,
    timeout?: number,
  ) =>
    ipcRenderer.invoke(
      "sandbox:executeNodeCommand",
      command,
      args,
      cwd,
      timeout,
    ),
  executeNpmCommand: (args: string[], cwd?: string) =>
    ipcRenderer.invoke("sandbox:executeNpmCommand", args, cwd),
  executePythonCommand: (args: string[], cwd?: string, timeout?: number) =>
    ipcRenderer.invoke("sandbox:executePythonCommand", args, cwd, timeout),
  executePipCommand: (args: string[], cwd?: string) =>
    ipcRenderer.invoke("sandbox:executePipCommand", args, cwd),
  checkNodeAvailability: () =>
    ipcRenderer.invoke("sandbox:checkNodeAvailability"),
  checkPythonAvailability: (cwd?: string) =>
    ipcRenderer.invoke("sandbox:checkPythonAvailability", cwd),
  cleanupSandbox: () => ipcRenderer.invoke("sandbox:cleanup"),
});

// Exposer les méthodes spécifiques à Pi pour une utilisation plus simple
contextBridge.exposeInMainWorld("pi", {
  getModels: () => ipcRenderer.invoke("pi:getModels"),
  getSettings: () => ipcRenderer.invoke("pi:getSettings"),
  updateSettings: (newSettings: unknown) =>
    ipcRenderer.invoke("pi:updateSettings", newSettings),
  isUsingUserConfig: () => ipcRenderer.invoke("pi:isUsingUserConfig"),
});

// Exposer les méthodes de logging
contextBridge.exposeInMainWorld("logger", {
  getLogs: (limit: number = 100) => ipcRenderer.invoke("logs:getLogs", limit),
  clearLogs: () => ipcRenderer.invoke("logs:clearLogs"),
  getLogFilePath: () => ipcRenderer.invoke("logs:getLogFilePath"),
  log: (
    level: "info" | "warn" | "error" | "debug",
    message: string,
    data?: any,
  ) => {
    // Log côté frontend - sera capturé par le système de logging principal
    console.log(`[FRONTEND][${level.toUpperCase()}] ${message}`, data);
  },
});

contextBridge.exposeInMainWorld("telemetry", {
  log: (
    level: "info" | "warn" | "error" | "debug",
    message: string,
    data?: unknown,
  ) => ipcRenderer.invoke("telemetry:log", level, message, data),
  crash: (payload: { message: string; stack?: string; context?: unknown }) =>
    ipcRenderer.invoke("telemetry:crash", payload),
});

// Exposer les méthodes de mise à jour
contextBridge.exposeInMainWorld("updater", {
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  applyUpdate: (release: any) => ipcRenderer.invoke("apply-update", release),
  onDownloadProgress: (listener: (progress: number) => void) => {
    const wrapped = (_event: unknown, progress: number) => listener(progress);
    ipcRenderer.on("download-progress", wrapped);
    return () => {
      ipcRenderer.removeListener("download-progress", wrapped);
    };
  },
});
