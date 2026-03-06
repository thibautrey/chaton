import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { InlineFileDiff } from '@/components/shell/mainView/InlineFileDiff'
import { CollapsibleToolBlock, LiveToolTrace } from '@/components/shell/mainView/ToolBlocks'
import {
  compactCommandLabel,
  dedupeToolCalls,
  extractText,
  getAssistantMeta,
  getExplorationEvent,
  getFileChangeSummary,
  getMessageRole,
  getToolBlocks,
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
}

export function ChatMessageItem({
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
}: ChatMessageItemProps) {
  const [openDiffPaths, setOpenDiffPaths] = useState<Record<string, boolean>>({})
  const [diffByPath, setDiffByPath] = useState<Record<string, FileDiffDetails>>({})
  const [diffLoadingByPath, setDiffLoadingByPath] = useState<Record<string, boolean>>({})
  const [diffErrorByPath, setDiffErrorByPath] = useState<Record<string, string | null>>({})
  const role = getMessageRole(message)
  const isToolResultMessage = role === 'toolResult'
  const text = isToolResultMessage ? '' : extractText(message)
  const toolBlocks = getToolBlocks(message)
  const fileChangeSummary = getFileChangeSummary(message)
  const visibleToolBlocks = dedupeToolCalls(toolBlocks)
  const assistantMeta = getAssistantMeta(message)
  const fallbackAssistantErrorText =
    role === 'assistant' && !text && assistantMeta?.errorMessage ? assistantMeta.errorMessage : ''

  const hasToolBlocks = visibleToolBlocks.length > 0

  useEffect(() => {
    let cancelled = false

    async function loadOpenDiffs() {
      if (!conversationId || !fileChangeSummary) {
        return
      }

      for (const file of fileChangeSummary.files) {
        const path = file.path
        if (!openDiffPaths[path] || diffByPath[path] || diffLoadingByPath[path]) {
          continue
        }

        setDiffLoadingByPath((previous) => ({ ...previous, [path]: true }))
        setDiffErrorByPath((previous) => ({ ...previous, [path]: null }))

        try {
          const result = await window.chaton.getGitFileDiff(conversationId, path)
          if (cancelled) return
          if (!result.ok) {
            setDiffErrorByPath((previous) => ({
              ...previous,
              [path]: result.message ?? 'Impossible de charger le diff pour ce fichier.',
            }))
            continue
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
          if (cancelled) return
          setDiffErrorByPath((previous) => ({
            ...previous,
            [path]: error instanceof Error ? error.message : 'Impossible de charger le diff pour ce fichier.',
          }))
        } finally {
          if (!cancelled) {
            setDiffLoadingByPath((previous) => ({ ...previous, [path]: false }))
          }
        }
      }
    }

    void loadOpenDiffs()
    return () => {
      cancelled = true
    }
  }, [conversationId, diffByPath, diffLoadingByPath, fileChangeSummary, openDiffPaths])

  if (!hasToolBlocks && !fileChangeSummary && !text && !fallbackAssistantErrorText) {
    return null
  }

  const hasAssistantMeta = Boolean(
    showAssistantStats && assistantMeta && !isStreaming && !isZeroOrNullUsage(assistantMeta),
  )

  return (
    <article
      key={`${id}-${index}`}
      className={`chat-message chat-message-${role}${hasAssistantMeta ? ' chat-message-with-meta' : ''}${
        hasToolBlocks && !text ? ' chat-message-tools-only' : ''
      }`}
    >
      <div className="chat-message-body">
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
                  continue
                }

                const blockIndex = group.indices[0]
                const rawSummary = summarizeToolCall(current.name, current.arguments)
                const statusKey = current.toolCallId ?? `toolCall:${compactCommandLabel(rawSummary)}`
                const callStatus = toolResultStatusByCallId.get(statusKey) ?? 'running'
                const isRunning = callStatus === 'running'
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

                const shouldGroup = count > 1

                rendered.push(
                  <CollapsibleToolBlock
                    key={`${id}-toolcall-${blockIndex}`}
                    title={
                      <>
                        {isRunning ? (
                          <>
                            Exécution de la commande en cours{' '}
                            {runningDurationSec !== null ? (
                              <>
                                pour <strong>{runningDurationSec}s</strong>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {shouldGroup ? (
                              <>
                                Exécuté <strong>{callSummary}</strong> <em>({count}×)</em>
                                {durationSec !== null ? <> pour {durationSec}s</> : null}
                              </>
                            ) : (
                              <>
                                Exécuté <strong>{callSummary}</strong>
                                {durationSec !== null ? <> pour {durationSec}s</> : null}
                              </>
                            )}
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
                      isError={
                        current.toolCallId ? (toolResultTextByCallId.get(current.toolCallId)?.isError ?? false) : false
                      }
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
                    onClick={() => setOpenDiffPaths((previous) => ({ ...previous, [file.path]: !isOpen }))}
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
                tokens: in {assistantMeta.usage.input ?? 0} / out {assistantMeta.usage.output ?? 0} / total{' '}
                {assistantMeta.usage.totalTokens}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
