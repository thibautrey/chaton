import type { ReactNode } from 'react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { InlineFileDiff } from '@/components/shell/mainView/InlineFileDiff'
import { CollapsibleToolBlock, LiveToolTrace } from '@/components/shell/mainView/ToolBlocks'
import { useScrollShadow } from '@/hooks/useScrollShadow'
import ClickableMessage from '@/components/ClickableMessage'
import LinkSheet from '@/components/LinkSheet'
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
  summarizeToolCall,
} from '@/components/shell/mainView/messageParsing'
import type { JsonValue } from '@/features/workspace/rpc'
import type { FileDiffDetails } from '@/components/shell/composer/types'

type ChatMessageItemProps = {
  conversationId: string | null
  id: string
  index: number
  message: JsonValue
  isStreaming: boolean
  showAssistantStats: boolean
  nowMs: number
  toolResultStatusByCallId: Map<string, 'success' | 'error' | 'running'>
  toolCallTimingById: Map<string, { startMs: number | null; endMs: number | null }>
  toolResultTextByCallId: Map<string, { text: string; isError: boolean }>
  toolCallOwnerByIndex: Map<string, number>
}

import { perfMonitor } from '@/features/workspace/store/perf-monitor'

const STREAMING_MARKDOWN_FLUSH_MS = 120

function shouldRenderMarkdownDuringStreaming(text: string): boolean {
  return /```|`[^`]|^#{1,6}\s|\n#{1,6}\s|^[-*+]\s|\n[-*+]\s|\d+\.\s|\n\d+\.\s|\[[^\]]+\]\([^\)]+\)|\*\*|__|~~|>\s|\n>\s/.test(text)
}

export const ChatMessageItem = memo(function ChatMessageItem({
  conversationId,
  id,
  index,
  message,
  isStreaming,
  showAssistantStats,
  nowMs,
  toolResultStatusByCallId,
  toolCallTimingById,
  toolResultTextByCallId,
  toolCallOwnerByIndex,
}: ChatMessageItemProps) {
  perfMonitor.recordComponentRender('ChatMessageItem')
  const { t } = useTranslation()
  const [openDiffPaths, setOpenDiffPaths] = useState<Record<string, boolean>>({})
  const [diffByPath, setDiffByPath] = useState<Record<string, FileDiffDetails>>({})
  const [diffLoadingByPath, setDiffLoadingByPath] = useState<Record<string, boolean>>({})
  const [diffErrorByPath, setDiffErrorByPath] = useState<Record<string, string | null>>({})
  const [selectedLink, setSelectedLink] = useState<string | null>(null)

  const role = getMessageRole(message)
  const isToolResultMessage = role === 'toolResult'
  const text = isToolResultMessage ? '' : extractText(message)
  const toolBlocks = getToolBlocks(message).filter((block) => !block.hiddenFromConversation)
  const fileChangeSummary = getFileChangeSummary(message)
  // Filter tool calls: only render those owned by this message index (first-occurrence wins).
  // This prevents the same tool call from appearing in two different messages.
  const visibleToolBlocks = dedupeToolCalls(toolBlocks).filter((block) => {
    const sig = getToolCallSignature(block)
    const owner = toolCallOwnerByIndex.get(block.toolCallId ? `id:${block.toolCallId}` : sig) ?? toolCallOwnerByIndex.get(sig)
    return owner === undefined || owner === index
  })
  const assistantMeta = getAssistantMeta(message)
  const fallbackAssistantErrorText =
    role === 'assistant' && !text && assistantMeta?.errorMessage ? assistantMeta.errorMessage : ''

  const hasToolBlocks = visibleToolBlocks.length > 0
  const messageBodyRef = useRef<HTMLDivElement>(null)
  const isAssistantMessage = role === 'assistant'
  const renderedText = text || fallbackAssistantErrorText
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

  return (
    <article
      key={`${id}-${index}`}
      className={`chat-message chat-message-${role}${hasAssistantMeta ? ' chat-message-with-meta' : ''}${
        hasToolBlocks && !text ? ' chat-message-tools-only' : ''
      }`}
    >
      <div className="chat-message-body" ref={messageBodyRef}>
        {hasToolBlocks ? (
          <div className="chat-tool-blocks">
            {(() => {
              const rendered: ReactNode[] = []
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
                  
                  const badge = hasError ? (
                    <span className="chat-tool-badge chat-tool-badge-error">error</span>
                  ) : isRunning ? (
                    <span className="chat-tool-badge">running</span>
                  ) : (
                    <span className="chat-tool-badge chat-tool-badge-success">success</span>
                  )
                  
                  const traceId = `${id}-toolgroup-${groupIndex}`
                  const shouldExpandConsideringUserIntent = shouldGroupExpandByDuration
                  
                  rendered.push(
                    <CollapsibleToolBlock
                      key={traceId}
                      title={<>{`${readCount} fichiers,${searchCount} recherche exploré(s)`}</>}
                      badge={badge}
                      startExpanded={shouldExpandConsideringUserIntent}
                      maxHeight={180}
                    >
                      <pre className="chat-tool-code-preview">{events.map((item) => item.label).join('\n')}</pre>
                    </CollapsibleToolBlock>,
                  )
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
                
                const badge =
                  callStatus === 'error' ? (
                    <span className="chat-tool-badge chat-tool-badge-error">error</span>
                  ) : callStatus === 'success' ? (
                    <span className="chat-tool-badge chat-tool-badge-success">success</span>
                  ) : (
                    <span className="chat-tool-badge">running</span>
                  )

                const shouldGroup = count > 1

                const traceId = `${id}-toolcall-${blockIndex}`
                const shouldExpandConsideringUserIntent = shouldExpandByDuration
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

                rendered.push(
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
                            {shouldGroup ? (
                              <>
                                {t('Exécuté')} <strong>{callSummary}</strong>
                                {durationSec !== null ? (
                                  <>
                                    {' '}
                                    {t('pour')} {durationSec}s
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
                        )}
                      </>
                    }
                    badge={badge}
                    startExpanded={shouldExpandConsideringUserIntent}
                    maxHeight={260}
                  >
                    <LiveToolTrace
                      command={rawSummary}
                      output={combinedOutput}
                      isRunning={isRunning}
                      isError={groupedErrors}
                    />
                  </CollapsibleToolBlock>,
                )
              }

              return rendered
            })()}
          </div>
        ) : null}
        {fileChangeSummary ? (
          <div className="chat-file-change-list">
            {fileChangeSummary.files.map((file) => {
              const isOpen = openDiffPaths[file.path] ?? false
              const isLoading = diffLoadingByPath[file.path] ?? false
              const error = diffErrorByPath[file.path]
              const details = diffByPath[file.path]

              return (
                <div
                  key={`${fileChangeSummary.label}:${file.path}:${file.added}:${file.removed}`}
                  className={`chat-file-change-item${isOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="chat-file-change-row"
                    onClick={() => {
                      setOpenDiffPaths((previous) => ({ ...previous, [file.path]: !isOpen }))
                      if (!isOpen && !details && !isLoading) {
                        void loadDiffForFile(file.path)
                      }
                    }}
                    title="Afficher le diff"
                  >
                    <span className="chat-file-change-label">{fileChangeSummary.label}</span>
                    <code>{file.path}</code>
                    <span className="chat-inline-diff-plus">+{file.added}</span>
                    <span className="chat-inline-diff-minus">-{file.removed}</span>
                  </button>
                  {isOpen ? (
                    <div className="chat-file-change-diff">
                      {isLoading ? <div className="composer-mods-inline-note">Chargement du diff…</div> : null}
                      {!isLoading && error ? <div className="composer-mods-inline-error">{error}</div> : null}
                      {!isLoading && !error && details ? <InlineFileDiff details={details} /> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
        {renderedText ? (
          shouldUseLightweightStreamingText ? (
            <ClickableMessage text={renderedText} onLinkClick={setSelectedLink} />
          ) : shouldThrottleMarkdownStreaming || hasMarkdownSyntax(renderedText) ? (
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {shouldThrottleMarkdownStreaming ? streamingMarkdownText : renderedText}
              </ReactMarkdown>
            </div>
          ) : (
            <ClickableMessage text={renderedText} onLinkClick={setSelectedLink} />
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
                tokens: in {assistantMeta.usage.input ?? 0} / out {assistantMeta.usage.output ?? 0} / total{' '}
                {assistantMeta.usage.totalTokens}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {selectedLink && (
        <LinkSheet url={selectedLink} onClose={() => setSelectedLink(null)} />
      )}
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
  if (prevProps.conversationId !== nextProps.conversationId) return false
  if (prevProps.toolResultStatusByCallId !== nextProps.toolResultStatusByCallId) return false
  if (prevProps.toolCallTimingById !== nextProps.toolCallTimingById) return false
  if (prevProps.toolResultTextByCallId !== nextProps.toolResultTextByCallId) return false
  if (prevProps.toolCallOwnerByIndex !== nextProps.toolCallOwnerByIndex) return false
  // Note: intentionally ignoring nowMs to prevent re-renders on every second
  return true
})
