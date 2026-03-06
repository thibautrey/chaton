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
}: {
  title: ReactNode
  badge: ReactNode
  startExpanded: boolean
  children: ReactNode
  maxHeight?: number
}) {
  const [isOpen, setIsOpen] = useState(startExpanded)
  const prevStartExpandedRef = useRef(startExpanded)

  useEffect(() => {
    const wasExpanded = prevStartExpandedRef.current
    prevStartExpandedRef.current = startExpanded

    if (startExpanded && !wasExpanded) {
      const timer = window.setTimeout(() => setIsOpen(true), 0)
      return () => window.clearTimeout(timer)
    }

    if (!startExpanded && wasExpanded) {
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
