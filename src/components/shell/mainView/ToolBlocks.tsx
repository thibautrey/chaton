import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { sanitizeTerminalText } from '@/components/shell/mainView/terminal'

export function ToolTerminal({ text, isError = false }: { text: string; isError?: boolean }) {
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

export function LiveToolTrace({
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
  const prevRunningRef = useRef(isRunning)

  useEffect(() => {
    const wasRunning = prevRunningRef.current
    prevRunningRef.current = isRunning

    let enterTimer: number | undefined
    let exitTimer: number | undefined
    let hideTimer: number | undefined

    if (isRunning && !wasRunning) {
      enterTimer = window.setTimeout(() => setPhase('enter'), 0)
    }

    if (!isRunning && wasRunning) {
      exitTimer = window.setTimeout(() => setPhase('exit'), 0)
      hideTimer = window.setTimeout(() => setPhase('hidden'), 380)
    }

    return () => {
      if (enterTimer !== undefined) window.clearTimeout(enterTimer)
      if (exitTimer !== undefined) window.clearTimeout(exitTimer)
      if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    }
  }, [isRunning])

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

export function CollapsibleToolBlock({
  title,
  badge,
  startExpanded,
  children,
  maxHeight = 200,
  onUserToggle,
}: {
  title: ReactNode
  badge: ReactNode
  startExpanded: boolean
  children: ReactNode
  maxHeight?: number
  onUserToggle?: (isOpen: boolean) => void
}) {
  const [isOpen, setIsOpen] = useState(startExpanded)
  // Tracks whether the user manually closed a block that the parent considers "done" (startExpanded=false).
  // When true, we suppress re-opens driven by startExpanded going true→false→true (e.g. rerender noise).
  // We never suppress a startExpanded true→false transition so that the "tool finished" auto-collapse
  // always fires, regardless of user interaction.
  const userClosedRef = useRef(false)
  const prevStartExpandedRef = useRef(startExpanded)

  useEffect(() => {
    const wasExpanded = prevStartExpandedRef.current
    prevStartExpandedRef.current = startExpanded

    if (startExpanded && !wasExpanded) {
      // Parent wants to expand (e.g. tool became running). Always honour this — it overrides a prior user-close.
      userClosedRef.current = false
      const timer = window.setTimeout(() => setIsOpen(true), 0)
      return () => window.clearTimeout(timer)
    }

    if (!startExpanded && wasExpanded) {
      // Parent wants to collapse (tool finished / duration threshold not met).
      // Always honour this so auto-collapse on completion is consistent.
      const timer = window.setTimeout(() => setIsOpen(false), 0)
      return () => window.clearTimeout(timer)
    }
  }, [startExpanded])

  return (
    <section className="chat-tool-block">
      <details
        className="chat-tool-details"
        open={isOpen}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open
          setIsOpen(nextOpen)
          if (!nextOpen) {
            // User explicitly closed this block; remember so we can suppress spurious re-opens
            // if startExpanded briefly flickers (but not for a genuine running→done transition,
            // which always collapses via the effect above).
            userClosedRef.current = true
          } else {
            userClosedRef.current = false
          }
          onUserToggle?.(nextOpen)
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
