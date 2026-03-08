import type { Dispatch, RefObject } from 'react'

import type { WorkspaceState } from '../types'
import { piStoreGetState } from './pi-store'
import type {
  JsonValue,
  PiConversationRuntime,
  PiRendererEvent,
  PiRuntimeStatus,
  RpcSessionState,
} from '../rpc'
import {
  type Action,
  buildSendFailureNotice,
  isMessageSendCommand,
  isUpstreamNoOutputRetryMessage,
} from './state'

// Detect auth/credential errors from LLM provider responses
function isAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    /\b401\b/.test(lower) ||
    /\bunauthorized\b/.test(lower) ||
    /\bno api key\b/.test(lower) ||
    /\bapi[_ ]?key\b/.test(lower) ||
    /\btoken.*expir/i.test(lower) ||
    /\bexpired.*token/i.test(lower) ||
    /\binvalid.*credential/i.test(lower) ||
    /\bcredential.*invalid/i.test(lower) ||
    /\bauthentication.*fail/i.test(lower) ||
    /\bforbidden\b/.test(lower) ||
    /\b403\b/.test(lower)
  )
}

// Build the HTML content for the built-in auth error requirement sheet
function buildAuthErrorSheetHtml(errorMessage: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root {
    --bg: hsl(220 12% 96%);
    --fg: hsl(222 12% 14%);
    --card: hsl(0 0% 100%);
    --border: hsl(220 9% 85%);
    --muted: hsl(220 6% 44%);
    --accent: hsl(220 74% 52%);
    --accent-fg: hsl(0 0% 100%);
    --error-bg: hsl(0 80% 96%);
    --error-border: hsl(0 60% 80%);
    --error-fg: hsl(0 60% 38%);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: hsl(222 14% 12%);
      --fg: hsl(210 20% 90%);
      --card: hsl(222 13% 17%);
      --border: hsl(222 10% 24%);
      --muted: hsl(215 10% 55%);
      --accent: hsl(220 70% 55%);
      --accent-fg: hsl(0 0% 100%);
      --error-bg: hsl(0 40% 16%);
      --error-border: hsl(0 40% 30%);
      --error-fg: hsl(0 60% 78%);
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--fg);
    padding: 20px 24px;
    font-size: 14px;
    line-height: 1.5;
  }
  .error-box {
    background: var(--error-bg);
    border: 1px solid var(--error-border);
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 16px;
    color: var(--error-fg);
    font-size: 13px;
    word-break: break-word;
  }
  .error-box strong { font-weight: 600; }
  .instructions {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 16px;
    line-height: 1.6;
  }
  .action-row {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  button {
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    padding: 8px 18px;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--fg);
    transition: background 120ms, border-color 120ms;
  }
  button:hover { background: var(--bg); }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }
  .btn-primary:hover { opacity: 0.9; background: var(--accent); }
</style>
</head>
<body>
  <div class="error-box">
    <strong>Authentication error</strong><br>
    ${errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
  </div>
  <div class="instructions">
    Please check your API key or re-authenticate in <strong>Settings &gt; Providers &amp; Models</strong>,
    then retry your request.
  </div>
  <div class="action-row">
    <button onclick="window.parent.postMessage({type:'chaton:requirement-sheet:dismiss'},'*')">
      Dismiss
    </button>
    <button class="btn-primary" onclick="window.parent.postMessage({type:'chaton:requirement-sheet:open-settings'},'*')">
      Open Settings
    </button>
  </div>
</body>
</html>`
}

export function mergeSnapshot(dispatch: Dispatch<Action>, conversationId: string, snapshot: { status: string; state: unknown; messages: unknown[] }) {
  const status = snapshot.status as PiConversationRuntime['status']
  const rawState = (snapshot.state as RpcSessionState | null) ?? null
  const normalizedState =
    rawState && status !== 'streaming' && rawState.isStreaming
      ? { ...rawState, isStreaming: false }
      : rawState

  dispatch({
    type: 'setPiRuntime',
    payload: {
      conversationId,
      runtime: {
        status,
        state: normalizedState,
        ...(status !== 'streaming' ? { pendingUserMessage: false, pendingUserMessageText: null } : {}),
      },
    },
  })
  dispatch({ type: 'setPiMessages', payload: { conversationId, messages: (snapshot.messages as JsonValue[]) ?? [] } })
}

// Helper function to extract tool blocks from a message
function getToolBlocks(value: JsonValue): Array<
  | { kind: 'toolCall', name?: string, arguments?: string, toolCallId?: string }
  | { kind: 'toolResult', toolName?: string, text?: string, isError?: boolean, toolCallId?: string }
> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const record = value as Record<string, JsonValue>
  const nestedMessage =
    record.message && typeof record.message === 'object' && !Array.isArray(record.message)
      ? (record.message as Record<string, JsonValue>)
      : null
  const source = nestedMessage ?? record
  const content = Array.isArray(source.content) ? source.content : null
  if (!content) {
    if (source.role === 'toolResult') {
      const toolName = typeof source.toolName === 'string' ? source.toolName : 'tool'
      const text = typeof source.text === 'string' ? source.text : (typeof source.result === 'string' ? source.result : '')
      const isError = source.isError === true || source.error === true
      const toolCallId = typeof source.toolCallId === 'string' ? source.toolCallId : undefined
      return [{ kind: 'toolResult', toolName, text, isError, toolCallId }]
    }
    return []
  }

  const blocks: Array<
    | { kind: 'toolCall', name?: string, arguments?: string, toolCallId?: string }
    | { kind: 'toolResult', toolName?: string, text?: string, isError?: boolean, toolCallId?: string }
  > = []
  for (const item of content) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const part = item as Record<string, JsonValue>
    const type = part.type

    if (type === 'toolCall') {
      const name = typeof part.name === 'string' ? part.name : 'tool'
      const args = part.arguments
      const argumentsText =
        args === undefined ? '' : typeof args === 'string' ? args : JSON.stringify(args, null, 2)
      const toolCallId = typeof part.id === 'string' ? part.id : undefined
      blocks.push({ kind: 'toolCall', name, arguments: argumentsText, toolCallId })
      continue
    }

    if (type === 'toolResult') {
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'tool'
      const text = typeof part.text === 'string' ? part.text : (typeof part.result === 'string' ? part.result : '')
      const isError = part.isError === true || part.error === true
      const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : undefined
      blocks.push({ kind: 'toolResult', toolName, text, isError, toolCallId })
    }
  }

  return blocks
}

// Helper function to find the in-flight tool call message for tools without toolCallId.
function findMatchingToolCallMessage(conversationId: string, toolName: string): string {
  const runtime = piStoreGetState().piByConversation[conversationId]
  if (!runtime || !runtime.messages) return `tool-exec:${Date.now()}:${toolName}`

  for (let i = runtime.messages.length - 1; i >= 0; i--) {
    const message = runtime.messages[i]
    if (!(typeof message === 'object' && message !== null && 'id' in message && typeof message.id === 'string')) {
      continue
    }

    if (!message.id.startsWith('tool-exec:')) {
      continue
    }

    const blocks = getToolBlocks(message)
    if (blocks.length === 0) {
      continue
    }

    const hasToolResult = blocks.some((block) => block.kind === 'toolResult')
    if (hasToolResult) {
      continue
    }

    const firstBlock = blocks[0]
    if (firstBlock.kind === 'toolCall' && firstBlock.name === toolName) {
      return message.id
    }
  }

  return `tool-exec:${Date.now()}:${toolName}`
}

// Helper function to check if a message already contains a tool call with the given ID
function doesMessageContainToolCall(message: JsonValue, toolCallId?: string | null): boolean {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return false

  const record = message as Record<string, JsonValue>
  // Handle nested message structure (e.g. { message: { content: [...] } })
  const nestedMessage =
    record.message && typeof record.message === 'object' && !Array.isArray(record.message)
      ? (record.message as Record<string, JsonValue>)
      : null
  const source = nestedMessage ?? record
  const content = Array.isArray(source.content) ? source.content : []

  if (toolCallId) {
    // Check if any toolCall has this specific ID
    return content.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (item as Record<string, JsonValue>).type === 'toolCall' &&
        (item as Record<string, JsonValue>).id === toolCallId,
    )
  }

  // If no toolCallId, check if there's ANY toolCall in content
  return content.some(
    (item) => item && typeof item === 'object' && !Array.isArray(item) && (item as Record<string, JsonValue>).type === 'toolCall',
  )
}

async function showConversationCompletedNotification(conversationTitle: string): Promise<void> {
  try {
    // Check if window.desktop API is available
    if (!window.desktop) {
      return
    }
    
    // Check if window is focused
    const isFocused = await window.desktop.isWindowFocused()
    
    // Only show notification if window is not focused
    if (isFocused) {
      return
    }
    
    // Show notification with translated message
    // Note: In a real app, you'd want to use i18n here, but since we're in the store
    // and don't have access to the React context, we'll use simple translations
    const title = 'Conversation terminée'
    const body = `La conversation "${conversationTitle}" a terminé son action`
    
    await window.desktop.showNotification(title, body)
  } catch (error) {
    console.error('Failed to show notification:', error)
  }
}

export function applyPiEvent(
  dispatch: Dispatch<Action>,
  event: PiRendererEvent,
  stateRef: RefObject<WorkspaceState>,
  options?: {
    shouldNotifyConversationCompleted?: (conversationId: string) => boolean
  },
): { shouldAutoRetry: boolean } {
  const conversationId = event.conversationId
  const payload = event.event

  if (payload.type === 'system_prompt') {
    // Log system prompt information for debugging
    if (window.logger) {
      const sections = Array.isArray(payload.sections) ? payload.sections : []
      const model = payload.model as any
      const accessMode = typeof payload.accessMode === 'string' ? payload.accessMode : 'secure'
      const thinkingLevel = typeof payload.thinkingLevel === 'string' ? payload.thinkingLevel : 'medium'
      
      // Log a summary
      window.logger.log('info', `System prompt initialized with ${sections.length} sections`, {
        conversationId,
        model: model ? `${model.provider}/${model.id}` : 'not set',
        accessMode,
        thinkingLevel,
      })
      
      // Log each section
      sections.forEach((section, index) => {
        if (typeof section === 'string') {
          window.logger.log('info', `System prompt section ${index + 1}/${sections.length}`, {
            conversationId,
            section,
          })
        }
      })
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'runtime_status') {
    const nextStatus = payload.status as PiRuntimeStatus
    const nextMessage = typeof payload.message === 'string' ? payload.message : 'Pi error'
    const isTerminal = nextStatus === 'ready' || nextStatus === 'error' || nextStatus === 'stopped'
    // Normalize state.isStreaming when the runtime is no longer streaming.
    const currentState = piStoreGetState().piByConversation?.[conversationId]?.state ?? null
    const normalizedState =
      isTerminal && currentState?.isStreaming ? { ...currentState, isStreaming: false } : currentState
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: nextStatus,
          ...(isTerminal
            ? {
                activeStreamTurn: null,
                activeStreamEventSeq: 0,
                pendingUserMessage: false,
                pendingUserMessageText: null,
                ...(normalizedState !== currentState ? { state: normalizedState } : {}),
              }
            : {}),
          lastError: nextStatus === 'error' ? nextMessage : null,
        },
      },
    })
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'runtime_error') {
    const runtimeError = typeof payload.message === 'string' ? payload.message : 'Pi runtime error'
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'error',
          lastError: runtimeError,
        },
      },
    })
    // Show requirement sheet for auth errors so the user can fix credentials
    if (isAuthError(runtimeError)) {
      dispatch({
        type: 'showRequirementSheet',
        payload: {
          conversationId,
          sheet: {
            id: `auth-error:${Date.now()}`,
            html: buildAuthErrorSheetHtml(runtimeError),
            title: 'Authentication Required',
            conversationId,
          },
        },
      })
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'response') {
    const shouldClearPendingUserMessage =
      payload.command === 'prompt' || payload.command === 'follow_up' || payload.command === 'steer'

    if (shouldClearPendingUserMessage && !payload.success) {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            pendingUserMessage: false,
            pendingUserMessageText: null,
          },
        },
      })
    }

    if (payload.command === 'get_state' && payload.success) {
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            state: payload.data as unknown as RpcSessionState,
          },
        },
      })
    }

    if (payload.command === 'get_messages' && payload.success) {
      const data = payload.data as { messages?: JsonValue[] }
      dispatch({
        type: 'setPiMessages',
        payload: {
          conversationId,
          messages: data?.messages ?? [],
        },
      })
    }

    if (!payload.success) {
      const errorMessage = typeof payload.error === 'string' ? payload.error : `Commande ${payload.command} echouee`
      dispatch({
        type: 'setPiRuntime',
        payload: {
          conversationId,
          runtime: {
            lastError: errorMessage,
          },
        },
      })
      const responseCommand = typeof payload.command === 'string' ? payload.command : ''
      if (isMessageSendCommand(responseCommand)) {
        const noticeSourceError = typeof payload.error === 'string' ? payload.error : null
        dispatch({
          type: 'setNotice',
          payload: { notice: buildSendFailureNotice(noticeSourceError) },
        })
      }
      // Show requirement sheet for auth errors in command responses
      if (isAuthError(errorMessage)) {
        dispatch({
          type: 'showRequirementSheet',
          payload: {
            conversationId,
            sheet: {
              id: `auth-error:${Date.now()}`,
              html: buildAuthErrorSheetHtml(errorMessage),
              title: 'Authentication Required',
              conversationId,
            },
          },
        })
      }
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'message_update') {
    const message = payload.message as JsonValue
    if (isUpstreamNoOutputRetryMessage(message)) {
      return { shouldAutoRetry: true }
    }

    if (message) {
      dispatch({
        type: 'upsertPiMessage',
        payload: {
          conversationId,
          message,
        },
      })
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'tool_execution_start') {
    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
    const toolName = typeof payload.toolName === 'string' && payload.toolName.trim() ? payload.toolName : 'tool'

    // DEDUPLICATION: Check if any existing message already contains this tool call.
    // This prevents duplicates when both message_update and tool_execution_start fire for the same call.
    const runtime = piStoreGetState().piByConversation?.[conversationId]
    const existingMessages = runtime?.messages ?? []

    const alreadyExists = toolCallId
      ? existingMessages.some((msg) => doesMessageContainToolCall(msg, toolCallId))
      : doesMessageContainToolCall(existingMessages[existingMessages.length - 1] ?? null, null)

    if (alreadyExists) {
      // Tool call already exists in a message (from message_update), skip duplicate
      return { shouldAutoRetry: false }
    }

    const args = payload.args ?? {}
    const timestamp = Date.now()
    const messageId = toolCallId ? `tool-exec:${toolCallId}` : `tool-exec:${timestamp}:${toolName}`
    const toolCallPart = {
      type: 'toolCall',
      ...(toolCallId ? { id: toolCallId } : {}),
      name: toolName,
      arguments: args,
    } satisfies Record<string, JsonValue>
    const message = {
      id: messageId,
      role: 'assistant',
      timestamp: timestamp,
      content: [toolCallPart],
    } satisfies Record<string, JsonValue>
    dispatch({
      type: 'upsertPiMessage',
      payload: {
        conversationId,
        message,
      },
    })
  }

  if (payload.type === 'tool_execution_end') {
    const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : null
    const toolName = typeof payload.toolName === 'string' && payload.toolName.trim() ? payload.toolName : 'tool'
    
    // Use the same message ID as the tool call to enable merging
    const messageId = toolCallId 
      ? `tool-exec:${toolCallId}`
      : findMatchingToolCallMessage(conversationId, toolName)
    const toolResultPart = {
      type: 'toolResult',
      ...(toolCallId ? { toolCallId } : {}),
      toolName,
      isError: payload.isError === true,
      result: payload.result ?? null,
    } satisfies Record<string, JsonValue>
    const message = {
      id: messageId,
      role: 'assistant',
      timestamp: Date.now(),
      content: [toolResultPart],
    } satisfies Record<string, JsonValue>
    dispatch({
      type: 'upsertPiMessage',
      payload: {
        conversationId,
        message,
      },
    })
  }

  if (payload.type === 'agent_end') {
    // Normalize state.isStreaming to false so queue/send checks are not stuck.
    const currentState = piStoreGetState().piByConversation?.[conversationId]?.state ?? null
    const normalizedState = currentState?.isStreaming ? { ...currentState, isStreaming: false } : currentState
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'ready',
          pendingCommands: 0,
          pendingUserMessage: false,
          pendingUserMessageText: null,
          ...(normalizedState !== currentState ? { state: normalizedState } : {}),
        },
      },
    })
    dispatch({
      type: 'markConversationActionCompleted',
      payload: { conversationId },
    })
    
    // Emit fallback event to complete any remaining pending/in-progress tasks
    window.dispatchEvent(new CustomEvent('chaton:complete-all-pending-tasks', { detail: { conversationId } }))
    
    // Find the conversation title for notification
    const conversation = stateRef.current.conversations.find(c => c.id === conversationId)
    if (conversation && (options?.shouldNotifyConversationCompleted?.(conversationId) ?? true)) {
      void showConversationCompletedNotification(conversation.title)
    }
  }

  if (payload.type === 'extension_ui_request') {
    const method = typeof payload.method === 'string' ? payload.method : ''
    // Requirement sheet: an extension tool requests the user to complete an action
    if (method === 'requirement_sheet') {
      const html = typeof payload.html === 'string' ? payload.html : ''
      const title = typeof payload.title === 'string' ? payload.title : undefined
      const extensionId = typeof payload.extensionId === 'string' ? payload.extensionId : undefined
      const sheetId = String(payload.id)
      if (html) {
        dispatch({
          type: 'showRequirementSheet',
          payload: {
            conversationId,
            sheet: {
              id: sheetId,
              html,
              title,
              extensionId,
              conversationId,
            },
          },
        })
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'set_thread_actions') {
      const rawActions = Array.isArray(payload.actions) ? payload.actions : []
      const actions = rawActions
        .slice(0, 4)
        .map((item, index) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const record = item as Record<string, JsonValue>
          const label = typeof record.label === 'string' ? record.label.trim() : ''
          const message = typeof record.message === 'string' ? record.message : label
          const id = typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : `thread-action-${index}`
          if (!label || !message) return null
          return { id, label, message }
        })
        .filter((item): item is { id: string; label: string; message: string } => Boolean(item))
      dispatch({
        type: 'setThreadActionSuggestions',
        payload: {
          conversationId,
          actions,
        },
      })
      return { shouldAutoRetry: false }
    }
    if (method === 'setStatus' || method === 'setWidget' || method === 'set_editor_text' || method === 'setTitle' || method === 'notify' || method === 'requirement_sheet') {
      return { shouldAutoRetry: false }
    }
    if (method === 'set_task_list') {
      const taskList = payload.taskList
      if (taskList && typeof taskList === 'object') {
        window.dispatchEvent(new CustomEvent('chaton:set-task-list', { detail: { taskList } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'update_task_status') {
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : ''
      const status = typeof payload.status === 'string' ? payload.status : ''
      const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : undefined
      if (taskId && status) {
        window.dispatchEvent(new CustomEvent('chaton:update-task-status', { detail: { taskId, status, errorMessage } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'register_subagent') {
      const subAgent = payload.subAgent
      if (subAgent && typeof subAgent === 'object') {
        window.dispatchEvent(new CustomEvent('chaton:register-subagent', { detail: { subAgent } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'update_subagent_status') {
      const subAgentId = typeof payload.subAgentId === 'string' ? payload.subAgentId : ''
      const status = typeof payload.status === 'string' ? payload.status : ''
      const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : undefined
      if (subAgentId && status) {
        window.dispatchEvent(new CustomEvent('chaton:update-subagent-status', { detail: { subAgentId, status, errorMessage } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'set_subagent_task_list') {
      const subAgentId = typeof payload.subAgentId === 'string' ? payload.subAgentId : ''
      const taskList = payload.taskList
      if (subAgentId && taskList && typeof taskList === 'object') {
        window.dispatchEvent(new CustomEvent('chaton:set-subagent-task-list', { detail: { subAgentId, taskList } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method === 'update_subagent_task_status') {
      const subAgentId = typeof payload.subAgentId === 'string' ? payload.subAgentId : ''
      const taskId = typeof payload.taskId === 'string' ? payload.taskId : ''
      const status = typeof payload.status === 'string' ? payload.status : ''
      const errorMessage = typeof payload.errorMessage === 'string' ? payload.errorMessage : undefined
      if (subAgentId && taskId && status) {
        window.dispatchEvent(new CustomEvent('chaton:update-subagent-task-status', { detail: { subAgentId, taskId, status, errorMessage } }))
      }
      return { shouldAutoRetry: false }
    }
    if (method !== 'select' && method !== 'confirm' && method !== 'input' && method !== 'editor') {
      return { shouldAutoRetry: false }
    }

    dispatch({
      type: 'pushPiExtensionRequest',
      payload: {
        conversationId,
        request: {
          id: String(payload.id),
          method,
          payload,
        },
      },
    })
    return { shouldAutoRetry: false }
  }

  return { shouldAutoRetry: false }
}
