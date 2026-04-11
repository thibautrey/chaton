import { describe, expect, it } from 'vitest'

import type { JsonValue, PiConversationRuntime } from '@/features/workspace/rpc'
import { makePiRuntime, piReducer } from './state'
import type { Action } from './state'
import type { PiStoreState } from './pi-store'

function makeState(messages: JsonValue[]): PiStoreState {
  return {
    piByConversation: {
      conv: {
        ...makePiRuntime(),
        messages,
      } satisfies PiConversationRuntime,
    },
    completedActionByConversation: {},
  }
}

describe('piReducer setPiMessages', () => {
  it('does not re-append a user message when snapshot matches by timestamp and text but lacks ids', () => {
    const existingUserMessage = {
      role: 'user',
      timestamp: 1_700_000_000_000,
      content: [{ type: 'text', text: 'Hello there' }],
    } satisfies JsonValue

    const snapshotMessages = [
      {
        role: 'user',
        timestamp: 1_700_000_000_000,
        content: [{ type: 'text', text: 'Hello there' }],
      },
      {
        role: 'assistant',
        timestamp: 1_700_000_000_100,
        content: [{ type: 'text', text: 'Hi' }],
      },
    ] satisfies JsonValue[]

    const next = piReducer(makeState([existingUserMessage]), {
      type: 'setPiMessages',
      payload: {
        conversationId: 'conv',
        messages: snapshotMessages,
      },
    } satisfies Action)

    expect(next.piByConversation.conv.messages).toEqual(snapshotMessages)
  })

  it('still preserves newer assistant messages that are missing from the snapshot', () => {
    const existingAssistantMessage = {
      id: 'assistant-live',
      role: 'assistant',
      timestamp: 1_700_000_000_200,
      content: [{ type: 'text', text: 'Live update' }],
    } satisfies JsonValue

    const snapshotMessages = [
      {
        role: 'user',
        timestamp: 1_700_000_000_000,
        content: [{ type: 'text', text: 'Hello there' }],
      },
    ] satisfies JsonValue[]

    const next = piReducer(makeState([existingAssistantMessage]), {
      type: 'setPiMessages',
      payload: {
        conversationId: 'conv',
        messages: snapshotMessages,
      },
    } satisfies Action)

    expect(next.piByConversation.conv.messages).toEqual([
      ...snapshotMessages,
      existingAssistantMessage,
    ])
  })

  it('does not re-append a message when snapshot carries the same content under a different id', () => {
    const existingUserMessage = {
      id: 'event-user-1',
      role: 'user',
      timestamp: 1_700_000_000_000,
      content: [{ type: 'text', text: 'Hello there' }],
    } satisfies JsonValue

    const snapshotMessages = [
      {
        id: 'snapshot-user-1',
        role: 'user',
        timestamp: 1_700_000_000_000,
        content: [{ type: 'text', text: 'Hello there' }],
      },
      {
        id: 'snapshot-assistant-1',
        role: 'assistant',
        timestamp: 1_700_000_000_100,
        content: [{ type: 'text', text: 'Hi' }],
      },
    ] satisfies JsonValue[]

    const next = piReducer(makeState([existingUserMessage]), {
      type: 'setPiMessages',
      payload: {
        conversationId: 'conv',
        messages: snapshotMessages,
      },
    } satisfies Action)

    expect(next.piByConversation.conv.messages).toEqual(snapshotMessages)
  })

  it('does not re-append an id-less assistant message when snapshot matches by timestamp and content', () => {
    const existingAssistantMessage = {
      role: 'assistant',
      timestamp: 1_700_000_000_200,
      content: [{ type: 'text', text: 'Final answer' }],
    } satisfies JsonValue

    const snapshotMessages = [
      {
        role: 'user',
        timestamp: 1_700_000_000_000,
        content: [{ type: 'text', text: 'Hello there' }],
      },
      {
        role: 'assistant',
        timestamp: 1_700_000_000_200,
        content: [{ type: 'text', text: 'Final answer' }],
      },
    ] satisfies JsonValue[]

    const next = piReducer(makeState([existingAssistantMessage]), {
      type: 'setPiMessages',
      payload: {
        conversationId: 'conv',
        messages: snapshotMessages,
      },
    } satisfies Action)

    expect(next.piByConversation.conv.messages).toEqual(snapshotMessages)
  })

  it('does not re-append an id-less tool result when snapshot matches by timestamp and tool metadata', () => {
    const existingToolResult = {
      role: 'toolResult',
      toolCallId: 'tool-123',
      toolName: 'read',
      isError: false,
      timestamp: 1_700_000_000_150,
      content: [{ type: 'text', text: 'file contents' }],
    } satisfies JsonValue

    const snapshotMessages = [
      {
        role: 'assistant',
        timestamp: 1_700_000_000_100,
        content: [{ type: 'text', text: 'Let me inspect that.' }],
      },
      {
        role: 'toolResult',
        toolCallId: 'tool-123',
        toolName: 'read',
        isError: false,
        timestamp: 1_700_000_000_150,
        content: [{ type: 'text', text: 'file contents' }],
      },
    ] satisfies JsonValue[]

    const next = piReducer(makeState([existingToolResult]), {
      type: 'setPiMessages',
      payload: {
        conversationId: 'conv',
        messages: snapshotMessages,
      },
    } satisfies Action)

    expect(next.piByConversation.conv.messages).toEqual(snapshotMessages)
  })
})
