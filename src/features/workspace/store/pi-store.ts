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

// --- rAF-batched notification ---
// Multiple piStore mutations within a single frame are coalesced
// so subscribers (and therefore React) only re-render once per frame.
let rafId: number | null = null

function scheduleNotify() {
  if (rafId !== null) return // already scheduled
  rafId = requestAnimationFrame(() => {
    rafId = null
    for (const listener of listeners) {
      listener()
    }
  })
}

// Flush pending notification synchronously (used for actions that
// need immediate UI feedback like conversation selection).
export function piStoreFlush() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
    for (const listener of listeners) {
      listener()
    }
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
  scheduleNotify()
}

export function piStoreUpdate(updater: (prev: PiStoreState) => PiStoreState) {
  storeState = updater(storeState)
  perfMonitor.recordPiStoreUpdate()
  scheduleNotify()
}

/**
 * Replace state and notify subscribers synchronously (no rAF delay).
 * Use for user-initiated actions that need immediate UI feedback.
 */
export function piStoreReplaceSync(next: PiStoreState) {
  storeState = next
  perfMonitor.recordPiStoreUpdate()
  // Cancel any pending rAF since we're flushing now
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  for (const listener of listeners) {
    listener()
  }
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
 * Pi runtime metadata excluding messages.
 * Use this in components that need runtime status but should NOT re-render
 * on every streaming token (e.g. Composer). The messages array changes
 * on every token, causing a new runtime object reference. By selecting
 * only the metadata fields, the hook returns a stable reference when
 * only messages changed.
 */
export type PiRuntimeMeta = Omit<PiConversationRuntime, 'messages'>

export function usePiRuntimeMeta(conversationId: string | null): PiRuntimeMeta | null {
  // We cache a derived object that omits messages. It only changes
  // when a non-messages field changes.
  const prevRef = useRef<{ conversationId: string | null; meta: PiRuntimeMeta | null }>({
    conversationId: null,
    meta: null,
  })

  return usePiStore((s) => {
    if (!conversationId) return null
    const runtime = s.piByConversation[conversationId]
    if (!runtime) return null

    const prev = prevRef.current
    // Fast path: if same conversation and previous meta exists,
    // check if any non-messages field changed.
    if (prev.conversationId === conversationId && prev.meta) {
      const p = prev.meta
      if (
        p.status === runtime.status &&
        p.state === runtime.state &&
        p.activeStreamTurn === runtime.activeStreamTurn &&
        p.activeStreamEventSeq === runtime.activeStreamEventSeq &&
        p.pendingUserMessage === runtime.pendingUserMessage &&
        p.pendingUserMessageText === runtime.pendingUserMessageText &&
        p.pendingCommands === runtime.pendingCommands &&
        p.lastError === runtime.lastError &&
        p.extensionRequests === runtime.extensionRequests &&
        p.extensionStatus === runtime.extensionStatus &&
        p.extensionWidget === runtime.extensionWidget &&
        p.editorPrefill === runtime.editorPrefill &&
        p.threadActionSuggestions === runtime.threadActionSuggestions &&
        p.requirementSheet === runtime.requirementSheet
      ) {
        return prev.meta
      }
    }

    const meta: PiRuntimeMeta = {
      status: runtime.status,
      state: runtime.state,
      activeStreamTurn: runtime.activeStreamTurn,
      activeStreamEventSeq: runtime.activeStreamEventSeq,
      pendingUserMessage: runtime.pendingUserMessage,
      pendingUserMessageText: runtime.pendingUserMessageText,
      pendingCommands: runtime.pendingCommands,
      lastError: runtime.lastError,
      extensionRequests: runtime.extensionRequests,
      extensionStatus: runtime.extensionStatus,
      extensionWidget: runtime.extensionWidget,
      editorPrefill: runtime.editorPrefill,
      threadActionSuggestions: runtime.threadActionSuggestions,
      requirementSheet: runtime.requirementSheet,
    }
    prevRef.current = { conversationId, meta }
    return meta
  })
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
