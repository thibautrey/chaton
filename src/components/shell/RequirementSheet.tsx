import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

import type { RequirementSheet as RequirementSheetData } from '@/features/workspace/rpc'

type RequirementSheetProps = {
  sheet: RequirementSheetData
  onDismiss: () => void
  onConfirm: () => void
  onOpenSettings: () => void
}

/**
 * A sheet that slides down from the top of the main panel, rendering
 * an iframe with extension-provided (or built-in) HTML. The user can
 * complete prerequisite actions (auth, config) before the tool resumes.
 */
export function RequirementSheet({ sheet, onDismiss, onConfirm, onOpenSettings }: RequirementSheetProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)

  // Listen for postMessage from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'chaton:requirement-sheet:confirm') {
        onConfirm()
      } else if (data.type === 'chaton:requirement-sheet:dismiss') {
        onDismiss()
      } else if (data.type === 'chaton:requirement-sheet:open-settings') {
        onOpenSettings()
        onDismiss()
      }
    },
    [onConfirm, onDismiss, onOpenSettings],
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  // Click on backdrop dismisses
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === backdropRef.current) {
        onDismiss()
      }
    },
    [onDismiss],
  )

  return (
    <div
      ref={backdropRef}
      className="requirement-sheet-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="requirement-sheet" role="dialog" aria-modal="true" aria-label={sheet.title ?? 'Action Required'}>
        <div className="requirement-sheet-header">
          <div className="requirement-sheet-title">
            {sheet.title ?? 'Action Required'}
          </div>
          <button
            type="button"
            className="requirement-sheet-close"
            onClick={onDismiss}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="requirement-sheet-body">
          <iframe
            ref={iframeRef}
            className="requirement-sheet-iframe"
            srcDoc={sheet.html}
            title={sheet.title ?? 'Action Required'}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      </div>
    </div>
  )
}
