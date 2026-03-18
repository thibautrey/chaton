import type { JsonValue } from '@/features/workspace/rpc'
import type {
  AssistantMeta,
  ExplorationEvent,
  FileChangeSummary,
  GroupedToolCall,
  MessageRole,
  ToolBlock,
  ToolResultInfo,
} from '@/components/shell/mainView/types'

const HIDDEN_TASK_TOOL_NAMES = new Set(['create_task_list', 'update_task_status'])

function shouldHideToolFromConversation(name: string): boolean {
  return HIDDEN_TASK_TOOL_NAMES.has(name)
}

export function extractText(value: JsonValue): string {
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

export function getToolBlocks(value: JsonValue): ToolBlock[] {
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
      const details =
        source.details && typeof source.details === 'object' && !Array.isArray(source.details)
          ? (source.details as Record<string, JsonValue>)
          : null
      const truncation =
        details?.truncation && typeof details.truncation === 'object' && !Array.isArray(details.truncation)
          ? (details.truncation as Record<string, JsonValue>)
          : null
      const truncated = truncation?.truncated === true
      const fullOutputPath = typeof details?.fullOutputPath === 'string' ? details.fullOutputPath : null
      const toolCallId = typeof source.toolCallId === 'string' ? source.toolCallId : null
      return [
        {
          kind: 'toolResult',
          toolName,
          text,
          isError,
          truncated,
          fullOutputPath,
          toolCallId,
          hiddenFromConversation: shouldHideToolFromConversation(toolName),
        },
      ]
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
      blocks.push({
        kind: 'toolCall',
        name,
        arguments: argumentsText,
        toolCallId,
        hiddenFromConversation: shouldHideToolFromConversation(name),
      })
      continue
    }

    if (type === 'toolResult') {
      const toolName = typeof part.toolName === 'string' ? part.toolName : 'tool'
      const text = extractText(part.content) || extractText(part.result)
      const isError = part.isError === true || part.error === true
      const details =
        part.details && typeof part.details === 'object' && !Array.isArray(part.details)
          ? (part.details as Record<string, JsonValue>)
          : null
      const truncation =
        details?.truncation && typeof details.truncation === 'object' && !Array.isArray(details.truncation)
          ? (details.truncation as Record<string, JsonValue>)
          : null
      const truncated = truncation?.truncated === true
      const fullOutputPath = typeof details?.fullOutputPath === 'string' ? details.fullOutputPath : null
      const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : null
      blocks.push({
        kind: 'toolResult',
        toolName,
        text,
        isError,
        truncated,
        fullOutputPath,
        toolCallId,
        hiddenFromConversation: shouldHideToolFromConversation(toolName),
      })
    }
  }

  return blocks
}

export function getFileChangeSummary(value: JsonValue): FileChangeSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, JsonValue>
  const nestedMessage =
    record.message && typeof record.message === 'object' && !Array.isArray(record.message)
      ? (record.message as Record<string, JsonValue>)
      : null
  const source = nestedMessage ?? record
  const content = Array.isArray(source.content) ? source.content : null
  if (!content) {
    return null
  }

  for (const item of content) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const part = item as Record<string, JsonValue>
    if (part.type !== 'fileChanges') {
      continue
    }
    const label = typeof part.label === 'string' && part.label.trim().length > 0 ? part.label : 'Modifié'
    const filesRaw = Array.isArray(part.files) ? part.files : []
    const files = filesRaw
      .map((file): { path: string; added: number; removed: number } | null => {
        if (!file || typeof file !== 'object' || Array.isArray(file)) {
          return null
        }
        const fileRecord = file as Record<string, JsonValue>
        const path = typeof fileRecord.path === 'string' ? fileRecord.path : ''
        const added = typeof fileRecord.added === 'number' ? fileRecord.added : 0
        const removed = typeof fileRecord.removed === 'number' ? fileRecord.removed : 0
        if (!path) {
          return null
        }
        return { path, added, removed }
      })
      .filter((file): file is { path: string; added: number; removed: number } => file !== null)
    if (files.length === 0) {
      return null
    }
    return { label, files }
  }

  return null
}

export function getMessageTimestampMs(message: JsonValue): number | null {
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

export function summarizeToolCall(name: string, argsText: string): string {
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
    const firstStringField = Object.values(parsed).find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    ) as string | undefined
    if (firstStringField) {
      return `${name} ${firstStringField.trim()}`
    }
  } catch {
    // Keep fallback below.
  }
  const singleLine = argsText.replace(/\s+/g, ' ').trim()
  return singleLine.length > 40 ? `${singleLine.slice(0, 37)}...` : singleLine
}

export function compactCommandLabel(command: string): string {
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
  return base
}

export function getMessageRole(message: JsonValue): MessageRole {
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
    if (
      nestedRole === 'user' ||
      nestedRole === 'assistant' ||
      nestedRole === 'system' ||
      nestedRole === 'toolResult'
    ) {
      return nestedRole
    }
  }

  return 'system'
}

export function getToolResultInfo(message: JsonValue): ToolResultInfo | null {
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

export function getAssistantMeta(message: JsonValue): AssistantMeta | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  if (record.role !== 'assistant') {
    return null
  }
  const usage =
    record.usage && typeof record.usage === 'object' && !Array.isArray(record.usage)
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

export function isZeroOrNullUsage(meta: AssistantMeta): boolean {
  const input = meta.usage.input ?? 0
  const output = meta.usage.output ?? 0
  const total = meta.usage.totalTokens ?? 0
  return input === 0 && output === 0 && total === 0
}

export function getMessageId(message: JsonValue, index: number): string {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return `msg-${index}`
  }
  const record = message as Record<string, JsonValue>
  return typeof record.id === 'string' ? record.id : `msg-${index}`
}

export function getStreamTurn(message: JsonValue): number | null {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return null
  }
  const record = message as Record<string, JsonValue>
  const turn = record.__streamTurn
  return typeof turn === 'number' ? turn : null
}

export function getMessageToolTitleKey(message: JsonValue): string | null {
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

export function normalizeToolTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function isLikelySameToolTitle(previousTitle: string, nextTitle: string): boolean {
  const prev = normalizeToolTitle(previousTitle)
  const next = normalizeToolTitle(nextTitle)
  if (!prev || !next) return false
  return next.startsWith(prev) || prev.startsWith(next)
}

// Regex patterns for common thinking block formats
// Matches: <thinking>...</thinking>, <think>...</think>, and multiline variants
const THINKING_PATTERNS = [
  // XML-style: <thinking>...</thinking> (with optional attributes)
  /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi,
  // Anthropic-style: <think>...</think>
  /<think>[\s\S]*?<\/think>/gi,
  // OpenAI o1 style: <think>...</think> (sometimes with extra content)
  /\s*<think>[\s\S]*?<\/think>\s*/gi,
]

/**
 * Removes thinking/reasoning blocks from text that models sometimes include in responses.
 * These are internal reasoning traces that users typically don't want to see.
 */
export function stripThinkingBlocks(text: string): string {
  if (!text) return text
  
  let result = text
  for (const pattern of THINKING_PATTERNS) {
    result = result.replace(pattern, '')
  }
  
  // Clean up any resulting empty lines or excessive whitespace from removed blocks
  return result
    .replace(/\n{3,}/g, '\n\n')  // Replace 3+ consecutive newlines with 2
    .replace(/^\n+/, '')          // Remove leading newlines
    .replace(/\n+$/, '')          // Remove trailing newlines
    .trim()
}

export function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__/.test(text)
}

export function dedupeToolCalls(blocks: ToolBlock[]): Array<Extract<ToolBlock, { kind: 'toolCall' }>> {
  const seen = new Set<string>()
  const unique: Array<Extract<ToolBlock, { kind: 'toolCall' }>> = []

  for (const block of blocks) {
    if (block.kind !== 'toolCall') continue
    const key = block.toolCallId ? `id:${block.toolCallId}` : `sig:${block.name}:${block.arguments.replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(block)
  }
  return unique
}

function getToolCallGroupKey(block: Extract<ToolBlock, { kind: 'toolCall' }>): string | null {
  const summary = summarizeToolCall(block.name, block.arguments)

  if (/^(read|edit|write)\s+.+/.test(summary)) {
    return summary.trim()
  }

  // Group similar bash commands together (e.g., multiple find commands)
  if (block.name === 'bash') {
    const bashCmd = summary.replace(/^bash\s+/, '').trim()
    const commandName = bashCmd.split(/\s+/)[0]
    
    // Group find commands by their base pattern (find with different paths)
    if (commandName === 'find') {
      return 'find'
    }
    
    // Group grep/rg commands  
    if (commandName === 'grep' || commandName === 'rg') {
      return commandName
    }
    
    // Group ls commands
    if (commandName === 'ls') {
      return 'ls'
    }
  }

  return null
}

export function groupSuccessiveIdenticalToolCalls(blocks: ToolBlock[]): GroupedToolCall[] {
  const result: GroupedToolCall[] = []

  let i = 0
  while (i < blocks.length) {
    const current = blocks[i]
    if (current.kind !== 'toolCall') {
      i += 1
      continue
    }

    const exactSignature = `${current.name}:${current.arguments.replace(/\s+/g, ' ').trim()}`
    const groupingKey = getToolCallGroupKey(current)
    const groupedIndices = [i]

    let j = i + 1
    while (j < blocks.length) {
      const next = blocks[j]
      if (next.kind !== 'toolCall') break

      const nextExactSignature = `${next.name}:${next.arguments.replace(/\s+/g, ' ').trim()}`
      const nextGroupingKey = getToolCallGroupKey(next)
      const isSameExactCall = nextExactSignature === exactSignature
      const isSameGroupedFileCall = groupingKey !== null && groupingKey === nextGroupingKey

      if (isSameExactCall || isSameGroupedFileCall) {
        groupedIndices.push(j)
        j += 1
      } else {
        break
      }
    }

    result.push({
      call: current,
      calls: groupedIndices.map((index) => blocks[index]).filter(
        (block): block is Extract<ToolBlock, { kind: 'toolCall' }> => block.kind === 'toolCall',
      ),
      count: groupedIndices.length,
      indices: groupedIndices,
    })
    i = j
  }

  return result
}

export function getToolCallSignature(block: Extract<ToolBlock, { kind: 'toolCall' }>): string {
  if (block.toolCallId) {
    return `id:${block.toolCallId}`
  }
  return `sig:${block.name}:${block.arguments.replace(/\s+/g, ' ').trim()}`
}

function messageHasInlineToolResult(message: JsonValue): boolean {
  const blocks = getToolBlocks(message)
  return blocks.some((block) => block.kind === 'toolResult')
}

export function dedupeToolCallMessages(messages: JsonValue[]): JsonValue[] {
  const deduped: JsonValue[] = []
  // Maps tool-call key -> index in `deduped` array
  const seenByKey = new Map<string, number>()
  // Track which indices in `deduped` are tool-only messages so they can be evicted
  const toolOnlyIndices = new Set<number>()

  for (const message of messages) {
    const blocks = dedupeToolCalls(getToolBlocks(message))
    const toolCalls = blocks.filter(
      (block): block is Extract<ToolBlock, { kind: 'toolCall' }> => block.kind === 'toolCall',
    )
    const text = extractText(message).trim()
    const isToolOnly = text.length === 0 && toolCalls.length > 0

    if (!isToolOnly) {
      // Not a tool-only message (e.g. has text + tool calls, or is a plain text message).
      // Always keep it, but register its tool call keys so later tool-only duplicates are dropped.
      // Also evict any earlier tool-only messages whose tool calls are now covered by this richer message.
      for (const call of toolCalls) {
        const signatureKey = getToolCallSignature(call)
        const idKey = call.toolCallId ? `id:${call.toolCallId}` : null
        const existingIndex = (idKey ? seenByKey.get(idKey) : undefined) ?? seenByKey.get(signatureKey)
        if (existingIndex !== undefined && toolOnlyIndices.has(existingIndex)) {
          // Mark the earlier tool-only message for removal (nullify it)
          deduped[existingIndex] = null as unknown as JsonValue
          toolOnlyIndices.delete(existingIndex)
        }
      }
      const newIndex = deduped.length
      deduped.push(message)
      for (const call of toolCalls) {
        const signatureKey = getToolCallSignature(call)
        if (call.toolCallId) seenByKey.set(`id:${call.toolCallId}`, newIndex)
        seenByKey.set(signatureKey, newIndex)
      }
      continue
    }

    let replaced = false
    for (const call of toolCalls) {
      const signatureKey = getToolCallSignature(call)
      const idKey = call.toolCallId ? `id:${call.toolCallId}` : null
      const existingIndex = (idKey ? seenByKey.get(idKey) : undefined) ?? seenByKey.get(signatureKey)

      if (existingIndex !== undefined) {
        // Prefer the message that has an inline toolResult (more complete data).
        // This avoids replacing a fully-merged tool-exec message with a bare toolCall-only duplicate.
        const existingHasResult = messageHasInlineToolResult(deduped[existingIndex])
        const incomingHasResult = messageHasInlineToolResult(message)
        if (!existingHasResult && incomingHasResult) {
          deduped[existingIndex] = message
        }
        if (idKey) seenByKey.set(idKey, existingIndex)
        seenByKey.set(signatureKey, existingIndex)
        replaced = true
        break
      }
    }

    if (!replaced) {
      const newIndex = deduped.length
      deduped.push(message)
      toolOnlyIndices.add(newIndex)
      for (const call of toolCalls) {
        const signatureKey = getToolCallSignature(call)
        if (call.toolCallId) seenByKey.set(`id:${call.toolCallId}`, newIndex)
        seenByKey.set(signatureKey, newIndex)
      }
    }
  }

  // Filter out nullified (evicted) entries
  return deduped.filter((msg) => msg !== null)
}

export function parseExplorationEventFromCommand(command: string): ExplorationEvent | null {
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

export function getExplorationEvent(block: Extract<ToolBlock, { kind: 'toolCall' }>): ExplorationEvent | null {
  const summary = summarizeToolCall(block.name, block.arguments)
  if (block.name !== 'bash' && block.name !== 'exec_command') return null
  return parseExplorationEventFromCommand(summary)
}
