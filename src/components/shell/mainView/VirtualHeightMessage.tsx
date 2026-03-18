/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageExpansion } from '@/hooks/useMessageExpansionContext'

const MAX_PREVIEW_HEIGHT_PX = 320
const HEIGHT_CHECK_DEBOUNCE_MS = 100

interface VirtualHeightMessageProps {
  children: ReactNode
  contentId: string
  wordCount?: number
  isStreaming?: boolean
}

/**
 * VirtualHeightMessage - Implements the "Virtual Height with Preview" pattern
 * 
 * Shows content up to MAX_PREVIEW_HEIGHT_PX. If content exceeds this height,
 * the text fades out at the bottom with a floating "Show more" button.
 */
export function VirtualHeightMessage({
  children,
  contentId,
  wordCount,
  isStreaming = false,
}: VirtualHeightMessageProps) {
  const { t } = useTranslation()
  const { registerMessage, unregisterMessage } = useMessageExpansion()
  const contentRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [shouldShowExpand, setShouldShowExpand] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const checkTimeoutRef = useRef<number | null>(null)
  const isExpandedRef = useRef(isExpanded)
  
  // Keep ref in sync with state to avoid dependency cycles
  useEffect(() => {
    isExpandedRef.current = isExpanded
  }, [isExpanded])

  // Register collapse callback with context
  useEffect(() => {
    const collapseCallback = () => {
      if (isExpanded && !userManuallySetExpanded.current) {
        setIsExpanded(false)
      }
    }
    
    registerMessage(contentId, collapseCallback)
    
    return () => {
      unregisterMessage(contentId)
    }
  }, [contentId, isExpanded, registerMessage, unregisterMessage])

  // Calculate how much content is hidden
  const hiddenInfo = useMemo(() => {
    if (!shouldShowExpand || isExpanded || contentHeight <= MAX_PREVIEW_HEIGHT_PX) {
      return null
    }
    
    const hiddenPixels = contentHeight - MAX_PREVIEW_HEIGHT_PX
    const hiddenPercentage = Math.round((hiddenPixels / contentHeight) * 100)
    
    // Estimate hidden words if total word count is provided
    let hiddenText = ''
    if (wordCount && wordCount > 0) {
      const estimatedHiddenWords = Math.round((hiddenPercentage / 100) * wordCount)
      if (estimatedHiddenWords > 0) {
        hiddenText = t('+{{count}} mots', { count: estimatedHiddenWords })
      }
    } else {
      // Fallback to percentage
      hiddenText = t('+{{percentage}}%', { percentage: hiddenPercentage })
    }
    
    return { hiddenPixels, hiddenPercentage, hiddenText }
  }, [shouldShowExpand, isExpanded, contentHeight, wordCount, t])

  // Check if content exceeds max preview height
  const checkContentHeight = useCallback(() => {
    if (!contentRef.current || isExpandedRef.current) return
    
    const height = contentRef.current.scrollHeight
    setContentHeight(height)
    setShouldShowExpand(height > MAX_PREVIEW_HEIGHT_PX)
  }, [])



  // Store checkContentHeight in a ref to avoid dependency cycles in ResizeObserver
  const checkContentHeightRef = useRef(checkContentHeight)
  checkContentHeightRef.current = checkContentHeight

  // Set up resize observer to detect content changes
  useEffect(() => {
    if (!contentRef.current) return

    // Initial check
    checkContentHeightRef.current()

    // Set up resize observer
    resizeObserverRef.current = new ResizeObserver(() => {
      // Use ref to always get latest version without re-triggering effect
      if (checkTimeoutRef.current !== null) {
        window.clearTimeout(checkTimeoutRef.current)
      }
      checkTimeoutRef.current = window.setTimeout(() => {
        checkContentHeightRef.current()
      }, HEIGHT_CHECK_DEBOUNCE_MS)
    })
    resizeObserverRef.current.observe(contentRef.current)

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
      }
      if (checkTimeoutRef.current !== null) {
        window.clearTimeout(checkTimeoutRef.current)
      }
    }
  }, [])

  // Track if user manually expanded/collapsed (to prevent auto-reset)
  const userManuallySetExpanded = useRef(false)

  // Re-check when content ID changes (new message)
  useEffect(() => {
    // Only reset if contentId actually changed to a different value
    // and user hasn't manually toggled
    if (!userManuallySetExpanded.current) {
      setIsExpanded(false)
    }
    setShouldShowExpand(false)
    setContentHeight(0)
    // eslint-disable-next-line react-hooks/immutability
    userManuallySetExpanded.current = false
    // Small delay to let content render
    const timeout = window.setTimeout(() => {
      checkContentHeightRef.current()
    }, 50)
    return () => window.clearTimeout(timeout)
  }, [contentId])

  // While streaming, periodically check height as content grows
  useEffect(() => {
    if (!isStreaming) return
    
    const interval = window.setInterval(() => {
      checkContentHeightRef.current()
    }, 500)
    
    return () => window.clearInterval(interval)
  }, [isStreaming])

  const handleExpand = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    userManuallySetExpanded.current = true
    setIsExpanded(true)
  }, [])

  const handleCollapse = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    userManuallySetExpanded.current = true
    setIsExpanded(false)
    // Scroll the message back into view if needed
    if (contentRef.current) {
      contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [])

  return (
    <div className="virtual-height-message">
      <div
        ref={contentRef}
        className={`virtual-height-content ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${shouldShowExpand ? 'has-overflow' : ''}`}
        style={
          isExpanded
            ? undefined
            : {
                maxHeight: shouldShowExpand ? `${MAX_PREVIEW_HEIGHT_PX}px` : undefined,
              }
        }
      >
        {children}
      </div>
      
      {/* Floating Expand/Collapse button - positioned over the content */}
      {shouldShowExpand && (
        <div className="virtual-height-floating-controls">
          {isExpanded ? (
            <button
              type="button"
              onClick={handleCollapse}
              className="virtual-height-floating-btn"
              aria-label={t('Réduire')}
            >
              <svg
                className="virtual-height-floating-icon"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 10L8 6L12 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('Réduire')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExpand}
              className="virtual-height-floating-btn"
              aria-label={t('Afficher plus')}
            >
              {hiddenInfo?.hiddenText || t('Afficher plus')}
              <svg
                className="virtual-height-floating-icon"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Count words in text content (helper function)
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') return 0
  // Match word characters, handling Unicode
  const matches = text.match(/[\w\u00C0-\u017F]+/g)
  return matches ? matches.length : 0
}
