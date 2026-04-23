import { useCallback, useEffect, useRef } from 'react'

/**
 * Attaches scroll shadow indicators to all matching elements inside a container.
 * Adds `scroll-shadow-top`, `scroll-shadow-bottom`, or both depending on scroll position.
 * Only activates when the element is actually scrollable (scrollHeight > clientHeight).
 *
 * Uses a throttled MutationObserver to avoid excessive re-attachment during streaming.
 */
export function useScrollShadow(containerRef: React.RefObject<HTMLElement | null>) {
  const cleanupRef = useRef<(() => void)[]>([])
  const attachScheduledRef = useRef<number | null>(null)

  const updateShadow = useCallback((el: HTMLElement) => {
    const canScroll = el.scrollHeight > el.clientHeight
    if (!canScroll) {
      el.classList.remove('scroll-shadow-top', 'scroll-shadow-bottom')
      return
    }

    const atTop = el.scrollTop <= 1
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 1

    el.classList.toggle('scroll-shadow-top', !atTop)
    el.classList.toggle('scroll-shadow-bottom', !atBottom)
  }, [])

  const attachToElements = useCallback(() => {
    for (const cleanup of cleanupRef.current) cleanup()
    cleanupRef.current = []

    if (!containerRef.current) return

    const elements = containerRef.current.querySelectorAll<HTMLElement>(
      '.chat-message-text, .chat-markdown',
    )

    for (const el of elements) {
      updateShadow(el)

      const onScroll = () => updateShadow(el)
      el.addEventListener('scroll', onScroll, { passive: true })

      const resizeObserver = new ResizeObserver(() => updateShadow(el))
      resizeObserver.observe(el)

      cleanupRef.current.push(() => {
        el.removeEventListener('scroll', onScroll)
        resizeObserver.disconnect()
        el.classList.remove('scroll-shadow-top', 'scroll-shadow-bottom')
      })
    }
  }, [containerRef, updateShadow])

  useEffect(() => {
    attachToElements()
    return () => {
      for (const cleanup of cleanupRef.current) cleanup()
      cleanupRef.current = []
    }
  }, [attachToElements])

  // Throttled re-attachment on DOM mutations to avoid perf impact during streaming.
  // The MutationObserver fires for every token appended; we debounce to at most
  // once per 200ms.
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new MutationObserver(() => {
      if (attachScheduledRef.current !== null) return
      attachScheduledRef.current = window.setTimeout(() => {
        attachScheduledRef.current = null
        attachToElements()
      }, 500)
    })
    observer.observe(containerRef.current, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      if (attachScheduledRef.current !== null) {
        window.clearTimeout(attachScheduledRef.current)
        attachScheduledRef.current = null
      }
    }
  }, [containerRef, attachToElements])
}
