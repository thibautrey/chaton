import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'

import { ChatonsExtensionsMainPanel } from '@/components/shell/ChatonsExtensionsMainPanel'
import { ChannelsMainPanel } from '@/components/shell/ChannelsMainPanel'
import { ExtensionMainViewPanel } from '@/components/shell/ExtensionMainViewPanel'
import { PiSettingsMainPanel } from '@/components/shell/PiSettingsMainPanel'
import { PiSkillsMainPanel } from '@/components/shell/PiSkillsMainPanel'
import { QuickActionCards } from '@/components/shell/QuickActionCards'
import { ChatMessageItem } from '@/components/shell/mainView/ChatMessageItem'
import { QUICK_ACTIONS_FADE_OUT_MS, THINKING_CAT_FRAMES } from '@/components/shell/mainView/constants'
import { ExtensionRequestModal } from '@/components/shell/mainView/ExtensionRequestModal'
import { HeroMascot } from '@/components/shell/mainView/HeroMascot'
import {
  dedupeToolCallMessages,
  dedupeToolCalls,
  getMessageId,
  getMessageTimestampMs,
  getMessageToolTitleKey,
  getStreamTurn,
  getToolBlocks,
  getToolResultInfo,
  isLikelySameToolTitle,
} from '@/components/shell/mainView/messageParsing'
import type { JsonValue } from '@/features/workspace/rpc'
import { useWorkspace } from '@/features/workspace/store'

export function MainView() {
  const { t } = useTranslation()
  const { state, respondExtensionUi } = useWorkspace()
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [thinkingFrameIndex, setThinkingFrameIndex] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const selectedConversation = state.conversations.find(
    (conversation) => conversation.id === state.selectedConversationId,
  )
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
    const timer = window.setTimeout(() => setThinkingFrameIndex(0), 0)
    return () => window.clearTimeout(timer)
  }, [isExecutionActive])

  useEffect(() => {
    if (!selectedConversation) return
    const container = scrollRef.current
    if (!container) return

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
  }, [selectedConversation])

  useEffect(() => {
    if (!showQuickActions) return
    if (shouldShowQuickActions) return
    const timer = window.setTimeout(() => setQuickActionsClosing(true), 0)
    return () => window.clearTimeout(timer)
  }, [showQuickActions, shouldShowQuickActions])

  useEffect(() => {
    if (!isExecutionActive) return
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
        if (block.kind === 'toolCall') {
          const key = block.toolCallId ?? getMessageToolTitleKey(message)
          if (key) {
            statusByCallId.set(key, 'running')
          }
        }
      }
    }

    for (const message of displayMessages) {
      const toolResult = getToolResultInfo(message)
      if (toolResult?.toolCallId) {
        statusByCallId.set(toolResult.toolCallId, toolResult.isError ? 'error' : 'success')
      }
      const blocks = getToolBlocks(message)
      const fallbackToolCallKey = getMessageToolTitleKey(message)
      for (const block of blocks) {
        if (block.kind === 'toolResult') {
          const key = block.toolCallId ?? fallbackToolCallKey
          if (key) {
            statusByCallId.set(key, block.isError ? 'error' : 'success')
          }
        }
      }
    }

    return statusByCallId
  }, [displayMessages])

  const openToolBlocks = useMemo(() => {
    let open = 0
    for (const message of displayMessages) {
      const blocks = getToolBlocks(message)
      const visibleBlocks = dedupeToolCalls(blocks)
      for (const block of visibleBlocks) {
        if (block.kind === 'toolCall') {
          const key = block.toolCallId ?? getMessageToolTitleKey(message)
          const status = key ? toolResultStatusByCallId.get(key) : undefined
          if (status === 'running' || !status) {
            open += 1
          }
        }
      }
    }
    return open
  }, [displayMessages, toolResultStatusByCallId])

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
    const container = scrollRef.current
    if (!container) {
      return
    }
    if (!isAtBottom) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: isExecutionActive ? 'auto' : 'smooth',
    })
  }, [isAtBottom, isExecutionActive, displayMessages, selectedRuntime?.status, openToolBlocks])

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

  if (!selectedConversation) {
    return (
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
    )
  }

  return (
    <>
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

            {pendingUserMessageText ? (
              <article className="chat-message chat-message-user">
                <div className="chat-message-body">
                  <pre className="chat-message-text">{pendingUserMessageText}</pre>
                </div>
              </article>
            ) : null}

            {displayMessages.map((message, index) => {
              const id = getMessageId(message, index)
              return (
                <ChatMessageItem
                  key={`${id}-${index}`}
                  conversationId={selectedConversation.id}
                  id={id}
                  index={index}
                  message={message}
                  isStreaming={isStreaming}
                  showAssistantStats={state.settings.showAssistantStats}
                  nowMs={nowMs}
                  toolResultStatusByCallId={toolResultStatusByCallId}
                  toolCallTimingById={toolCallTimingById}
                  toolResultTextByCallId={toolResultTextByCallId}
                />
              )
            })}

            {isStreaming ? (
              <article className="chat-message chat-message-assistant">
                <div className="chat-message-body">
                  <div className="chat-streaming-indicator" aria-live="polite">
                    <span className="chat-streaming-indicator-frame">
                      {THINKING_CAT_FRAMES[thinkingFrameIndex]}
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
        selectedConversationId={selectedConversation.id}
        runtime={selectedRuntime}
        onRespond={respondExtensionUi}
      />
    </>
  )
}
