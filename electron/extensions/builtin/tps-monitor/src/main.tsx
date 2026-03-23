import React from 'react'
import { createRoot } from 'react-dom/client'
import './tps-monitor.css'

type ConversationStats = {
  totalTokens: number
  totalTime: number
  count: number
  lastUpdated: number
}

type UiState = {
  display: string
  dotClass: string
  valueClass: string
  tooltip: string
}

type Chaton = {
  extensionEventSubscribe?: (extensionId: string, topic: string, options?: Record<string, unknown>) => Promise<void>
  getInitialState?: () => Promise<unknown>
}

declare global {
  interface Window {
    chaton?: Chaton
  }
}

const EXTENSION_ID = '@chaton/tps-monitor'
const DEFAULT_TOOLTIP = 'Tokens per second (average for this conversation)'

function estimateTokens(charCount: number) {
  return Math.max(1, Math.round(charCount / 4))
}

function extractTextContent(message: unknown) {
  if (!message || typeof message !== 'object') return ''
  const content = (message as Record<string, unknown>).content
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && (item.type === 'text' || !item.type) && typeof item.text === 'string',
      )
      .map((item) => item.text as string)
      .join('')
  }
  return ''
}

function getTokenCount(message: unknown) {
  if (!message || typeof message !== 'object') return 0
  const msg = message as Record<string, unknown>
  if (typeof msg.usage === 'object' && msg.usage !== null) {
    const usage = msg.usage as Record<string, unknown>
    if (typeof usage.output === 'number') return usage.output
    if (typeof usage.totalTokens === 'number') return usage.totalTokens
  }
  const text = extractTextContent(message)
  return estimateTokens(text.length)
}

function getValueClass(value: number, streaming: boolean) {
  if (streaming) return 'tps-value streaming'
  if (value >= 50) return 'tps-value high'
  if (value >= 20) return 'tps-value medium'
  return 'tps-value'
}

function buildDefaultState(): UiState {
  return {
    display: '-',
    dotClass: 'tsp-dot',
    valueClass: 'tps-value',
    tooltip: DEFAULT_TOOLTIP,
  }
}

function TpsMonitor() {
  const statsRef = React.useRef<Map<string, ConversationStats>>(new Map())
  const currentConversationIdRef = React.useRef<string | null>(null)
  const streamingRef = React.useRef(false)
  const assistantStartRef = React.useRef<number | null>(null)
  const lastAssistantMessageIdRef = React.useRef<string | null>(null)
  const [uiState, setUiState] = React.useState<UiState>(buildDefaultState)

  const refreshDisplay = React.useCallback(() => {
    const conversationId = currentConversationIdRef.current
    const stats = conversationId ? statsRef.current.get(conversationId) : undefined
    if (!stats || stats.count === 0) {
      setUiState(buildDefaultState())
      return
    }
    const streaming = Boolean(streamingRef.current && assistantStartRef.current && lastAssistantMessageIdRef.current)
    const averageTokensPerSecond = stats.totalTime > 0 ? stats.totalTokens / stats.totalTime : 0
    const rounded = Math.max(0, Math.round(averageTokensPerSecond))
    const valueClass = getValueClass(averageTokensPerSecond, streaming)
    const dotClass = streaming ? 'tsp-dot streaming' : 'tsp-dot'
    const tooltip = streaming
      ? `Streaming... (average: ${rounded} tokens/sec)`
      : `Average: ${rounded} tokens/sec across ${stats.count} response(s)`
    setUiState({
      display: `${rounded}`,
      dotClass,
      valueClass,
      tooltip,
    })
  }, [])

  const recordAssistantMessage = React.useCallback(
    (message: unknown, startTime: number, endTime: number) => {
      const conversationId = currentConversationIdRef.current
      if (!conversationId) return
      const durationSeconds = Math.max(0.1, (endTime - startTime) / 1000)
      let tokens = getTokenCount(message)
      if (tokens < 1) tokens = estimateTokens(extractTextContent(message).length)
      const statsMap = statsRef.current
      let stats = statsMap.get(conversationId)
      if (!stats) {
        stats = { totalTokens: 0, totalTime: 0, count: 0, lastUpdated: Date.now() }
        statsMap.set(conversationId, stats)
      }
      stats.totalTokens += tokens
      stats.totalTime += durationSeconds
      stats.count += 1
      stats.lastUpdated = Date.now()
      if (statsMap.size > 100) {
        let oldestKey: string | null = null
        let oldestTime = Number.POSITIVE_INFINITY
        for (const [key, value] of statsMap.entries()) {
          if (value.lastUpdated < oldestTime) {
            oldestTime = value.lastUpdated
            oldestKey = key
          }
        }
        if (oldestKey) statsMap.delete(oldestKey)
      }
      refreshDisplay()
    },
    [refreshDisplay],
  )

  const handleTopbarContext = React.useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const context = payload as Record<string, unknown>
      const conversation = context.conversation as Record<string, unknown> | undefined
      const newConversationId = typeof conversation?.id === 'string' ? conversation.id : null
      if (newConversationId !== currentConversationIdRef.current) {
        currentConversationIdRef.current = newConversationId
        streamingRef.current = false
        assistantStartRef.current = null
        lastAssistantMessageIdRef.current = null
        refreshDisplay()
      }
    },
    [refreshDisplay],
  )

  const handleEventMessage = React.useCallback(
    (eventData: unknown) => {
      if (!eventData || typeof eventData !== 'object') return
      const data = eventData as Record<string, unknown>
      const topic = typeof data.topic === 'string' ? data.topic : null
      if (!topic) return
      const payload = (data.payload as Record<string, unknown>) || {}
      if (payload.conversationId && payload.conversationId !== currentConversationIdRef.current) return
      switch (topic) {
        case 'conversation.agent.started':
          streamingRef.current = true
          assistantStartRef.current = Date.now()
          lastAssistantMessageIdRef.current = null
          refreshDisplay()
          break
        case 'conversation.agent.ended':
          streamingRef.current = false
          assistantStartRef.current = null
          refreshDisplay()
          break
        case 'conversation.message.received': {
          const message = payload.message
          const role = (message as Record<string, unknown>)?.role || ((message as Record<string, unknown>)?.message as Record<string, unknown>)?.role
          if (role !== 'assistant') return
          if (assistantStartRef.current) {
            recordAssistantMessage(message, assistantStartRef.current, Date.now())
            assistantStartRef.current = null
          } else {
            const timestamp =
              (message &&
                (message as Record<string, unknown>).timestamp) ||
              (message && (message as Record<string, unknown>).createdAt) ||
              Date.now()
            recordAssistantMessage(message, Number(timestamp) - 2000, Number(timestamp))
          }
          lastAssistantMessageIdRef.current = (message as Record<string, unknown>)?.id || null
          break
        }
      }
    },
    [recordAssistantMessage, refreshDisplay],
  )

  const subscribeToEvents = React.useCallback(async () => {
    try {
      const subscribe = window.chaton?.extensionEventSubscribe
      if (!subscribe) return
      await subscribe(EXTENSION_ID, 'conversation.agent.started', {})
      await subscribe(EXTENSION_ID, 'conversation.agent.ended', {})
      await subscribe(EXTENSION_ID, 'conversation.message.received', {})
    } catch (error) {
      console.error('[TPS Monitor] Failed to subscribe to events:', error)
    }
  }, [])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type === 'chaton.extension.topbarContext') {
        handleTopbarContext(data.payload)
        return
      }
      if (data.type === 'chaton.extension.event') {
        handleEventMessage(data.payload)
        return
      }
    }
    window.addEventListener('message', handleMessage)
    subscribeToEvents()
    if (window.chaton?.getInitialState) {
      window.chaton.getInitialState().catch((error) => {
        console.error('[TPS Monitor] Failed to get initial state:', error)
      })
    }
    refreshDisplay()
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [handleEventMessage, handleTopbarContext, subscribeToEvents, refreshDisplay])

  return (
    <div className="tps-widget" title={uiState.tooltip}>
      <span className={uiState.dotClass} />
      <span className={uiState.valueClass}>{uiState.display}</span>
      <span className="tps-unit">t/s</span>
    </div>
  )
}

function mount() {
  const rootElement = document.getElementById('root')
  if (!rootElement) return false
  createRoot(rootElement).render(<TpsMonitor />)
  return true
}

if (!mount()) {
  window.addEventListener(
    'DOMContentLoaded',
    () => {
      void mount()
    },
    { once: true },
  )
}
