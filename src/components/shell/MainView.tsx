import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { PiSettingsMainPanel } from '@/components/shell/PiSettingsMainPanel'
import { PiSkillsMainPanel } from '@/components/shell/PiSkillsMainPanel'
import { ChatonExtensionsMainPanel } from '@/components/shell/ChatonExtensionsMainPanel'
import { useWorkspace } from '@/features/workspace/store'
import type { JsonValue } from '@/features/workspace/rpc'
import heroCat from '@/assets/chaton-hero.webm'

type ToolBlock =
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

type AssistantMeta = {
  provider: string | null
  model: string | null
  api: string | null
  stopReason: string | null
  errorMessage: string | null
  usage: { input: number | null; output: number | null; totalTokens: number | null }
}

const THINKING_CAT_FRAMES = [
  'ᓚᘏᗢ   ◉',
  'ᓚᘏᗢ  ◉',
  'ᓚᘏᗢ ฅ◉',
  'ᓚᘏᗢ  ◉',
  'ᓚᘏᗢ   ◉',
  'ᓚᘏᗢ    ◉',
  'ᓚᘏᗢ   ◉',
  'ᓚᘏᗢ  ◉',
]


function sanitizeTerminalText(text: string): string {
  if (!text) return ''

  // Strip common ANSI CSI + OSC escape sequences to keep logs readable in cards.
  const withoutAnsi = text
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
  return withoutAnsi.replace(/\r\n?/g, '\n')
}

function ToolTerminal({ text, isError = false }: { text: string; isError?: boolean }) {
  const outputRef = useRef<HTMLPreElement | null>(null)
  const sanitizedText = useMemo(() => sanitizeTerminalText(text), [text])

  useEffect(() => {
    const node = outputRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [sanitizedText])

  return (
    <div className={`chat-tool-terminal ${isError ? 'chat-tool-terminal-error' : ''}`}>
      <pre ref={outputRef} className="chat-tool-code">
        {sanitizedText}
      </pre>
    </div>
  )
}

function LiveToolTrace({
  command,
  output,
  isRunning,
  isError = false,
}: {
  command: string
  output: string
  isRunning: boolean
  isError?: boolean
}) {
  const [phase, setPhase] = useState<'hidden' | 'enter' | 'exit'>(isRunning ? 'enter' : 'hidden')

  useEffect(() => {
    if (isRunning) {
      setPhase('enter')
      return
    }
    if (phase === 'enter') {
      setPhase('exit')
      const timer = window.setTimeout(() => setPhase('hidden'), 380)
      return () => window.clearTimeout(timer)
    }
  }, [isRunning, phase])

  if (!isRunning && phase === 'hidden') {
    return (
      <ToolTerminal
        text={`bash\n${command} $\n\n${output || '(commande terminée sans sortie)'}`}
        isError={isError}
      />
    )
  }

  return (
    <div className={`chat-live-trace ${phase === 'exit' ? 'chat-live-trace-exit' : 'chat-live-trace-enter'}`}>
      <ToolTerminal
        text={`bash\n${command} $\n\n${output || '(en attente de sortie...)'}`}
        isError={isError}
      />
    </div>
  )
}

function CollapsibleToolBlock({
  title,
  badge,
  startExpanded,
  children,
  maxHeight = 200,
}: {
  title: ReactNode
  badge: ReactNode
  startExpanded: boolean
  children: ReactNode
  maxHeight?: number
}) {
  const [isOpen, setIsOpen] = useState(startExpanded)
  const prevStartExpandedRef = useRef(startExpanded)
  const manualOpenRef = useRef(false)

  useEffect(() => {
    const wasExpanded = prevStartExpandedRef.current
    if (startExpanded !== wasExpanded) {
      // Auto-open while running, but do not auto-close on completion.
      if (startExpanded) {
        setIsOpen(startExpanded)
      }
    }
    prevStartExpandedRef.current = startExpanded
  }, [startExpanded])

  return (
    <section className="chat-tool-block">
      <details
        className="chat-tool-details"
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open
          setIsOpen(nextOpen)
          manualOpenRef.current = nextOpen
        }}
      >
        <summary className="chat-tool-title chat-tool-title-row chat-tool-summary">
          <span>{title}</span>
          {badge}
        </summary>
        <div className="chat-tool-content" style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto' }}>
          {children}
        </div>
      </details>
    </section>
  )
}

function HeroMascot() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const replayTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (replayTimeoutRef.current !== null) {
        window.clearTimeout(replayTimeoutRef.current)
      }
    }
  }, [])

  return (
    <video
      ref={videoRef}
      src={heroCat}
      className="hero-mascot"
      autoPlay
      muted
      playsInline
      aria-label="Chaton"
      onEnded={() => {
        if (replayTimeoutRef.current !== null) {
          window.clearTimeout(replayTimeoutRef.current)
        }
        replayTimeoutRef.current = window.setTimeout(() => {
          const node = videoRef.current
          if (!node) return
          node.currentTime = 0
          void node.play()
        }, 3000)
      }}
    />
  )
}

function extractText(value: JsonValue): string {
  if (typeof value === 'string') {
    return value
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).filter((item) => item.length > 0).join('\n')
  }

  const record = value as Record<string, JsonValue>
  if (typeof record.text === 'string') {
    return record.text
  }

  if (record.content) {
    return extractText(record.content)
  }

  if (record.message) {
    return extractText(record.message)
  }

  return ''
}

function getToolBlocks(value: JsonValue): ToolBlock[] {
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
      const text = extractText(source.content) || extractText(source.result)
      const isError = source.isError === true || source.error === true
      const details = source.details && typeof source.details === 'object' && !Array.isArray(source.details)
        ? (source.details as Record<string, JsonValue>)
        : null
      const truncation = details?.truncation && typeof details.truncation === 'object' && !Array.isArray(details.truncation)
        ? (details.truncation as Record<string, JsonValue>)
        : null
      const truncated = truncation?.truncated === true
      const fullOutputPath = typeof details?.fullOutputPath === 'string' ? details.fullOutputPath : null
      const toolCallId = typeof source.toolCallId === 'string' ? source.toolCallId : null
      return [{ kind: 'toolResult', toolName, text, isError, truncated, fullOutputPath, toolCallId }]
    }
    return []
  }

  const blocks: ToolBlock[] = []
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
      const toolCallId = typeof part.id === 'string' ? part.id : null
      blocks.push({ kind: 'toolCall', name, arguments: argumentsText, toolCallId })
      continue
    }

    if (type === 'toolResult') {
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'tool'
      const text = extractText(part.content) || extractText(part.result)
      const isError = part.isError === true || part.error === true
      const details = part.details && typeof part.details === 'object' && !Array.isArray(part.details)
        ? (part.details as Record<string, JsonValue>)
        : null
      const truncation = details?.truncation && typeof details.truncation === 'object' && !Array.isArray(details.truncation)
        ? (details.truncation as Record<string, JsonValue>)
        : null
      const truncated = truncation?.truncated === true
      const fullOutputPath = typeof details?.fullOutputPath === 'string' ? details.fullOutputPath : null
      const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : null
      blocks.push({ kind: 'toolResult', toolName, text, isError, truncated, fullOutputPath, toolCallId })
    }
  }

  return blocks
}

function getMessageTimestampMs(message: JsonValue): number | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  const root = message as Record<string, JsonValue>
  const nested =
    root.message && typeof root.message === 'object' && !Array.isArray(root.message)
      ? (root.message as Record<string, JsonValue>)
      : null
  const source = nested ?? root
  const ts = source.timestamp
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  return null
}

function summarizeToolCall(name: string, argsText: string): string {
  if (!argsText.trim()) return name
  try {
    const parsed = JSON.parse(argsText) as Record<string, unknown>
    const bashCmd =
      typeof parsed.cmd === 'string'
        ? parsed.cmd
        : typeof parsed.command === 'string'
          ? parsed.command
          : null
    if ((name === 'bash' || name === 'exec_command') && bashCmd && bashCmd.trim()) {
      return bashCmd.trim()
    }
    if (name === 'read' && typeof parsed.path === 'string' && parsed.path.trim()) {
      return `read ${parsed.path.trim()}`
    }
    if (name === 'edit' && typeof parsed.path === 'string' && parsed.path.trim()) {
      return `edit ${parsed.path.trim()}`
    }
    if (typeof parsed.query === 'string' && parsed.query.trim()) {
      return `${name} ${parsed.query.trim()}`
    }
    if (typeof parsed.url === 'string' && parsed.url.trim()) {
      return `${name} ${parsed.url.trim()}`
    }
    const firstStringField = Object.values(parsed).find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined
    if (firstStringField) {
      return `${name} ${firstStringField.trim()}`
    }
  } catch {
    // Keep fallback below.
  }
  const singleLine = argsText.replace(/\s+/g, ' ').trim()
  return singleLine.length > 40 ? `${singleLine.slice(0, 37)}...` : singleLine
}

function compactCommandLabel(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return 'commande'

  // Keep only the first command segment before heavy pipelines/chains.
  const firstSegment = trimmed.split(/\s*(?:\|\||&&|\|)\s*/)[0] ?? trimmed
  const tokens = firstSegment.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'commande'

  const bin = tokens[0]
  const urlToken = tokens.find((token) => /^https?:\/\//.test(token) || /^['"]https?:\/\//.test(token))
  if (urlToken) {
    const cleaned = urlToken.replace(/^['"]|['"]$/g, '')
    try {
      const host = new URL(cleaned).host
      return `${bin} ${host}`
    } catch {
      return `${bin} url`
    }
  }

  const arg = tokens.find((token) => !token.startsWith('-') && token !== bin)
  const base = arg ? `${bin} ${arg}` : bin
  return base.length > 34 ? `${base.slice(0, 31)}...` : base
}

function getMessageRole(message: JsonValue): 'user' | 'assistant' | 'system' | 'toolResult' {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return 'system'
  }

  const root = message as Record<string, JsonValue>
  const maybeRole = root.role
  if (maybeRole === 'user' || maybeRole === 'assistant' || maybeRole === 'system' || maybeRole === 'toolResult') {
    return maybeRole
  }

  if (root.message && typeof root.message === 'object' && !Array.isArray(root.message)) {
    const nestedRole = (root.message as Record<string, JsonValue>).role
    if (nestedRole === 'user' || nestedRole === 'assistant' || nestedRole === 'system' || nestedRole === 'toolResult') {
      return nestedRole
    }
  }

  return 'system'
}

function getToolResultInfo(message: JsonValue): { toolCallId: string | null; isError: boolean } | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  const root = message as Record<string, JsonValue>
  const nested =
    root.message && typeof root.message === 'object' && !Array.isArray(root.message)
      ? (root.message as Record<string, JsonValue>)
      : null
  const source = nested ?? root
  if (source.role !== 'toolResult') return null
  return {
    toolCallId: typeof source.toolCallId === 'string' ? source.toolCallId : null,
    isError: source.isError === true,
  }
}

function getAssistantMeta(message: JsonValue): AssistantMeta | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  if (record.role !== 'assistant') {
    return null
  }
  const usage = record.usage && typeof record.usage === 'object' && !Array.isArray(record.usage)
    ? (record.usage as Record<string, JsonValue>)
    : null
  return {
    provider: typeof record.provider === 'string' ? record.provider : null,
    model: typeof record.model === 'string' ? record.model : null,
    api: typeof record.api === 'string' ? record.api : null,
    stopReason: typeof record.stopReason === 'string' ? record.stopReason : null,
    errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : null,
    usage: {
      input: typeof usage?.input === 'number' ? usage.input : null,
      output: typeof usage?.output === 'number' ? usage.output : null,
      totalTokens: typeof usage?.totalTokens === 'number' ? usage.totalTokens : null,
    },
  }
}

function isZeroOrNullUsage(meta: AssistantMeta): boolean {
  const input = meta.usage.input ?? 0
  const output = meta.usage.output ?? 0
  const total = meta.usage.totalTokens ?? 0
  return input === 0 && output === 0 && total === 0
}

function getMessageId(message: JsonValue, index: number): string {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return `msg-${index}`
  }
  const record = message as Record<string, JsonValue>
  return typeof record.id === 'string' ? record.id : `msg-${index}`
}

function getStreamTurn(message: JsonValue): number | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  const turn = record.__streamTurn
  return typeof turn === 'number' ? turn : null
}

function getMessageToolTitleKey(message: JsonValue): string | null {
  const blocks = getToolBlocks(message)
  if (blocks.length === 0) return null
  const first = blocks[0]
  if (first.kind !== 'toolCall') return null
  if (first.toolCallId) {
    // Streaming updates for the same tool call can temporarily carry weaker args (e.g. "{}").
    // Keying by toolCallId keeps only the latest representation for that call.
    return `toolCallId:${first.toolCallId}`
  }
  const rawSummary = summarizeToolCall(first.name, first.arguments)
  const callSummary = compactCommandLabel(rawSummary)
  return `toolCall:${callSummary}`
}

function normalizeToolTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function isLikelySameToolTitle(previousTitle: string, nextTitle: string): boolean {
  const prev = normalizeToolTitle(previousTitle)
  const next = normalizeToolTitle(nextTitle)
  if (!prev || !next) return false
  return next.startsWith(prev) || prev.startsWith(next)
}

function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__/.test(text)
}

function dedupeToolCalls(blocks: ToolBlock[]): Array<Extract<ToolBlock, { kind: 'toolCall' }>> {
  const seen = new Set<string>()
  const unique: Array<Extract<ToolBlock, { kind: 'toolCall' }>> = []

  for (const block of blocks) {
    if (block.kind !== 'toolCall') continue
    const key = block.toolCallId ? `id:${block.toolCallId}` : `sig:${block.name}:${block.arguments.trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(block)
  }
  return unique
}

function getToolCallSignature(block: Extract<ToolBlock, { kind: 'toolCall' }>): string {
  return `sig:${block.name}:${block.arguments.trim()}`
}

function dedupeToolCallMessages(messages: JsonValue[]): JsonValue[] {
  const deduped: JsonValue[] = []
  const seenByKey = new Map<string, number>()

  for (const message of messages) {
    const blocks = dedupeToolCalls(getToolBlocks(message))
    const toolCalls = blocks.filter((block): block is Extract<ToolBlock, { kind: 'toolCall' }> => block.kind === 'toolCall')
    const text = extractText(message).trim()
    const isToolOnly = text.length === 0 && toolCalls.length > 0

    if (!isToolOnly) {
      deduped.push(message)
      continue
    }

    let replaced = false
    for (const call of toolCalls) {
      const signatureKey = getToolCallSignature(call)
      const idKey = call.toolCallId ? `id:${call.toolCallId}` : null
      const existingIndex = (idKey ? seenByKey.get(idKey) : undefined) ?? seenByKey.get(signatureKey)

      if (existingIndex !== undefined) {
        deduped[existingIndex] = message
        if (idKey) seenByKey.set(idKey, existingIndex)
        seenByKey.set(signatureKey, existingIndex)
        replaced = true
        break
      }
    }

    if (!replaced) {
      const newIndex = deduped.length
      deduped.push(message)
      for (const call of toolCalls) {
        const signatureKey = getToolCallSignature(call)
        if (call.toolCallId) seenByKey.set(`id:${call.toolCallId}`, newIndex)
        seenByKey.set(signatureKey, newIndex)
      }
    }
  }

  return deduped
}

type ExplorationEvent =
  | { kind: 'read'; label: string }
  | { kind: 'search'; label: string }

function parseExplorationEventFromCommand(command: string): ExplorationEvent | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  const readMatch = trimmed.match(/(?:^|\s)(?:cat|sed|head|tail)\b[^\n]*?\s([\w./-]+\.[\w]+)(?:\s|$)/)
  if (readMatch?.[1]) {
    const path = readMatch[1].trim()
    const filename = path.split('/').filter(Boolean).pop() ?? path
    return { kind: 'read', label: `Read ${filename}` }
  }

  if (trimmed.startsWith('rg ')) {
    const inMatch = trimmed.match(/\s([\w./-]+)\s*$/)
    const scope = inMatch?.[1] && !inMatch[1].startsWith('-') ? inMatch[1] : 'workspace'
    const queryQuoted = trimmed.match(/"([^"]+)"|'([^']+)'/)
    const query = queryQuoted?.[1] ?? queryQuoted?.[2] ?? 'pattern'
    return { kind: 'search', label: `Searched for ${query} in ${scope}` }
  }

  return null
}

function getExplorationEvent(block: Extract<ToolBlock, { kind: 'toolCall' }>): ExplorationEvent | null {
  const summary = summarizeToolCall(block.name, block.arguments)
  if (block.name !== 'bash' && block.name !== 'exec_command') return null
  return parseExplorationEventFromCommand(summary)
}

export function MainView() {
  const { state, respondExtensionUi } = useWorkspace()
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [thinkingFrameIndex, setThinkingFrameIndex] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const selectedConversation = state.conversations.find((conversation) => conversation.id === state.selectedConversationId)
  const selectedRuntime = selectedConversation ? state.piByConversation[selectedConversation.id] : null
  const isStreaming = selectedRuntime?.status === 'streaming'

  const messages = useMemo(() => {
    if (!selectedRuntime?.messages) {
      return []
    }
    return selectedRuntime.messages
  }, [selectedRuntime?.messages])
  const displayMessages = useMemo(() => {
    if (!isStreaming) return messages
    const activeTurn = selectedRuntime?.activeStreamTurn ?? null
    if (activeTurn === null) return messages

    const reduced: JsonValue[] = []
    for (const message of messages) {
      const turn = getStreamTurn(message)
      const titleKey = getMessageToolTitleKey(message)
      if (turn === activeTurn && titleKey && reduced.length > 0) {
        const prev = reduced[reduced.length - 1]
        const prevTurn = getStreamTurn(prev)
        const prevTitleKey = getMessageToolTitleKey(prev)
        if (prevTurn === activeTurn && prevTitleKey && isLikelySameToolTitle(prevTitleKey, titleKey)) {
          reduced[reduced.length - 1] = message
          continue
        }
      }
      reduced.push(message)
    }
    return dedupeToolCallMessages(reduced)
  }, [isStreaming, messages, selectedRuntime?.activeStreamTurn])
  const pendingUserMessageText = selectedRuntime?.pendingUserMessageText ?? null
  const isExecutionActive =
    isStreaming || Boolean(selectedRuntime?.pendingUserMessage) || (selectedRuntime?.pendingCommands ?? 0) > 0

  useEffect(() => {
    if (!isExecutionActive) {
      setThinkingFrameIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setThinkingFrameIndex((current) => (current + 1) % THINKING_CAT_FRAMES.length)
    }, 180)
    return () => window.clearInterval(timer)
  }, [isExecutionActive])
  useEffect(() => {
    if (!isExecutionActive) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isExecutionActive])
  const toolResultStatusByCallId = useMemo(() => {
    const statusByCallId = new Map<string, 'success' | 'error' | 'running'>()

    for (const message of displayMessages) {
      const blocks = getToolBlocks(message)
      for (const block of blocks) {
        if (block.kind === 'toolCall' && block.toolCallId) {
          statusByCallId.set(block.toolCallId, 'running')
        }
      }
    }

    for (const message of displayMessages) {
      const toolResult = getToolResultInfo(message)
      if (toolResult?.toolCallId) {
        statusByCallId.set(toolResult.toolCallId, toolResult.isError ? 'error' : 'success')
      }
      const blocks = getToolBlocks(message)
      for (const block of blocks) {
        if (block.kind === 'toolResult' && block.toolCallId) {
          statusByCallId.set(block.toolCallId, block.isError ? 'error' : 'success')
        }
      }
    }
    
    return statusByCallId
  }, [displayMessages])

  const toolCallTimingById = useMemo(() => {
    const timing = new Map<string, { startMs: number | null; endMs: number | null }>()
    for (const message of displayMessages) {
      const ts = getMessageTimestampMs(message)
      const blocks = getToolBlocks(message)
      for (const block of blocks) {
        if (block.kind === 'toolCall' && block.toolCallId) {
          const prev = timing.get(block.toolCallId) ?? { startMs: null, endMs: null }
          timing.set(block.toolCallId, { startMs: prev.startMs ?? ts, endMs: prev.endMs })
        }
        if (block.kind === 'toolResult' && block.toolCallId) {
          const prev = timing.get(block.toolCallId) ?? { startMs: null, endMs: null }
          timing.set(block.toolCallId, { startMs: prev.startMs, endMs: ts ?? prev.endMs })
        }
      }
      const standaloneResult = getToolResultInfo(message)
      if (standaloneResult?.toolCallId) {
        const prev = timing.get(standaloneResult.toolCallId) ?? { startMs: null, endMs: null }
        timing.set(standaloneResult.toolCallId, { startMs: prev.startMs, endMs: ts ?? prev.endMs })
      }
    }
    return timing
  }, [displayMessages])
  const toolResultTextByCallId = useMemo(() => {
    const outputs = new Map<string, { text: string; isError: boolean }>()
    for (const message of displayMessages) {
      const blocks = getToolBlocks(message)
      for (const block of blocks) {
        if (block.kind === 'toolResult' && block.toolCallId) {
          outputs.set(block.toolCallId, { text: block.text, isError: block.isError })
        }
      }
    }
    return outputs
  }, [displayMessages])

  useEffect(() => {
    if (!selectedConversation) return
    const container = scrollRef.current
    if (!container) return

    // On thread switch, compute bottom state from actual scroll position
    // so the jump button doesn't flash with stale state from previous thread.
    const syncBottomState = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight
      const atBottom = distance < 36
      setIsAtBottom(atBottom)
      if (!atBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
        setIsAtBottom(true)
      }
    }

    requestAnimationFrame(syncBottomState)
  }, [selectedConversation?.id])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) {
      return
    }
    // Respect manual scroll-up: only auto-follow while user is at the bottom.
    if (!isAtBottom) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isExecutionActive ? 'auto' : 'smooth',
    })
  }, [isAtBottom, isExecutionActive, displayMessages, selectedRuntime?.status])

  if (state.sidebarMode === 'settings') {
    return <PiSettingsMainPanel />
  }
  if (state.sidebarMode === 'skills') {
    return <PiSkillsMainPanel />
  }
  if (state.sidebarMode === 'extensions') {
    return <ChatonExtensionsMainPanel />
  }

  if (!selectedConversation) {
    return (
      <div className="main-scroll">
        <section className="hero-section">
          <div className="hero-group">
            <HeroMascot />
            <h1 className="hero-title">Sélectionnez un fil</h1>
            <div className="hero-subtitle">ou créez-en un depuis la barre latérale</div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div
      className="main-scroll"
      ref={scrollRef}
      onScroll={(event) => {
        const target = event.currentTarget
        const distance = target.scrollHeight - target.scrollTop - target.clientHeight
        setIsAtBottom(distance < 36)
      }}
    >
      <section className="chat-section">
        <div className="chat-timeline">
          {messages.length === 0 && !selectedRuntime?.pendingUserMessage && !isStreaming ? (
            <section className="hero-section">
              <div className="hero-group">
                <HeroMascot />
                <h1 className="hero-title">Démarrez la conversation</h1>
                <div className="hero-subtitle">Écrivez votre premier message ci-dessous</div>
              </div>
            </section>
          ) : null}
          {pendingUserMessageText ? (
            <article className="chat-message chat-message-user">
              <div className="chat-message-body">
                <pre className="chat-message-text">{pendingUserMessageText}</pre>
              </div>
            </article>
          ) : null}
          {displayMessages.map((message, index) => {
            const id = getMessageId(message, index)
            const role = getMessageRole(message)
            const isToolResultMessage = role === 'toolResult'
            const text = isToolResultMessage ? '' : extractText(message)
            const toolBlocks = getToolBlocks(message)
            const visibleToolBlocks = dedupeToolCalls(toolBlocks)
            const assistantMeta = getAssistantMeta(message)
            const fallbackAssistantErrorText =
              role === 'assistant' && !text && assistantMeta?.errorMessage
                ? assistantMeta.errorMessage
                : ''
            const hasToolBlocks = visibleToolBlocks.length > 0
            if (!hasToolBlocks && !text && !fallbackAssistantErrorText) {
              return null
            }
            const hasAssistantMeta = Boolean(
              state.settings.showAssistantStats && assistantMeta && !isStreaming && !isZeroOrNullUsage(assistantMeta),
            )
            return (
              <article
                key={`${id}-${index}`}
                className={`chat-message chat-message-${role}${hasAssistantMeta ? ' chat-message-with-meta' : ''}${hasToolBlocks && !text ? ' chat-message-tools-only' : ''}`}
              >
                <div className="chat-message-body">
                  {hasToolBlocks ? (
                    <div className="chat-tool-blocks">
                      {(() => {
                        const rendered: ReactNode[] = []
                        let groupIndex = 0

                        for (let i = 0; i < visibleToolBlocks.length; i += 1) {
                          const current = visibleToolBlocks[i]
                          if (current.kind !== 'toolCall') continue

                          const events: ExplorationEvent[] = []
                          const groupedCalls: Array<Extract<ToolBlock, { kind: 'toolCall' }>> = []
                          let j = i
                          while (j < visibleToolBlocks.length) {
                            const candidate = visibleToolBlocks[j]
                            if (candidate.kind !== 'toolCall') break
                            const event = getExplorationEvent(candidate)
                            if (!event) break
                            events.push(event)
                            groupedCalls.push(candidate)
                            j += 1
                          }

                          if (events.length >= 2) {
                            const readCount = events.filter((item) => item.kind === 'read').length
                            const searchCount = events.filter((item) => item.kind === 'search').length
                            const statuses = groupedCalls.map((call) =>
                              call.toolCallId ? toolResultStatusByCallId.get(call.toolCallId) ?? 'running' : 'running',
                            )
                            const hasError = statuses.includes('error')
                            const isRunning = statuses.includes('running')
                            const badge = hasError ? (
                              <span className="chat-tool-badge chat-tool-badge-error">error</span>
                            ) : isRunning ? (
                              <span className="chat-tool-badge">running</span>
                            ) : (
                              <span className="chat-tool-badge chat-tool-badge-success">success</span>
                            )
                            rendered.push(
                              <CollapsibleToolBlock
                                key={`${id}-toolgroup-${groupIndex}`}
                                title={<>{`${readCount} fichiers,${searchCount} recherche exploré(s)`}</>}
                                badge={badge}
                                startExpanded={isRunning}
                                maxHeight={180}
                              >
                                <pre className="chat-tool-code-preview">{events.map((item) => item.label).join('\n')}</pre>
                              </CollapsibleToolBlock>,
                            )
                            groupIndex += 1
                            i = j - 1
                            continue
                          }

                          const blockIndex = i
                          const callStatus = current.toolCallId ? toolResultStatusByCallId.get(current.toolCallId) : 'running'
                          const isRunning = callStatus === 'running'
                          const rawSummary = summarizeToolCall(current.name, current.arguments)
                          const callSummary = compactCommandLabel(rawSummary)
                          const timing = current.toolCallId ? toolCallTimingById.get(current.toolCallId) : null
                          const durationSec =
                            timing?.startMs && timing?.endMs && timing.endMs >= timing.startMs
                              ? Math.max(1, Math.round((timing.endMs - timing.startMs) / 1000))
                              : null
                          const runningDurationSec =
                            isRunning && timing?.startMs ? Math.max(1, Math.round((nowMs - timing.startMs) / 1000)) : null
                          const badge =
                            callStatus === 'error' ? (
                              <span className="chat-tool-badge chat-tool-badge-error">error</span>
                            ) : callStatus === 'success' ? (
                              <span className="chat-tool-badge chat-tool-badge-success">success</span>
                            ) : (
                              <span className="chat-tool-badge">running</span>
                            )

                          rendered.push(
                            <CollapsibleToolBlock
                              key={`${id}-toolcall-${blockIndex}`}
                              title={
                                <>
                                  {isRunning ? (
                                    <>
                                      Exécution de la commande en cours {runningDurationSec !== null ? <>pour <strong>{runningDurationSec}s</strong></> : null}
                                    </>
                                  ) : (
                                    <>
                                      Exécuté <strong>{callSummary}</strong>
                                      {durationSec !== null ? <> pour {durationSec}s</> : null}
                                    </>
                                  )}
                                </>
                              }
                              badge={badge}
                              startExpanded={isRunning}
                              maxHeight={260}
                            >
                              <LiveToolTrace
                                command={rawSummary}
                                output={current.toolCallId ? (toolResultTextByCallId.get(current.toolCallId)?.text ?? '') : ''}
                                isRunning={isRunning}
                                isError={current.toolCallId ? (toolResultTextByCallId.get(current.toolCallId)?.isError ?? false) : false}
                              />
                            </CollapsibleToolBlock>,
                          )
                        }

                        return rendered
                      })()}
                    </div>
                  ) : null}
                  {text || fallbackAssistantErrorText ? (
                    hasMarkdownSyntax(text || fallbackAssistantErrorText) ? (
                      <div className="chat-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || fallbackAssistantErrorText}</ReactMarkdown>
                      </div>
                    ) : (
                      <pre className="chat-message-text">{text || fallbackAssistantErrorText}</pre>
                    )
                  ) : null}
                  {hasAssistantMeta && assistantMeta ? (
                    <div className="chat-assistant-meta">
                      <span>{assistantMeta.provider ?? 'provider?'}</span>
                      <span>{assistantMeta.model ?? 'model?'}</span>
                      {assistantMeta.api ? <span>api: {assistantMeta.api}</span> : null}
                      {assistantMeta.stopReason ? <span>stop: {assistantMeta.stopReason}</span> : null}
                      {assistantMeta.usage.totalTokens !== null ? (
                        <span>
                          tokens: in {assistantMeta.usage.input ?? 0} / out {assistantMeta.usage.output ?? 0} / total {assistantMeta.usage.totalTokens}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
          {isStreaming ? (
            <article className="chat-message chat-message-assistant">
              <div className="chat-message-body">
                <div className="chat-streaming-indicator" aria-live="polite">
                  <span className="chat-streaming-indicator-frame">{THINKING_CAT_FRAMES[thinkingFrameIndex]}</span>
                </div>
              </div>
            </article>
          ) : null}
        </div>

      </section>

      {!isAtBottom ? (
        <button
          type="button"
          className="jump-bottom-button"
          onClick={() => {
            const container = scrollRef.current
            if (!container) return
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
            setIsAtBottom(true)
          }}
        >
          Aller en bas
        </button>
      ) : null}

      {selectedRuntime?.extensionRequests?.[0] ? (
        <div className="extension-modal-backdrop">
          <div className="extension-modal" role="dialog" aria-modal="true">
            <div className="extension-modal-title">{selectedRuntime.extensionRequests[0].method}</div>
            <pre className="extension-modal-content">
              {JSON.stringify(selectedRuntime.extensionRequests[0].payload, null, 2)}
            </pre>
            <div className="extension-modal-actions">
              <button
                type="button"
                className="extension-modal-btn"
                onClick={() =>
                  void respondExtensionUi(selectedConversation.id, {
                    type: 'extension_ui_response',
                    id: selectedRuntime.extensionRequests[0].id,
                    cancelled: true,
                  })
                }
              >
                Annuler
              </button>
              <button
                type="button"
                className="extension-modal-btn extension-modal-btn-primary"
                onClick={() =>
                  void respondExtensionUi(selectedConversation.id, {
                    type: 'extension_ui_response',
                    id: selectedRuntime.extensionRequests[0].id,
                    confirmed: true,
                  })
                }
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
