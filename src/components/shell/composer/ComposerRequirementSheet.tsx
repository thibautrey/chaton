import { memo, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { ComposerButtonRequirement } from '@/extensions/composer-button-sdk';

interface ComposerRequirementSheetProps {
  requirement: ComposerButtonRequirement;
  onDismiss: () => void;
  onConfirm: () => void;
}

/**
 * Composer requirement sheet - displays extension requirements in a modal.
 * Uses the same design and styling as the main RequirementSheet component.
 */
export const ComposerRequirementSheet = memo(function ComposerRequirementSheet({
  requirement,
  onDismiss,
  onConfirm,
}: ComposerRequirementSheetProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // Listen for postMessage from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (iframeWindow && event.source !== iframeWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'chaton:requirement-sheet:confirm') {
        onConfirm();
      } else if (data.type === 'chaton:requirement-sheet:dismiss') {
        onDismiss();
      } else if (data.type === 'chaton:requirement-sheet:open-settings') {
        onDismiss();
      }
    },
    [onConfirm, onDismiss],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  // Click on backdrop dismisses
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === backdropRef.current) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  return (
    <div
      ref={backdropRef}
      className="requirement-sheet-backdrop"
      onClick={handleBackdropClick}
    >
      <div className="requirement-sheet" role="dialog" aria-modal="true" aria-label={requirement.title ?? 'Action Required'}>
        <div className="requirement-sheet-header">
          <div className="requirement-sheet-title">
            {requirement.title ?? 'Action Required'}
          </div>
          <button
            type="button"
            className="requirement-sheet-close"
            onClick={() => {
              console.log('[ComposerRequirementSheet] X button clicked, calling onDismiss');
              onDismiss();
            }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="requirement-sheet-body">
          <iframe
            ref={iframeRef}
            className="requirement-sheet-iframe"
            srcDoc={requirement.html}
            title={requirement.title ?? 'Action Required'}
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>
      </div>
    </div>
  );
});
