/**
 * Simple Virtual Scrolling implementation
 * Renders only visible items to improve performance for large lists
 * No external dependencies required
 */

import {
  useRef,
  useState,
  useCallback,
  memo,
} from 'react';
import type { ReactNode, CSSProperties } from 'react';

interface VirtualScrollProps<T> {
  items: T[];
  itemSize: number; // Fixed height of each item in pixels
  height: number; // Container height in pixels
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number; // Number of items to render outside visible area
  className?: string;
  style?: React.CSSProperties;
  onVisibleRangeChange?: (start: number, end: number) => void;
}

interface ScrollState {
  scrollTop: number;
  visibleStart: number;
  visibleEnd: number;
}

/**
 * Virtual Scroll Container Component
 * Efficiently renders large lists by only rendering visible items
 */
export const VirtualScroll = memo(function VirtualScroll<T>({
  items,
  itemSize,
  height,
  renderItem,
  overscan = 5,
  className = '',
  style = {},
  onVisibleRangeChange,
}: VirtualScrollProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    scrollTop: 0,
    visibleStart: 0,
    visibleEnd: Math.ceil(height / itemSize),
  });

  const totalHeight = items.length * itemSize;

  // Calculate visible range based on scroll position
  const visibleStart = Math.max(0, Math.floor(scrollState.scrollTop / itemSize) - overscan);
  const visibleEnd = Math.min(
    items.length,
    Math.ceil((scrollState.scrollTop + height) / itemSize) + overscan
  );

  const visibleItems = items.slice(visibleStart, visibleEnd);
  const offsetY = visibleStart * itemSize;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = (e.target as HTMLDivElement).scrollTop;
    
    setScrollState({
      scrollTop,
      visibleStart,
      visibleEnd,
    });

    if (onVisibleRangeChange) {
      onVisibleRangeChange(visibleStart, visibleEnd);
    }
  }, [visibleStart, visibleEnd, onVisibleRangeChange]);

  return (
    <div
      ref={containerRef}
      style={{
        height: `${height}px`,
        overflow: 'auto',
        ...style,
      }}
      className={className}
      onScroll={handleScroll}
    >
      {/* Spacer for items before visible range */}
      {visibleStart > 0 && (
        <div style={{ height: `${offsetY}px`, pointerEvents: 'none' }} />
      )}

      {/* Visible items */}
      {visibleItems.map((item, i) => (
        <div key={visibleStart + i} style={{ height: `${itemSize}px` }}>
          {renderItem(item, visibleStart + i)}
        </div>
      ))}

      {/* Spacer for items after visible range */}
      {visibleEnd < items.length && (
        <div
          style={{
            height: `${totalHeight - visibleEnd * itemSize}px`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
});

/**
 * Optimized list item wrapper with memo
 */
interface ListItemProps<T> {
  item: T;
  index: number;
  render: (item: T, index: number) => ReactNode;
}

export const VirtualListItem = memo(function VirtualListItem<T>({
  item,
  index,
  render,
}: ListItemProps<T>) {
  return <>{render(item, index)}</>;
}) as unknown as <T,>(props: ListItemProps<T>) => ReactNode;

/**
 * Hook for managing virtual scroll state
 */
export function useVirtualScroll(itemCount: number, itemSize: number, containerHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(Math.ceil(containerHeight / itemSize));

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const st = (e.currentTarget as HTMLDivElement).scrollTop;
    setScrollTop(st);

    const start = Math.floor(st / itemSize);
    const end = Math.ceil((st + containerHeight) / itemSize);

    setVisibleStart(start);
    setVisibleEnd(Math.min(end + 5, itemCount)); // +5 for overscan
  }, [itemSize, containerHeight, itemCount]);

  return {
    scrollTop,
    visibleStart,
    visibleEnd,
    handleScroll,
    totalHeight: itemCount * itemSize,
  };
}
