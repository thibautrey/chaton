import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import { ChatonsExtensionsMainPanel } from '@/components/shell/ChatonsExtensionsMainPanel'
import { ChannelsMainPanel } from '@/components/shell/ChannelsMainPanel'
import { ExtensionMainViewPanel } from '@/components/shell/ExtensionMainViewPanel'
import { PiSettingsMainPanel } from '@/components/shell/PiSettingsMainPanel'
import { PiSkillsMainPanel } from '@/components/shell/PiSkillsMainPanel'
import { QuickActionCards } from '@/components/shell/QuickActionCards'
import { RequirementSheet } from '@/components/shell/RequirementSheet'
import { ConversationSidePanel } from '@/components/shell/ConversationSidePanel'
import { useConversationSidePanel } from '@/hooks/use-conversation-side-panel'
import { ChatMessageItem } from '@/components/shell/mainView/ChatMessageItem'
import { QUICK_ACTIONS_FADE_OUT_MS, THINKING_CAT_ANIMATIONS } from '@/components/shell/mainView/constants'
import { ExtensionRequestModal } from '@/components/shell/mainView/ExtensionRequestModal'
import { HeroMascot } from '@/components/shell/mainView/HeroMascot'
import {
  dedupeToolCallMessages,
  dedupeToolCalls,
  extractText,
  getMessageId,
  getMessageRole,
  getMessageTimestampMs,
  getMessageToolTitleKey,
  getStreamTurn,
  getToolBlocks,
  getToolCallSignature,
  getToolResultInfo,
  isLikelySameToolTitle,
} from '@/components/shell/mainView/messageParsing'
import type { JsonValue } from '@/features/workspace/rpc'
import { useWorkspace } from '@/features/workspace/store'
import { usePiRuntime } from '@/features/workspace/store/pi-store'
import { perfMonitor } from '@/features/workspace/store/perf-monitor'

export function MainView() {
  perfMonitor.recordComponentRender('MainView')
  const { t } = useTranslation()
  const { state, respondExtensionUi, dismissRequirementSheet, openSettings } = useWorkspace()
  const { setConversationId } = useConversationSidePanel()
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [thinkingAnimationIndex, setThinkingAnimationIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_CAT_ANIMATIONS.length),
  )
  const [thinkingFrameIndex, setThinkingFrameIndex] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  )
  const selectedRuntime = usePiRuntime(selectedConversation?.id ?? null)
  const isStreaming = selectedRuntime?.status === 'streaming'

  const messages = useMemo(() => {
    if (!selectedRuntime?.messages) {
      return []
    }
    return selectedRuntime.messages
  }, [selectedRuntime?.messages])

  const displayMessages = useMemo(() => {
    if (!isStreaming) return dedupeToolCallMessages(messages)
    const activeTurn = selectedRuntime?.activeStreamTurn ?? null
    if (activeTurn === null) return dedupeToolCallMessages(messages)

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

  // Progressive rendering: on initial mount or conversation switch, render only
  // the last INITIAL_BATCH messages to avoid a 500ms blocking commit. The rest
  // are mounted on the next animation frame.
  const INITIAL_BATCH = 30
  const [renderAll, setRenderAll] = useState(displayMessages.length <= INITIAL_BATCH)
  const prevConversationIdRef = useRef(selectedConversation?.id)

  useEffect(() => {
    if (prevConversationIdRef.current !== selectedConversation?.id) {
      prevConversationIdRef.current = selectedConversation?.id
      if (displayMessages.length > INITIAL_BATCH) {
        setRenderAll(false)
      }
    }
  }, [selectedConversation?.id, displayMessages.length])

  // Update task list scope when conversation changes
  useEffect(() => {
    setConversationId(selectedConversation?.id ?? null)
  }, [selectedConversation?.id, setConversationId])

  useEffect(() => {
    if (renderAll) return
    const id = requestAnimationFrame(() => setRenderAll(true))
    return () => cancelAnimationFrame(id)
  }, [renderAll])

  const visibleMessages = useMemo(() => {
    if (renderAll || displayMessages.length <= INITIAL_BATCH) return displayMessages
    // Show only the tail on first frame, full list on next
    return displayMessages.slice(-INITIAL_BATCH)
  }, [displayMessages, renderAll])

  const pendingUserMessageText = selectedRuntime?.pendingUserMessageText ?? null
  const hasOptimisticPendingUserMessage = useMemo(() => {
    if (!pendingUserMessageText) return false
    return displayMessages.some((message) => {
      const id = getMessageId(message, -1)
      if (!id.startsWith('optimistic-user:')) return false
      return getMessageRole(message) === 'user' && extractText(message).trim() === pendingUserMessageText.trim()
    })
  }, [displayMessages, pendingUserMessageText])
  const isAgentBusy =
    isStreaming || selectedRuntime?.status === 'starting' || Boolean(selectedRuntime?.pendingUserMessage)
  const hasRpcInFlight = (selectedRuntime?.pendingCommands ?? 0) > 0
  const isExecutionActive = isAgentBusy

  const [hasComposerDraftText, setHasComposerDraftText] = useState(false)
  const hasPersistedConversationActivity = useMemo(() => {
    if (!selectedConversation) return false
    return selectedConversation.lastMessageAt !== selectedConversation.createdAt
  }, [selectedConversation])

  const shouldShowQuickActions =
    messages.length === 0 &&
    !hasPersistedConversationActivity &&
    !selectedRuntime?.pendingUserMessage &&
    !isStreaming &&
    !hasComposerDraftText

  const shouldShowHeroSection =
    messages.length === 0 &&
    !hasPersistedConversationActivity &&
    !selectedRuntime?.pendingUserMessage &&
    !isStreaming

  const [showQuickActions, setShowQuickActions] = useState(shouldShowQuickActions)
  const [quickActionsClosing, setQuickActionsClosing] = useState(false)

  useEffect(() => {
    const handle = (event: Event) => {
      const custom = event as CustomEvent<{ hasText?: boolean }>
      setHasComposerDraftText(Boolean(custom.detail?.hasText))
    }
    window.addEventListener('chaton:composer-draft-changed', handle)
    return () => window.removeEventListener('chaton:composer-draft-changed', handle)
  }, [])

  useEffect(() => {
    if (!shouldShowQuickActions) return
    const timer = window.setTimeout(() => {
      setShowQuickActions(true)
      setQuickActionsClosing(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [shouldShowQuickActions])

  useEffect(() => {
    if (!quickActionsClosing) return
    const timer = window.setTimeout(() => {
      setShowQuickActions(false)
      setQuickActionsClosing(false)
    }, QUICK_ACTIONS_FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [quickActionsClosing])

  useEffect(() => {
    if (isExecutionActive) return
    const timer = window.setTimeout(() => {
      setThinkingAnimationIndex(Math.floor(Math.random() * THINKING_CAT_ANIMATIONS.length))
      setThinkingFrameIndex(0)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isExecutionActive])

  useEffect(() => {
    if (!selectedConversation) return
    const container = scrollRef.current
    if (!container) return

    const syncBottomState = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight
      const atBottom = distance < 100
      setIsAtBottom(atBottom)
      if (!atBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
        setIsAtBottom(true)
      }
    }

    requestAnimationFrame(syncBottomState)
  }, [selectedConversation])

  useEffect(() => {
    if (!showQuickActions) return
    if (shouldShowQuickActions) return
    const timer = window.setTimeout(() => setQuickActionsClosing(true), 0)
    return () => window.clearTimeout(timer)
  }, [showQuickActions, shouldShowQuickActions])

  useEffect(() => {
    if (!isExecutionActive) return
    const activeThinkingFrames = THINKING_CAT_ANIMATIONS[thinkingAnimationIndex]
    const timer = window.setInterval(() => {
      setThinkingFrameIndex((current) => (current + 1) % activeThinkingFrames.length)
    }, 180)
    return () => window.clearInterval(timer)
  }, [isExecutionActive])

  useEffect(() => {
    if (!(isExecutionActive || hasRpcInFlight)) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasRpcInFlight, isExecutionActive])

  const messageAnalysis = useMemo(() => {
    const statusByCallId = new Map<string, 'success' | 'error' | 'running'>()
    const timing = new Map<string, { startMs: number | null; endMs: number | null }>()
    const outputs = new Map<string, { text: string; isError: boolean }>()
    const ownerOf = new Map<string, number>()

    // First pass: collect all tool call statuses and metadata
    for (const message of displayMessages) {
      const blocks = getToolBlocks(message)
      for (const block of blocks) {
        if (block.kind === 'toolCall') {
          const key = block.toolCallId ?? getMessageToolTitleKey(message)
          if (key) {
            statusByCallId.set(key, 'running')
          }
        }
      }
    }

    // Second pass: collect tool results and timing information
    for (let i = 0; i < displayMessages.length; i++) {
      const message = displayMessages[i]
      const ts = getMessageTimestampMs(message)
      const blocks = getToolBlocks(message)
      const calls = dedupeToolCalls(blocks)

      // Track ownership by index
      for (const call of calls) {
        const sig = getToolCallSignature(call)
        if (!ownerOf.has(sig)) {
          ownerOf.set(sig, i)
        }
        if (call.toolCallId) {
          const idKey = `id:${call.toolCallId}`
          if (!ownerOf.has(idKey)) {
            ownerOf.set(idKey, i)
          }
        }
      }

      // Process results and update status
      const toolResult = getToolResultInfo(message)
      if (toolResult?.toolCallId) {
        statusByCallId.set(toolResult.toolCallId, toolResult.isError ? 'error' : 'success')
      }

      for (const block of blocks) {
        if (block.kind === 'toolCall' && block.toolCallId) {
          const prev = timing.get(block.toolCallId) ?? { startMs: null, endMs: null }
          timing.set(block.toolCallId, { startMs: prev.startMs ?? ts, endMs: prev.endMs })
        }
        if (block.kind === 'toolResult') {
          if (block.toolCallId) {
            const prev = timing.get(block.toolCallId) ?? { startMs: null, endMs: null }
            timing.set(block.toolCallId, { startMs: prev.startMs, endMs: ts ?? prev.endMs })
            outputs.set(block.toolCallId, { text: block.text, isError: block.isError })
          }
          const key = block.toolCallId ?? getMessageToolTitleKey(message)
          if (key) {
            statusByCallId.set(key, block.isError ? 'error' : 'success')
          }
        }
      }

      const standaloneResult = getToolResultInfo(message)
      if (standaloneResult?.toolCallId) {
        const prev = timing.get(standaloneResult.toolCallId) ?? { startMs: null, endMs: null }
        timing.set(standaloneResult.toolCallId, { startMs: prev.startMs, endMs: ts ?? prev.endMs })
      }
    }

    // Calculate open tool blocks count
    let open = 0
    for (const message of displayMessages) {
      const blocks = getToolBlocks(message)
      const visibleBlocks = dedupeToolCalls(blocks)
      for (const block of visibleBlocks) {
        if (block.kind === 'toolCall') {
          const key = block.toolCallId ?? getMessageToolTitleKey(message)
          const status = key ? statusByCallId.get(key) : undefined
          if (status === 'running' || !status) {
            open += 1
          }
        }
      }
    }

    return {
      toolResultStatusByCallId: statusByCallId,
      toolCallTimingById: timing,
      toolResultTextByCallId: outputs,
      toolCallOwnerByIndex: ownerOf,
      openToolBlocks: open,
    }
  }, [displayMessages])

  const toolResultStatusByCallId = messageAnalysis.toolResultStatusByCallId
  const toolCallTimingById = messageAnalysis.toolCallTimingById
  const toolResultTextByCallId = messageAnalysis.toolResultTextByCallId
  const toolCallOwnerByIndex = messageAnalysis.toolCallOwnerByIndex

  useEffect(() => {
    const container = scrollRef.current
    if (!container) {
      return
    }
    if (!isAtBottom) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isExecutionActive ? 'auto' : 'smooth',
    })
  }, [isAtBottom, isExecutionActive, displayMessages, selectedRuntime?.status])

  useEffect(() => {
    if (!selectedConversation) return
    const container = scrollRef.current
    if (!container) return

    const handleInitialScroll = () => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
      setIsAtBottom(true)
    }

    requestAnimationFrame(handleInitialScroll)
  }, [selectedConversation?.id])

  useEffect(() => {
    if (!selectedConversation) return
    const container = scrollRef.current
    if (!container) return

    const handleContentResize = () => {
      if (isAtBottom) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'auto' })
      }
    }

    let resizeTimeout: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout)
      }
      resizeTimeout = window.setTimeout(() => {
        handleContentResize()
      }, 50)
    })

    const chatTimeline = container.querySelector('.chat-timeline')
    if (chatTimeline) {
      resizeObserver.observe(chatTimeline)
    }

    return () => {
      if (resizeTimeout) {
        window.clearTimeout(resizeTimeout)
      }
      if (chatTimeline) {
        resizeObserver.unobserve(chatTimeline)
      }
      resizeObserver.disconnect()
    }
  }, [selectedConversation?.id, isAtBottom])

  const shellPanel = (() => {
    if (state.sidebarMode === 'settings') {
      return <PiSettingsMainPanel />
    }
    if (state.sidebarMode === 'skills') {
      return <PiSkillsMainPanel />
    }
    if (state.sidebarMode === 'extensions') {
      return <ChatonsExtensionsMainPanel />
    }
    if (state.sidebarMode === 'channels') {
      return <ChannelsMainPanel />
    }
    if (state.sidebarMode === 'extension-main-view') {
      return <ExtensionMainViewPanel viewId={state.activeExtensionViewId} />
    }
    return null
  })()

  const content = !selectedConversation ? (
    <div className="main-scroll">
      <section className="chat-section">
        <section className="hero-section">
          <div className="hero-group">
            <HeroMascot />
            <h1 className="hero-title">Sélectionnez un fil</h1>
            <div className="hero-subtitle">ou créez-en un depuis la barre latérale</div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key="quick-actions-no-thread"
              className="quick-actions-fade"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <QuickActionCards />
            </motion.div>
          </AnimatePresence>
        </section>
      </section>
    </div>
  ) : null

  if (shellPanel) {
    return shellPanel
  }

  if (content) {
    return content
  }

  return (
    <div className="conversation-side-panel-container">
      <ConversationSidePanel />
      <div className="main-content-wrapper">
        <div
          className="main-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget
            const distance = target.scrollHeight - target.scrollTop - target.clientHeight
            const atBottom = distance < 100
            setIsAtBottom(atBottom)
          }}
        >
        <section className="chat-section">
          <div className="chat-timeline">
            <AnimatePresence>
              {shouldShowHeroSection ? (
                <motion.section
                  key="hero-section-empty-thread"
                  className="hero-section"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <div className="hero-group">
                    <HeroMascot />
                    <h1 className="hero-title">{t('Démarrez la conversation')}</h1>
                    <div className="hero-subtitle">{t('Écrivez votre premier message ci-dessous')}</div>
                  </div>
                  {showQuickActions ? (
                    <motion.div
                      className={`quick-actions-fade ${quickActionsClosing ? 'is-hiding' : ''}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                    >
                      <QuickActionCards />
                    </motion.div>
                  ) : null}
                </motion.section>
              ) : null}
            </AnimatePresence>

            {pendingUserMessageText && !hasOptimisticPendingUserMessage ? (
              <article className="chat-message chat-message-user">
                <div className="chat-message-body">
                  <pre className="chat-message-text">{pendingUserMessageText}</pre>
                </div>
              </article>
            ) : null}

            {visibleMessages.map((message, index) => {
              const id = getMessageId(message, index)
              return (
                <ChatMessageItem
                  key={`${id}-${index}`}
                  conversationId={selectedConversation!.id}
                  id={id}
                  index={index}
                  message={message}
                  isStreaming={isStreaming}
                  showAssistantStats={state.settings.showAssistantStats}
                  nowMs={nowMs}
                  toolResultStatusByCallId={toolResultStatusByCallId}
                  toolCallTimingById={toolCallTimingById}
                  toolResultTextByCallId={toolResultTextByCallId}
                  toolCallOwnerByIndex={toolCallOwnerByIndex}
                />
              )
            })}

            {isStreaming ? (
              <article className="chat-message chat-message-assistant">
                <div className="chat-message-body">
                  <div className="chat-streaming-indicator" aria-live="polite">
                    <span className="chat-streaming-indicator-frame">
                      {THINKING_CAT_ANIMATIONS[thinkingAnimationIndex][thinkingFrameIndex]}
                    </span>
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
            {t('Aller en bas')}
          </button>
        ) : null}
      </div>

      <ExtensionRequestModal
        selectedConversationId={selectedConversation!.id}
        runtime={selectedRuntime}
        onRespond={respondExtensionUi}
      />

      {selectedRuntime?.requirementSheet ? (
        <RequirementSheet
          sheet={selectedRuntime.requirementSheet}
          onDismiss={() => dismissRequirementSheet(selectedConversation!.id)}
          onConfirm={() => dismissRequirementSheet(selectedConversation!.id)}
          onOpenSettings={() => {
            dismissRequirementSheet(selectedConversation!.id)
            openSettings()
          }}
        />
      ) : null}
      </div>
    </div>
  )
}
