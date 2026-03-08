/**
 * External store for high-frequency Pi conversation runtime state.
 *
 * piByConversation and completedActionByConversation are updated
 * many times per second during streaming (every token, tool call,
 * status change). Keeping them in the React context/reducer would
 * force ALL 17 useWorkspace() consumers to re-render on each update.
 *
 * By moving them to an external store with useSyncExternalStore,
 * only the components that actually SELECT this data re-render.
 */
import { useSyncExternalStore, useRef } from 'react'
import type { PiConversationRuntime } from '../rpc'
import type { JsonValue } from '../rpc'
import { perfMonitor } from './perf-monitor'

export type PiStoreState = {
  piByConversation: Record<string, PiConversationRuntime>
  completedActionByConversation: Record<string, boolean>
}

type Listener = () => void

let storeState: PiStoreState = {
  piByConversation: {},
  completedActionByConversation: {},
}

const listeners = new Set<Listener>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): PiStoreState {
  return storeState
}

// --- Public API for mutations (called from provider/pi-events) ---

export function piStoreGetState(): PiStoreState {
  return storeState
}

export function piStoreReplace(next: PiStoreState) {
  storeState = next
  perfMonitor.recordPiStoreUpdate()
  emitChange()
}

export function piStoreUpdate(updater: (prev: PiStoreState) => PiStoreState) {
  storeState = updater(storeState)
  perfMonitor.recordPiStoreUpdate()
  emitChange()
}

// --- React hooks ---

const EMPTY_MESSAGES: JsonValue[] = []

/**
 * Subscribe to a selected slice of the Pi store.
 * Component re-renders only when the selected value changes by reference.
 */
export function usePiStore<T>(selector: (s: PiStoreState) => T): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const cachedRef = useRef<{ value: T; snapshot: PiStoreState } | null>(null)

  return useSyncExternalStore(subscribe, () => {
    const snapshot = getSnapshot()
    // If snapshot hasn't changed, return cached value
    if (cachedRef.current && cachedRef.current.snapshot === snapshot) {
      return cachedRef.current.value
    }
    const next = selectorRef.current(snapshot)
    cachedRef.current = { value: next, snapshot }
    return next
  })
}

/**
 * Get the Pi runtime for a specific conversation.
 */
export function usePiRuntime(conversationId: string | null): PiConversationRuntime | null {
  return usePiStore((s) =>
    conversationId ? s.piByConversation[conversationId] ?? null : null,
  )
}

/**
 * Get the messages for a specific conversation.
 */
export function usePiMessages(conversationId: string | null): JsonValue[] {
  return usePiStore((s) => {
    if (!conversationId) return EMPTY_MESSAGES
    return s.piByConversation[conversationId]?.messages ?? EMPTY_MESSAGES
  })
}

/**
 * Check if a conversation's action is completed.
 */
export function useIsActionCompleted(conversationId: string | null): boolean {
  return usePiStore((s) =>
    conversationId ? s.completedActionByConversation[conversationId] ?? false : false,
  )
}

/**
 * Get streaming/busy status for a conversation (used by sidebar rows).
 */
export function useConversationActivityStatus(conversationId: string): {
  isActive: boolean
  hasCompletedAction: boolean
} {
  return usePiStore((s) => {
    const runtime = s.piByConversation[conversationId]
    const isActive =
      runtime?.status === 'streaming' ||
      runtime?.status === 'starting' ||
      !!runtime?.pendingUserMessage
    const hasCompletedAction = !!s.completedActionByConversation[conversationId]
    return { isActive, hasCompletedAction }
  })
}
