export type PiRuntimeStatus = 'stopped' | 'starting' | 'ready' | 'streaming' | 'error'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type ImageContent = {
  type: 'image'
  data: string
  mimeType: string
}

export type FileContent = {
  type: 'file'
  name: string
  mimeType: string
  data: string
  size: number
}

export type RpcCommand =
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'get_messages' }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'get_access_mode' }
  | { id?: string; type: 'get_commands' }
  | { id?: string; type: 'prompt'; message: string; images?: ImageContent[]; files?: FileContent[]; streamingBehavior?: 'steer' | 'followUp' }
  | { id?: string; type: 'steer'; message: string; images?: ImageContent[]; files?: FileContent[] }
  | { id?: string; type: 'follow_up'; message: string; images?: ImageContent[]; files?: FileContent[] }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'set_thinking_level'; level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' }
  | { id?: string; type: 'cycle_thinking_level' }
  | { id?: string; type: 'set_auto_compaction'; enabled: boolean }
  | { id?: string; type: 'set_auto_retry'; enabled: boolean }
  | { id?: string; type: 'set_steering_mode'; mode: 'all' | 'one-at-a-time' }
  | { id?: string; type: 'set_follow_up_mode'; mode: 'all' | 'one-at-a-time' }

export type RpcResponse = {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: JsonValue
  error?: string
}

export type RpcSessionState = {
  model: { provider: string; id: string } | null
  thinkingLevel: string
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: 'all' | 'one-at-a-time'
  followUpMode: 'all' | 'one-at-a-time'
  sessionFile: string
  sessionId: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

export type RpcExtensionUiResponse =
  | { type: 'extension_ui_response'; id: string; value: string }
  | { type: 'extension_ui_response'; id: string; confirmed: boolean }
  | { type: 'extension_ui_response'; id: string; cancelled: true }
  | { type: 'extension_ui_response'; id: string; requirementSheetAction: 'confirm' | 'dismiss' | 'open_settings' }

export type RpcEvent = {
  type: string
  [key: string]: JsonValue | undefined
}

export type PiProcessLifecycleEvent =
  | { type: 'runtime_status'; status: PiRuntimeStatus; message?: string }
  | { type: 'runtime_error'; message: string }

export type PiRendererEvent = {
  conversationId: string
  event: RpcEvent | RpcResponse | PiProcessLifecycleEvent
}

export type ThreadActionSuggestion = {
  id: string
  label: string
  message: string
}

export type RequirementSheet = {
  id: string
  html: string
  title?: string
  extensionId?: string
  conversationId: string
}

export type PiConversationRuntime = {
  status: PiRuntimeStatus
  state: RpcSessionState | null
  messages: JsonValue[]
  activeStreamTurn: number | null
  activeStreamEventSeq: number
  pendingUserMessage: boolean
  pendingUserMessageText: string | null
  pendingCommands: number
  lastError: string | null
  extensionRequests: Array<{ id: string; method: string; payload: Record<string, JsonValue | undefined> }>
  memoryInjected?: boolean
  extensionStatus: Record<string, string>
  extensionWidget: string[] | null
  editorPrefill: string | null
  threadActionSuggestions: ThreadActionSuggestion[]
  requirementSheet: RequirementSheet | null
  cacheHydrating: boolean
  cacheLoaded: boolean
}
