import type { ReactNode } from 'react'
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { InlineFileDiff } from '@/components/shell/mainView/InlineFileDiff'
import { TypewriterText } from '@/components/shell/mainView/TypewriterText'
import { CollapsibleToolBlock, LiveToolTrace } from '@/components/shell/mainView/ToolBlocks'
import { MessageAttachments, hasAttachments, parseAttachmentsFromText, removeAttachmentText } from '@/components/shell/mainView/MessageAttachments'
import { useScrollShadow } from '@/hooks/useScrollShadow'
import { useLinkSheet } from '@/hooks/useLinkSheetContext'
import ClickableMessage from '@/components/ClickableMessage'
import { VirtualHeightMessage, countWords } from '@/components/shell/mainView/VirtualHeightMessage'
import {
  compactCommandLabel,
  dedupeToolCalls,
  extractText,
  getAssistantMeta,
  getExplorationEvent,
  getFileChangeSummary,
  getMessageRole,
  getToolBlocks,
  getToolCallSignature,
  groupSuccessiveIdenticalToolCalls,
  hasMarkdownSyntax,
  isZeroOrNullUsage,
  stripThinkingBlocks,
  summarizeToolCall,
} from '@/components/shell/mainView/messageParsing'
import type { JsonValue } from '@/features/workspace/rpc'
import type { FileDiffDetails } from '@/components/shell/composer/types'
import type { ToolCallDisplayMode } from '@/features/workspace/types'

type ChatMessageItemProps = {
  conversationId: string | null
  id: string
  index: number
  message: JsonValue
  isStreaming: boolean
  showAssistantStats: boolean
  toolCallDisplayMode: ToolCallDisplayMode
  nowMs: number
  toolResultStatusByCallId: Map<string, 'success' | 'error' | 'running'>
  toolCallTimingById: Map<string, { startMs: number | null; endMs: number | null }>
  toolResultTextByCallId: Map<string, { text: string; isError: boolean }>
  toolCallOwnerByIndex: Map<string, number>
}

import { perfMonitor } from '@/features/workspace/store/perf-monitor'

const STREAMING_MARKDOWN_FLUSH_MS = 120
const EXPLORATION_COMMAND_PREVIEW_MAX = 120

function formatExplorationSummary(readCount: number, searchCount: number, isRunning: boolean) {
  const parts: string[] = []
  if (readCount > 0) {
    parts.push(`${readCount} fichier${readCount > 1 ? 's' : ''}`)
  }
  if (searchCount > 0) {
    parts.push(`${searchCount} recherche${searchCount > 1 ? 's' : ''}`)
  }
  const suffix = parts.join(', ')
  return isRunning ? `Exploration en cours ${suffix}` : `Exploration ${suffix}`
}

function truncateCommandPreview(command: string) {
  const compact = command.replace(/\s+/g, ' ').trim()
  if (compact.length <= EXPLORATION_COMMAND_PREVIEW_MAX) return compact
  return `${compact.slice(0, EXPLORATION_COMMAND_PREVIEW_MAX - 1)}…`
}

const MAX_VISIBLE_RUNNING_TOOL_ROWS = 3

const CHAT_MARKDOWN_CLASSNAME =
  'relative text-[15px] leading-7 text-[#232731] ' +
  '[&>p]:my-0 [&>p+p]:mt-3 ' +
  '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:leading-tight [&_h1]:text-[#1e222c] ' +
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-[#1e222c] ' +
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-tight [&_h3]:text-[#1e222c] ' +
  '[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:font-semibold [&_h4]:leading-tight [&_h4]:text-[#1e222c] ' +
  '[&_ul]:my-2 [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:pl-6 [&_li]:my-1 ' +
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d2d6de] [&_blockquote]:pl-4 [&_blockquote]:text-[#555d6d] ' +
  '[&_a]:text-[#22579a] [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-[#1a4478] ' +
  '[&_code]:rounded [&_code]:bg-[#e8ebf2] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-[#202533] ' +
  '[&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-[#1f2430] [&_pre]:p-3 [&_pre]:text-[#eef2ff] ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:text-inherit ' +
  '[&_hr]:my-4 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-[#d8dce4] ' +
  'dark:text-[#e5e7eb] dark:[&_h1]:text-white dark:[&_h2]:text-white dark:[&_h3]:text-white dark:[&_h4]:text-white ' +
  'dark:[&_blockquote]:border-[#3b4558] dark:[&_blockquote]:text-[#9ca3af] ' +
  'dark:[&_a]:text-[#7fb0ff] hover:dark:[&_a]:text-[#a8c8ff] ' +
  'dark:[&_code]:bg-[#1f2937] dark:[&_code]:text-[#e5e7eb] ' +
  'dark:[&_pre]:bg-[#111827] dark:[&_pre]:text-[#eef2ff] dark:[&_hr]:border-[#374151]'

function formatToolCallSummary(count: number, durationSec: number | null, t: (key: string) => string) {
  const label = `${count} ${count > 1 ? 'tool calls' : 'tool call'}`
  if (durationSec === null) return label
  return `${label} ${t('pour')} ${durationSec}s`
}

function renderToolBadge(status: 'success' | 'error' | 'running') {
  const baseClassName = 'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide'
  if (status === 'error') {
    return <span className={`${baseClassName} border-[#e9c1cc] bg-[#fff1f4] text-[#8f2f48]`}>error</span>
  }
  if (status === 'success') {
    return <span className={`${baseClassName} border-[#b9ddca] bg-[#edf8f1] text-[#256846]`}>success</span>
  }
  return <span className={`${baseClassName} border-[#d1d8e5] bg-[#f7f9fd] text-[#56627a]`}>running</span>
}

function shouldRenderMarkdownDuringStreaming(text: string): boolean {
  return /```|`[^`]|^#{1,6}\s|\n#{1,6}\s|^[-*+]\s|\n[-*+]\s|\d+\.\s|\n\d+\.\s|\[[^\]]+\]\([^)]+\)|\*\*|__|~~|>\s|\n>\s/.test(text)
}

function formatProviderError(errorMessage: string | null): string {
  if (!errorMessage) return ''
  try {
    const parsed = JSON.parse(errorMessage)
    if (parsed.error?.message) {
      return parsed.error.message
    }
    if (parsed.message) {
      return parsed.message
    }
  } catch {
    // Not JSON, return as-is
  }
  return errorMessage
}

export const ChatMessageItem = memo(function ChatMessageItem({
  conversationId,
  id,
  index,
  message,
  isStreaming,
  showAssistantStats,
  toolCallDisplayMode,
  nowMs,
  toolResultStatusByCallId,
  toolCallTimingById,
  toolResultTextByCallId,
  toolCallOwnerByIndex,
}: ChatMessageItemProps) {
  perfMonitor.recordComponentRender('ChatMessageItem')
  const { t } = useTranslation()
  const { setSelectedLink } = useLinkSheet()
  const [openDiffPaths, setOpenDiffPaths] = useState<Record<string, boolean>>({})
  const [diffByPath, setDiffByPath] = useState<Record<string, FileDiffDetails>>({})
  const [diffLoadingByPath, setDiffLoadingByPath] = useState<Record<string, boolean>>({})
  const [diffErrorByPath, setDiffErrorByPath] = useState<Record<string, string | null>>({})

  const role = getMessageRole(message)
  const isToolResultMessage = role === 'toolResult'
  const rawText = isToolResultMessage ? '' : extractText(message)
  const text = stripThinkingBlocks(rawText)
  const toolBlocks = getToolBlocks(message).filter((block) => !block.hiddenFromConversation)
  const hasAttachmentsInText = hasAttachments(text)
  const cleanedText = hasAttachmentsInText ? removeAttachmentText(text) : text
  const fileChangeSummary = getFileChangeSummary(message)
  // Filter tool calls: only render those owned by this message index (first-occurrence wins).
  // This prevents the same tool call from appearing in two different messages.
  // In quiet mode, hide all tool blocks entirely.
  const filteredByOwnership = dedupeToolCalls(toolBlocks).filter((block) => {
    const sig = getToolCallSignature(block)
    const owner = toolCallOwnerByIndex.get(block.toolCallId ? `id:${block.toolCallId}` : sig) ?? toolCallOwnerByIndex.get(sig)
    return owner === undefined || owner === index
  })
  const visibleToolBlocks = toolCallDisplayMode === 'quiet' ? [] : filteredByOwnership
  const assistantMeta = getAssistantMeta(message)
  const isErrorStopReason = assistantMeta?.stopReason === 'error'
  const errorMessage = isErrorStopReason ? assistantMeta?.errorMessage : null
  const fallbackAssistantErrorText =
    role === 'assistant' && !text && errorMessage ? errorMessage : ''

  const hasToolBlocks = visibleToolBlocks.length > 0
  const messageBodyRef = useRef<HTMLDivElement>(null)
  const isAssistantMessage = role === 'assistant'
  const renderedText = cleanedText || fallbackAssistantErrorText
  const wordCount = useMemo(() => countWords(renderedText), [renderedText])
  const shouldThrottleMarkdownStreaming =
    isStreaming &&
    isAssistantMessage &&
    !hasToolBlocks &&
    !fileChangeSummary &&
    shouldRenderMarkdownDuringStreaming(renderedText)
  const [streamingMarkdownText, setStreamingMarkdownText] = useState(renderedText)
  const streamingMarkdownTimeoutRef = useRef<number | null>(null)

  useScrollShadow(messageBodyRef)

  const loadDiffForFile = useCallback(
    async (path: string) => {
      if (!conversationId) {
        return
      }

      setDiffLoadingByPath((previous) => ({ ...previous, [path]: true }))
      setDiffErrorByPath((previous) => ({ ...previous, [path]: null }))

      try {
        const result = await window.chaton.getGitFileDiff(conversationId, path)
        if (!result.ok) {
          setDiffErrorByPath((previous) => ({
            ...previous,
            [path]: result.message ?? 'Impossible de charger le diff pour ce fichier.',
          }))
          return
        }

        const normalizedLines = result.diff.replace(/\r\n/g, '\n').split('\n')
        setDiffByPath((previous) => ({
          ...previous,
          [path]: {
            path: result.path,
            lines: normalizedLines,
            firstChangedLine: result.firstChangedLine,
            isBinary: result.isBinary,
          },
        }))

        if (!result.isBinary && normalizedLines.every((line) => line.length === 0)) {
          setDiffErrorByPath((previous) => ({
            ...previous,
            [path]: 'Aucun diff textuel disponible pour ce fichier.',
          }))
        }
      } catch (error) {
        setDiffErrorByPath((previous) => ({
          ...previous,
          [path]: error instanceof Error ? error.message : 'Impossible de charger le diff pour ce fichier.',
        }))
      } finally {
        setDiffLoadingByPath((previous) => ({ ...previous, [path]: false }))
      }
    },
    [conversationId],
  )

  const shouldRenderMessage = hasToolBlocks || Boolean(fileChangeSummary) || Boolean(text) || Boolean(fallbackAssistantErrorText)
  const hasAssistantMeta = Boolean(
    showAssistantStats && assistantMeta && !isStreaming && !isZeroOrNullUsage(assistantMeta),
  )
  const shouldUseLightweightStreamingText =
    isStreaming && isAssistantMessage && !hasToolBlocks && !fileChangeSummary && !shouldThrottleMarkdownStreaming

  useEffect(() => {
    if (!shouldThrottleMarkdownStreaming) {
      if (streamingMarkdownTimeoutRef.current !== null) {
        window.clearTimeout(streamingMarkdownTimeoutRef.current)
        streamingMarkdownTimeoutRef.current = null
      }
      setStreamingMarkdownText(renderedText)
      return
    }

    if (!isStreaming) {
      setStreamingMarkdownText(renderedText)
      return
    }

    if (streamingMarkdownTimeoutRef.current !== null) {
      return
    }

    streamingMarkdownTimeoutRef.current = window.setTimeout(() => {
      streamingMarkdownTimeoutRef.current = null
      setStreamingMarkdownText(renderedText)
    }, STREAMING_MARKDOWN_FLUSH_MS)

    return () => {
      if (streamingMarkdownTimeoutRef.current !== null) {
        window.clearTimeout(streamingMarkdownTimeoutRef.current)
        streamingMarkdownTimeoutRef.current = null
      }
    }
  }, [isStreaming, renderedText, shouldThrottleMarkdownStreaming])

  if (!shouldRenderMessage) {
    return null
  }

  const articleClassName =
    role === 'user'
      ? `flex w-full justify-end ${hasToolBlocks && !text ? 'py-1' : 'py-2'}`
      : hasToolBlocks && !text
        ? 'py-1'
        : 'py-2.5'

  const bodyClassName =
    role === 'user'
      ? 'relative min-w-0 ml-auto w-auto max-w-[min(80%,720px)] rounded-2xl bg-[#eceef2] px-4 py-3'
      : role === 'toolResult'
        ? 'relative min-w-0 w-full max-w-[min(86%,860px)] rounded-2xl bg-[#f6f8fc] px-4 py-3'
        : 'relative min-w-0'

  return (
    <article
      key={`${id}-${index}`}
      className={`${articleClassName}${hasAssistantMeta ? ' group' : ''}`}
      style={{ animation: 'fade-slide-in 180ms ease-out', contentVisibility: 'auto', containIntrinsicSize: 'auto 80px', willChange: 'auto' }}
    >
      <div className={bodyClassName} ref={messageBodyRef}>
        {hasToolBlocks ? (
          <div className="relative space-y-1">
            {(() => {
              const renderedVisible: ReactNode[] = []
              const overflowRows: ReactNode[] = []
              const overflowStatuses: Array<'success' | 'error' | 'running'> = []
              const overflowDurationsSec: number[] = []
              let groupIndex = 0

              const groupedToolCalls = groupSuccessiveIdenticalToolCalls(visibleToolBlocks)

              for (let groupIdx = 0; groupIdx < groupedToolCalls.length; groupIdx += 1) {
                const group = groupedToolCalls[groupIdx]
                const current = group.call
                const count = group.count

                const events: Array<{ kind: 'read' | 'search'; label: string }> = []
                const groupedCalls: Array<typeof current> = []
                let j = group.indices[0]
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
                  const commandPreview = groupedCalls
                    .map((call) => truncateCommandPreview(summarizeToolCall(call.name, call.arguments)))
                    .join('\n')
                  
                  // Calculate duration for grouped calls
                  const groupedTimings = groupedCalls
                    .map((call) => call.toolCallId ? toolCallTimingById.get(call.toolCallId) ?? null : null)
                    .filter((value): value is { startMs: number | null; endMs: number | null } => value !== null)
                  const groupStartMs = groupedTimings.reduce<number | null>((minValue, value) => {
                    if (!value.startMs) return minValue
                    if (minValue === null) return value.startMs
                    return Math.min(minValue, value.startMs)
                  }, null)
                  const runningGroupDurationSec =
                    isRunning && groupStartMs !== null ? Math.max(1, Math.round((nowMs - groupStartMs) / 1000)) : null
                  
                  // Expand only if tool is still running AND has been running for >= 2 seconds
                  // Always collapse when done (regardless of duration)
                  const shouldGroupExpandByDuration = isRunning && runningGroupDurationSec !== null && runningGroupDurationSec >= 2
                  
                  const status: 'success' | 'error' | 'running' = hasError ? 'error' : isRunning ? 'running' : 'success'
                  const badge = renderToolBadge(status)

                  const traceId = `${id}-toolgroup-${groupIndex}`
                  const isConversationStillRunning = isStreaming
                  const shouldOverflow = isConversationStillRunning && renderedVisible.length >= MAX_VISIBLE_RUNNING_TOOL_ROWS
                  // In light mode, always collapse tool traces
                  const shouldExpandConsideringUserIntent = toolCallDisplayMode === 'light' ? false : (!shouldOverflow && isRunning && shouldGroupExpandByDuration)

                  const row = (
                    <CollapsibleToolBlock
                      key={traceId}
                      title={<>{formatExplorationSummary(readCount, searchCount, isRunning)}</>}
                      badge={badge}
                      startExpanded={shouldExpandConsideringUserIntent}
                      maxHeight={180}
                    >
                      <pre className="w-full overflow-auto border-[#1c2534] bg-[#090f1a] p-3 font-mono text-[12px] leading-5 text-[#eef2ff] break-words whitespace-pre-wrap" style={{ maxHeight: 'calc(1.25rem * 10 + 1.5rem)' }}>{commandPreview}</pre>
                    </CollapsibleToolBlock>
                  )

                  if (shouldOverflow) {
                    overflowRows.push(row)
                    overflowStatuses.push(status)
                    if (runningGroupDurationSec !== null) {
                      overflowDurationsSec.push(runningGroupDurationSec)
                    }
                  } else {
                    renderedVisible.push(row)
                  }
                  groupIndex += 1
                  continue
                }

                const blockIndex = group.indices[0]
                const rawSummary = summarizeToolCall(current.name, current.arguments)
                const statusKey = current.toolCallId ?? `toolCall:${compactCommandLabel(rawSummary)}`
                const callStatus = toolResultStatusByCallId.get(statusKey) ?? 'running'
                const isRunning = callStatus === 'running'
                const callSummary = compactCommandLabel(rawSummary)
                const groupedTimings = group.calls
                  .map((call) => (call.toolCallId ? toolCallTimingById.get(call.toolCallId) ?? null : null))
                  .filter((value): value is { startMs: number | null; endMs: number | null } => value !== null)
                const startMs = groupedTimings.reduce<number | null>((minValue, value) => {
                  if (!value.startMs) return minValue
                  if (minValue === null) return value.startMs
                  return Math.min(minValue, value.startMs)
                }, null)
                const endMs = groupedTimings.reduce<number | null>((maxValue, value) => {
                  if (!value.endMs) return maxValue
                  if (maxValue === null) return value.endMs
                  return Math.max(maxValue, value.endMs)
                }, null)
                const durationSec =
                  startMs !== null && endMs !== null && endMs >= startMs
                    ? Math.max(1, Math.round((endMs - startMs) / 1000))
                    : null
                const runningDurationSec =
                  isRunning && startMs !== null ? Math.max(1, Math.round((nowMs - startMs) / 1000)) : null

                // Expand only if tool is still running AND has been running for >= 2 seconds
                // Always collapse when done (regardless of duration)
                const shouldExpandByDuration = isRunning && runningDurationSec !== null && runningDurationSec >= 2
                const isConversationStillRunning = isStreaming
                const collapsedSummary = !isRunning && count > 1 ? formatToolCallSummary(count, durationSec, t) : null

                const badge = renderToolBadge(callStatus)

                const traceId = `${id}-toolcall-${blockIndex}`
                const shouldOverflow = isConversationStillRunning && renderedVisible.length >= MAX_VISIBLE_RUNNING_TOOL_ROWS
                // In light mode, always collapse tool traces
                const shouldExpandConsideringUserIntent = toolCallDisplayMode === 'light' ? false : (!shouldOverflow && isRunning && shouldExpandByDuration)
                const groupedOutputs = group.calls
                  .map((call) => {
                    if (!call.toolCallId) return ''
                    return toolResultTextByCallId.get(call.toolCallId)?.text ?? ''
                  })
                  .filter((value) => value.trim().length > 0)
                const groupedErrors = group.calls.some(
                  (call) => (call.toolCallId ? (toolResultTextByCallId.get(call.toolCallId)?.isError ?? false) : false),
                )
                const combinedOutput = groupedOutputs.join('\n\n')

                const row = (
                  <CollapsibleToolBlock
                    key={traceId}
                    title={
                      <>
                        {isRunning ? (
                          <>
                            {t('Exécution de la commande en cours')}{' '}
                            {runningDurationSec !== null ? (
                              <>
                                {t('pour')} <strong>{runningDurationSec}s</strong>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {t('Exécuté')} <strong>{callSummary}</strong>
                            {durationSec !== null ? (
                              <>
                                {' '}
                                {t('pour')} {durationSec}s
                              </>
                            ) : null}
                          </>
                        )}
                      </>
                    }
                    badge={badge}
                    startExpanded={shouldExpandConsideringUserIntent}
                    maxHeight={260}
                    summarySuffix={!isConversationStillRunning ? collapsedSummary : null}
                  >
                    <LiveToolTrace
                      command={rawSummary}
                      output={combinedOutput}
                      isRunning={isRunning}
                      isError={groupedErrors}
                    />
                  </CollapsibleToolBlock>
                )

                if (shouldOverflow) {
                  overflowRows.push(row)
                  overflowStatuses.push(callStatus)
                  if ((isRunning ? runningDurationSec : durationSec) !== null) {
                    overflowDurationsSec.push((isRunning ? runningDurationSec : durationSec) ?? 1)
                  }
                } else {
                  renderedVisible.push(row)
                }
              }

              if (overflowRows.length > 0) {
                const overflowHasError = overflowStatuses.includes('error')
                const overflowIsRunning = overflowStatuses.includes('running')
                const overflowStatus: 'success' | 'error' | 'running' = overflowHasError
                  ? 'error'
                  : overflowIsRunning
                    ? 'running'
                    : 'success'
                const overflowDurationSec =
                  overflowDurationsSec.length > 0 ? Math.max(...overflowDurationsSec) : null

                renderedVisible.push(
                  <CollapsibleToolBlock
                    key={`${id}-tool-overflow`}
                    title={<>{formatToolCallSummary(overflowRows.length, overflowDurationSec, t)}</>}
                    badge={renderToolBadge(overflowStatus)}
                    startExpanded={false}
                    maxHeight={280}
                  >
                    <div className="space-y-1">{overflowRows}</div>
                  </CollapsibleToolBlock>,
                )
              }

              return renderedVisible
            })()}
          </div>
        ) : null}
        {fileChangeSummary ? (
          <div className="space-y-1">
            {fileChangeSummary.files.map((file) => {
              const isOpen = openDiffPaths[file.path] ?? false
              const isLoading = diffLoadingByPath[file.path] ?? false
              const error = diffErrorByPath[file.path]
              const details = diffByPath[file.path]

              return (
                <div
                  key={`${fileChangeSummary.label}:${file.path}:${file.added}:${file.removed}`}
                  className="space-y-2"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left text-xs text-[#6e7a92] transition-colors hover:bg-[#f5f7fb]"
                    onClick={() => {
                      setOpenDiffPaths((previous) => ({ ...previous, [file.path]: !isOpen }))
                      if (!isOpen && !details && !isLoading) {
                        void loadDiffForFile(file.path)
                      }
                    }}
                    title="Afficher le diff"
                  >
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#6e7a92]">{fileChangeSummary.label}</span>
                    <code className="overflow-hidden text-ellipsis whitespace-nowrap text-[#232731]">{file.path}</code>
                    <span className="font-semibold text-[#4fd08e]">+{file.added}</span>
                    <span className="font-semibold text-[#ff6d7d]">-{file.removed}</span>
                  </button>
                  {isOpen ? (
                    <div className="pl-4">
                      {isLoading ? <div className="text-xs text-[#9aa8c0]">Chargement du diff…</div> : null}
                      {!isLoading && error ? <div className="text-xs text-[#ff9daa]">{error}</div> : null}
                      {!isLoading && !error && details ? <InlineFileDiff details={details} /> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
        {renderedText ? (
          <VirtualHeightMessage
            contentId={id}
            wordCount={wordCount}
            isStreaming={isStreaming}
          >
            {shouldUseLightweightStreamingText ? (
              <TypewriterText text={renderedText} active={isStreaming} onLinkClick={setSelectedLink} />
            ) : shouldThrottleMarkdownStreaming || hasMarkdownSyntax(renderedText) ? (
              <div className={CHAT_MARKDOWN_CLASSNAME}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {shouldThrottleMarkdownStreaming ? streamingMarkdownText : renderedText}
                </ReactMarkdown>
              </div>
            ) : (
              <ClickableMessage text={renderedText} onLinkClick={setSelectedLink} />
            )}
          </VirtualHeightMessage>
        ) : null}
        {hasAttachmentsInText && (
          <MessageAttachments attachments={parseAttachmentsFromText(text)} />
        )}
        {hasAssistantMeta && assistantMeta ? (
          <div className="pointer-events-none invisible absolute left-0 top-full z-10 mt-1 flex translate-y-1 flex-wrap gap-1.5 text-[11px] text-[#6a7285] opacity-0 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <span className="rounded bg-[#eef1f7] px-2 py-0.5">{assistantMeta.provider ?? 'provider?'}</span>
            <span className="rounded bg-[#eef1f7] px-2 py-0.5">{assistantMeta.model ?? 'model?'}</span>
            {assistantMeta.api ? <span className="rounded bg-[#eef1f7] px-2 py-0.5">api: {assistantMeta.api}</span> : null}
            {assistantMeta.stopReason ? <span className="rounded bg-[#eef1f7] px-2 py-0.5">stop: {assistantMeta.stopReason}</span> : null}
            {assistantMeta.usage.totalTokens !== null ? (
              <span className="rounded bg-[#eef1f7] px-2 py-0.5">
                tokens: in {assistantMeta.usage.input ?? 0} / out {assistantMeta.usage.output ?? 0} / total{' '}
                {assistantMeta.usage.totalTokens}
              </span>
            ) : null}
          </div>
        ) : null}
        {isErrorStopReason && errorMessage ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-[#b91c1c] bg-[#fef2f2] p-3 text-sm text-[#991b1b] dark:border-[#7f1d1d] dark:bg-[#1f0f0f] dark:text-[#fca5a5]">
            <span className="text-[#b91c1c] dark:text-[#f87171]">⚠</span>
            <span className="break-words">{formatProviderError(errorMessage)}</span>
          </div>
        ) : null}
      </div>
    </article>
  )
}, (prevProps, nextProps) => {
  // Custom memo comparison: skip re-render if only nowMs changed
  // The elapsed time will update when other props change or on next render cycle
  if (prevProps.id !== nextProps.id) return false
  if (prevProps.message !== nextProps.message) return false
  if (prevProps.index !== nextProps.index) return false
  if (prevProps.isStreaming !== nextProps.isStreaming) return false
  if (prevProps.showAssistantStats !== nextProps.showAssistantStats) return false
  if (prevProps.toolCallDisplayMode !== nextProps.toolCallDisplayMode) return false
  if (prevProps.conversationId !== nextProps.conversationId) return false
  if (prevProps.toolResultStatusByCallId !== nextProps.toolResultStatusByCallId) return false
  if (prevProps.toolCallTimingById !== nextProps.toolCallTimingById) return false
  if (prevProps.toolResultTextByCallId !== nextProps.toolResultTextByCallId) return false
  if (prevProps.toolCallOwnerByIndex !== nextProps.toolCallOwnerByIndex) return false
  // Note: intentionally ignoring nowMs to prevent re-renders on every second
  return true
})
