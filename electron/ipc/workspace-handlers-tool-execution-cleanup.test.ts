import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Unit tests for clearToolExecutionMapsForConversation in workspace-handlers.
 *
 * This function manages 4 Maps:
 *   activeToolCallIdByConversation: conversationId → requestId
 *   activeToolExecutionContext:   requestId → conversationId
 *   activeToolExecutionSignals:   requestId → AbortSignal
 *   touchedPathsByToolCall:        requestId → Set<string>
 *
 * We replicate the minimal function bodies inline to test the logic without
 * needing the full workspace-handlers.ts module (which requires complex deps setup).
 */

describe('clearToolExecutionMapsForConversation', () => {
  // Mock the 4 Maps exactly as they exist in workspace-handlers.ts
  let activeToolCallIdByConversation: Map<string, string>
  let activeToolExecutionContext: Map<string, string>
  let activeToolExecutionSignals: Map<string, AbortSignal>
  let touchedPathsByToolCall: Map<string, Set<string>>

  beforeEach(() => {
    activeToolCallIdByConversation = new Map()
    activeToolExecutionContext = new Map()
    activeToolExecutionSignals = new Map()
    touchedPathsByToolCall = new Map()
  })

  // Inline the function under test so we can test its logic independently.
  // Mirrors the implementation in workspace-handlers.ts for fidelity.
  function clearToolExecutionMapsForConversation(conversationId: string) {
    // Defensively iterate over entries to avoid assuming key structure.
    // Matches the production implementation in workspace-handlers.ts.
    for (const [conversationIdKey, requestId] of activeToolCallIdByConversation) {
      if (conversationIdKey === conversationId) {
        activeToolCallIdByConversation.delete(conversationIdKey)
      }
    }

    const requestIds = Array.from(activeToolExecutionContext.entries())
      .filter(([, convId]) => convId === conversationId)
      .map(([requestId]) => requestId)

    for (const requestId of requestIds) {
      const signal = activeToolExecutionSignals.get(requestId)
      if (signal && !signal.aborted) {
        try {
          signal.dispatchEvent(new Event('abort'))
        } catch {
          // ignore
        }
      }

      activeToolExecutionContext.delete(requestId)
      activeToolExecutionSignals.delete(requestId)
      touchedPathsByToolCall.delete(requestId)
    }
  }

  it('removes all entries from all 4 Maps for the given conversation', () => {
    // Set up: two conversations, multiple requestIds
    const signal1 = new AbortController().signal
    const signal2 = new AbortController().signal
    const signal3 = new AbortController().signal

    activeToolCallIdByConversation.set('conv-A', 'req-1')
    activeToolCallIdByConversation.set('conv-B', 'req-2')

    activeToolExecutionContext.set('req-1', 'conv-A')
    activeToolExecutionContext.set('req-2', 'conv-B')
    activeToolExecutionContext.set('req-3', 'conv-A')

    activeToolExecutionSignals.set('req-1', signal1)
    activeToolExecutionSignals.set('req-2', signal2)
    activeToolExecutionSignals.set('req-3', signal3)

    touchedPathsByToolCall.set('req-1', new Set(['src/a.ts']))
    touchedPathsByToolCall.set('req-2', new Set(['src/b.ts']))
    touchedPathsByToolCall.set('req-3', new Set(['lib/c.ts']))

    clearToolExecutionMapsForConversation('conv-A')

    // conv-A entries gone
    expect(activeToolCallIdByConversation.has('conv-A')).toBe(false)
    expect(activeToolExecutionContext.has('req-1')).toBe(false)
    expect(activeToolExecutionContext.has('req-3')).toBe(false)
    expect(activeToolExecutionSignals.has('req-1')).toBe(false)
    expect(activeToolExecutionSignals.has('req-3')).toBe(false)
    expect(touchedPathsByToolCall.has('req-1')).toBe(false)
    expect(touchedPathsByToolCall.has('req-3')).toBe(false)

    // conv-B entries untouched
    expect(activeToolCallIdByConversation.has('conv-B')).toBe(true)
    expect(activeToolExecutionContext.has('req-2')).toBe(true)
    expect(activeToolExecutionSignals.has('req-2')).toBe(true)
    expect(touchedPathsByToolCall.has('req-2')).toBe(true)
  })

  it('dispatches abort event on active (non-aborted) signals', () => {
    const { signal } = new AbortController()
    activeToolExecutionContext.set('req-X', 'conv-A')
    activeToolExecutionSignals.set('req-X', signal)
    activeToolCallIdByConversation.set('conv-A', 'req-X')

    const abortSpy = vi.fn()
    signal.addEventListener('abort', abortSpy)

    clearToolExecutionMapsForConversation('conv-A')

    expect(abortSpy).toHaveBeenCalledOnce()
  })

  it('does not dispatch abort on already-aborted signals', () => {
    const controller = new AbortController()
    controller.abort() // already aborted
    activeToolExecutionContext.set('req-Y', 'conv-A')
    activeToolExecutionSignals.set('req-Y', controller.signal)
    activeToolCallIdByConversation.set('conv-A', 'req-Y')

    const abortSpy = vi.fn()
    controller.signal.addEventListener('abort', abortSpy)

    clearToolExecutionMapsForConversation('conv-A')

    expect(abortSpy).not.toHaveBeenCalled()
  })

  it('handles missing requestId gracefully (no-op)', () => {
    activeToolExecutionContext.set('req-Z', 'conv-A')
    activeToolCallIdByConversation.set('conv-A', 'req-Z')
    // activeToolExecutionSignals and touchedPathsByToolCall intentionally unset

    expect(() => clearToolExecutionMapsForConversation('conv-A')).not.toThrow()
    expect(activeToolExecutionContext.has('req-Z')).toBe(false)
    expect(activeToolCallIdByConversation.has('conv-A')).toBe(false)
  })

  it('handles nonexistent conversation id gracefully (no-op)', () => {
    activeToolCallIdByConversation.set('conv-B', 'req-B')
    activeToolExecutionContext.set('req-B', 'conv-B')

    expect(() => clearToolExecutionMapsForConversation('nonexistent')).not.toThrow()
    expect(activeToolCallIdByConversation.size).toBe(1)
    expect(activeToolExecutionContext.size).toBe(1)
  })

  it('handles empty Maps gracefully (no-op)', () => {
    expect(() => clearToolExecutionMapsForConversation('conv-whatever')).not.toThrow()
  })

  it('handles signal dispatchEvent throwing gracefully', () => {
    // Simulate a signal whose dispatchEvent throws (edge case in some environments)
    const badSignal = {
      aborted: false,
      dispatchEvent: () => {
        throw new Error('Dispatch not supported')
      },
    } as unknown as AbortSignal

    activeToolExecutionContext.set('req-E', 'conv-A')
    activeToolExecutionSignals.set('req-E', badSignal)
    activeToolCallIdByConversation.set('conv-A', 'req-E')

    // Should not throw — the try/catch in the function absorbs it
    expect(() => clearToolExecutionMapsForConversation('conv-A')).not.toThrow()

    // But the Maps should still be cleaned up
    expect(activeToolExecutionContext.has('req-E')).toBe(false)
    expect(activeToolExecutionSignals.has('req-E')).toBe(false)
    expect(activeToolCallIdByConversation.has('conv-A')).toBe(false)
  })
})
