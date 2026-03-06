import type { Dispatch, RefObject } from 'react'

import type { WorkspaceState } from '../types'
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
  getPiMessageRole,
  isMessageSendCommand,
  isUpstreamNoOutputRetryMessage,
} from './state'

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
function findMatchingToolCallMessage(state: WorkspaceState, conversationId: string, toolName: string): string {
  const runtime = state.piByConversation[conversationId]
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

  if (payload.type === 'runtime_status') {
    const nextStatus = payload.status as PiRuntimeStatus
    const nextMessage = typeof payload.message === 'string' ? payload.message : 'Pi error'
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: nextStatus,
          ...(nextStatus === 'ready' || nextStatus === 'error' || nextStatus === 'stopped'
            ? {
                activeStreamTurn: null,
                activeStreamEventSeq: 0,
                pendingUserMessage: false,
                pendingUserMessageText: null,
              }
            : {}),
          ...(nextStatus === 'streaming' ? { pendingUserMessage: false, pendingUserMessageText: null } : {}),
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
      const errorMessage = typeof payload.error === 'string' ? payload.error : `Commande ${payload.command} échouée`
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
    }
    return { shouldAutoRetry: false }
  }

  if (payload.type === 'message_update') {
    const message = payload.message as JsonValue
    if (isUpstreamNoOutputRetryMessage(message)) {
      return { shouldAutoRetry: true }
    }
    const role = getPiMessageRole(message)
    if (role === 'user') {
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
      : findMatchingToolCallMessage(stateRef.current, conversationId, toolName)
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
    dispatch({
      type: 'setPiRuntime',
      payload: {
        conversationId,
        runtime: {
          status: 'ready',
          pendingCommands: 0,
          pendingUserMessage: false,
          pendingUserMessageText: null,
        },
      },
    })
    dispatch({
      type: 'markConversationActionCompleted',
      payload: { conversationId },
    })
    
    // Find the conversation title for notification
    const conversation = stateRef.current.conversations.find(c => c.id === conversationId)
    if (conversation && (options?.shouldNotifyConversationCompleted?.(conversationId) ?? true)) {
      void showConversationCompletedNotification(conversation.title)
    }
  }

  if (payload.type === 'extension_ui_request') {
    const method = typeof payload.method === 'string' ? payload.method : ''
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
    if (method === 'setStatus' || method === 'setWidget' || method === 'set_editor_text' || method === 'setTitle' || method === 'notify') {
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
