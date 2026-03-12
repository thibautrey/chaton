/**
 * Hook for deferred scroll handling
 * Prevents layout thrashing by deferring state updates until browser is idle
 */

import { useEffect, useRef, useCallback } from 'react';
import { batchUpdatesWhenIdle } from '@/utils/batch-updates';

interface UseOptimizedScrollOptions {
  onScroll?: (scrollPos: number, atBottom: boolean) => void;
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Custom hook to handle scroll with deferred state updates
 * Prevents Blink rendering engine from thrashing styles during scroll
 *
 * @example
 * const { scrollRef, isAtBottom } = useOptimizedScroll(
 *   {
 *     onScroll: (pos, atBottom) => {
 *       console.log('Scroll position:', pos);
 *     },
 *     debounceMs: 50,
 *   },
 *   [messages]
 * );
 */
export function useOptimizedScroll(
  options: UseOptimizedScrollOptions = {},
) {
  const { onScroll, debounceMs = 50, enabled = true } = options;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingUpdateRef = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(
    (event: Event) => {
      if (!enabled) return;

      const target = event.currentTarget as HTMLDivElement;
      if (!target) return;

      const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
      const atBottom = distance < 100;
      const scrollPos = target.scrollTop;

      // Clear any pending update
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }

      // Defer expensive calculations until browser is idle
      if (typeof requestIdleCallback !== 'undefined') {
        pendingUpdateRef.current = setTimeout(() => {
          batchUpdatesWhenIdle(
            [
              () => {
                if (onScroll) {
                  onScroll(scrollPos, atBottom);
                }
              },
            ],
            debounceMs,
          );
        }, 0);
      } else {
        // Fallback: debounce the callback
        pendingUpdateRef.current = setTimeout(() => {
          if (onScroll) {
            onScroll(scrollPos, atBottom);
          }
        }, debounceMs);
      }
    },
    [enabled, onScroll, debounceMs],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !enabled) return;

    // Use passive listener for better scroll performance
    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, [enabled, handleScroll]);

  return {
    scrollRef,
    handleScroll,
  };
}
