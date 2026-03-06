import type { JsonValue } from '@/features/workspace/rpc'

export type ToolBlock =
  | { kind: 'toolCall'; name: string; arguments: string; toolCallId: string | null }
  | {
      kind: 'toolResult'
      toolName: string
      text: string
      isError: boolean
      truncated: boolean
      fullOutputPath: string | null
      toolCallId: string | null
    }

export type FileChangeSummary = {
  label: string
  files: Array<{ path: string; added: number; removed: number }>
}

export type AssistantMeta = {
  provider: string | null
  model: string | null
  api: string | null
  stopReason: string | null
  errorMessage: string | null
  usage: { input: number | null; output: number | null; totalTokens: number | null }
}

export type ExplorationEvent =
  | { kind: 'read'; label: string }
  | { kind: 'search'; label: string }

export type MessageRole = 'user' | 'assistant' | 'system' | 'toolResult'

export type ToolResultInfo = { toolCallId: string | null; isError: boolean }

export type MessageDerivation = {
  id: string
  role: MessageRole
  text: string
  toolBlocks: ToolBlock[]
  visibleToolBlocks: Array<Extract<ToolBlock, { kind: 'toolCall' }>>
  fileChangeSummary: FileChangeSummary | null
  assistantMeta: AssistantMeta | null
  fallbackAssistantErrorText: string
}

export type JsonMessage = JsonValue
