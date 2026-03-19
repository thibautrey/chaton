import { useEffect, useRef, useState, useCallback } from "react";
import type { AutocompleteSuggestion } from "@/hooks/use-composer-autocomplete";

interface ComposerAutocompleteProps {
  /** Whether autocomplete is available and active */
  isVisible: boolean;
  /** Current suggestion to display inline */
  suggestion: AutocompleteSuggestion | null;
  /** Current text in the textarea */
  currentText: string;
  /** Cursor position */
  cursorPosition: number;
  /** Callback when user presses Tab to accept */
  onAccept: () => void;
  /** Reference to the textarea element */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Inline autocomplete component that shows ghost text directly in the composer.
 * 
 * Works by overlaying a styled div behind the textarea:
 * - The suggestion text appears in gray below the cursor
 * - User can press Tab to accept or continue typing to ignore
 * - Non-intrusive and doesn't block normal typing
 */
export function ComposerAutocomplete({
  isVisible,
  suggestion,
  currentText,
  cursorPosition,
  textareaRef,
}: ComposerAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(20);

  // Measure line height from textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const updateHeight = () => {
      const computed = window.getComputedStyle(textarea);
      const lh = computed.lineHeight;
      if (lh && lh !== 'normal') {
        const parsed = parseFloat(lh);
        if (!isNaN(parsed)) {
          setLineHeight(parsed);
        }
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(textarea);

    return () => observer.disconnect();
  }, [textareaRef]);

  // Calculate cursor line for positioning
  const getCursorLine = useCallback((): number => {
    const textBeforeCursor = currentText.slice(0, cursorPosition);
    return (textBeforeCursor.match(/\n/g) || []).length;
  }, [currentText, cursorPosition]);

  if (!isVisible || !suggestion) {
    return null;
  }

  const cursorTop = getCursorLine() * lineHeight;

  return (
    <div
      ref={containerRef}
      className="composer-autocomplete-inline"
      aria-hidden="true"
    >
      {/* Ghost text positioned below cursor */}
      <div
        className="composer-autocomplete-ghost"
        style={{
          position: 'absolute',
          top: `${cursorTop}px`,
          left: '12px',
          color: 'var(--text-tertiary, #8b8b8b)',
          font: 'inherit',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          opacity: 0.6,
          fontStyle: 'italic',
        }}
      >
        {suggestion.text}
      </div>
    </div>
  );
}
