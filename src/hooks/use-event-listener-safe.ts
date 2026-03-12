/**
 * Hook to safely manage event listeners with cleanup
 * Prevents memory leaks from forgotten removeEventListener calls
 */

import { useEffect, useCallback, useRef, useState } from 'react'

interface ListenerEntry {
  target: EventTarget
  event: string
  handler: EventListener
  options?: boolean | AddEventListenerOptions
}

/**
 * useEventListener - Safely attach event listeners with automatic cleanup
 *
 * @example
 * useEventListener(window, 'resize', handleResize, { passive: true });
 * // Automatically removes listener on unmount
 */
export function useEventListener(
  target: EventTarget | null,
  event: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): void {
  const listenerRef = useRef<ListenerEntry | null>(null)

  useEffect(() => {
    if (!target) return

    // Store listener entry for cleanup
    listenerRef.current = {
      target,
      event,
      handler,
      options,
    }

    target.addEventListener(event, handler, options)

    // Cleanup: Remove listener on unmount
    return () => {
      if (listenerRef.current) {
        listenerRef.current.target.removeEventListener(
          listenerRef.current.event,
          listenerRef.current.handler,
          listenerRef.current.options,
        )
        listenerRef.current = null
      }
    }
  }, [target, event, handler, options])
}

/**
 * useEventListenerDebounced - Event listener with debounce to reduce handler calls
 *
 * @param target - Event target (window, element, etc)
 * @param event - Event name
 * @param handler - Event handler
 * @param debounceMs - Debounce delay in milliseconds
 * @param options - Event listener options
 */
export function useEventListenerDebounced(
  target: EventTarget | null,
  event: string,
  handler: EventListener,
  debounceMs: number = 100,
  options?: boolean | AddEventListenerOptions,
): void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastCallRef = useRef<number>(0)

  const debouncedHandler = useCallback(
    (e: Event) => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCallRef.current

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      if (timeSinceLastCall >= debounceMs) {
        // Enough time has passed, call immediately
        lastCallRef.current = now
        handler(e)
      } else {
        // Schedule deferred call
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now()
          handler(e)
        }, debounceMs - timeSinceLastCall)
      }
    },
    [handler, debounceMs],
  )

  useEventListener(target, event, debouncedHandler, options)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])
}

/**
 * useEventListenerThrottled - Event listener with throttle
 *
 * @param target - Event target
 * @param event - Event name
 * @param handler - Event handler
 * @param throttleMs - Throttle delay
 * @param options - Event listener options
 */
export function useEventListenerThrottled(
  target: EventTarget | null,
  event: string,
  handler: EventListener,
  throttleMs: number = 100,
  options?: boolean | AddEventListenerOptions,
): void {
  const lastCallRef = useRef<number>(0)
  const scheduledRef = useRef<NodeJS.Timeout | null>(null)

  const throttledHandler = useCallback(
    (e: Event) => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCallRef.current

      if (timeSinceLastCall >= throttleMs) {
        // Enough time has passed, call immediately
        lastCallRef.current = now
        handler(e)
      } else if (!scheduledRef.current) {
        // Schedule call for later
        scheduledRef.current = setTimeout(() => {
          lastCallRef.current = Date.now()
          handler(e)
          scheduledRef.current = null
        }, throttleMs - timeSinceLastCall)
      }
    },
    [handler, throttleMs],
  )

  useEventListener(target, event, throttledHandler, options)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scheduledRef.current) {
        clearTimeout(scheduledRef.current)
      }
    }
  }, [])
}

/**
 * useResizeObserver - Observe element size changes without forced layouts
 *
 * @example
 * useResizeObserver(elementRef, (entry) => {
 *   console.log('Size changed:', entry.contentRect);
 * });
 */
export function useResizeObserver(
  target: React.RefObject<HTMLElement> | null,
  callback: (entry: ResizeObserverEntry) => void,
): void {
  useEffect(() => {
    if (!target?.current) return
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      // Use RAF to batch updates
      requestAnimationFrame(() => {
        entries.forEach(callback)
      })
    })

    observer.observe(target.current)

    return () => {
      observer.disconnect()
    }
  }, [target, callback])
}

/**
 * useIntersectionObserver - Lazy load elements when visible
 *
 * @example
 * const isVisible = useIntersectionObserver(elementRef);
 * if (isVisible) { renderContent(); }
 */
export function useIntersectionObserver(
  target: React.RefObject<HTMLElement> | null,
  options?: IntersectionObserverInit,
): boolean {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!target?.current) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting)
    }, options)

    observer.observe(target.current)

    return () => {
      observer.disconnect()
    }
  }, [target, options])

  return isVisible
}
