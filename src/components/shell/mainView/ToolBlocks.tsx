import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export function sanitizeTerminalText(text: string): string {
  if (!text) return ''

  // Strip common ANSI CSI + OSC escape sequences to keep logs readable in cards.
  const withoutAnsi = text
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
  return withoutAnsi.replace(/\r\n?/g, '\n')
}

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
