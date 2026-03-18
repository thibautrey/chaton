import { useEffect, useState, type ReactNode } from 'react'

type TopSheetProps = {
  open: boolean
  onClose: () => void
  className?: string
  bodyClassName?: string
  footerClassName?: string
  closeDelayMs?: number
  children: ReactNode
  footer?: ReactNode
}

export function TopSheet({
  open,
  onClose,
  className,
  bodyClassName,
  footerClassName,
  closeDelayMs = 220,
  children,
  footer,
}: TopSheetProps) {
  const [isRendered, setIsRendered] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      // Initial render state - set synchronously to avoid flash
      setIsRendered(true)
      setIsClosing(false)
      return
    }

    if (!isRendered) {
      return
    }

    setIsClosing(true)
    const timeout = window.setTimeout(() => {
      setIsRendered(false)
      setIsClosing(false)
    }, closeDelayMs)

    return () => window.clearTimeout(timeout)
  }, [closeDelayMs, isRendered, open])

  useEffect(() => {
    if (!isRendered) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isRendered, onClose])

  if (!isRendered) {
    return null
  }

  return (
    <div
      className={`top-sheet-backdrop ${isClosing ? 'top-sheet-backdrop-closing' : ''}`}
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div
        className={`top-sheet ${isClosing ? 'top-sheet-closing' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{ zIndex: 1001 }}
      >
        <div className={bodyClassName ?? ''}>{children}</div>
        {footer ? <div className={footerClassName ?? ''}>{footer}</div> : null}
      </div>
    </div>
  )
}
