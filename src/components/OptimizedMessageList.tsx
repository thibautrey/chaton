/**
 * Optimized Message List Component
 * Uses virtual scrolling for large conversation lists
 */

import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { VirtualScroll } from '@/components/VirtualScroll';
import type { JsonValue } from '@/features/workspace/rpc';

interface OptimizedMessageListProps {
  messages: JsonValue[];
  renderMessage: (message: JsonValue, index: number) => ReactNode;
  itemHeight?: number;
  containerHeight?: number;
  useVirtualization?: boolean;
  className?: string;
  getItemKey?: (item: JsonValue, index: number) => string;
}

/**
 * Optimized message list that uses virtual scrolling for performance
 * Falls back to standard rendering if virtualization is disabled
 */
export function OptimizedMessageList({
  messages,
  renderMessage,
  itemHeight = 100,
  containerHeight = 600,
  useVirtualization = true,
  className = '',
  getItemKey = (_item, index) => `${index}`,
}: OptimizedMessageListProps) {
  const memoizedRenderMessage = useCallback(
    (item: unknown, index: number): ReactNode => {
      // Cast to JsonValue for rendering
      return renderMessage(item as JsonValue, index);
    },
    [renderMessage]
  );

  // Memoize messages to prevent unnecessary recalculations
  const memoizedMessages = useMemo(() => messages, [messages]);

  if (!useVirtualization || memoizedMessages.length < 50) {
    // For small lists, standard rendering is fine
    return (
      <div className={className}>
        {memoizedMessages.map((message, index) => (
          <div key={getItemKey(message, index)}>{memoizedRenderMessage(message, index)}</div>
        ))}
      </div>
    );
  }

  // For large lists, use virtual scrolling
  return (
    <VirtualScroll
      items={memoizedMessages}
      itemSize={itemHeight}
      height={containerHeight}
      renderItem={memoizedRenderMessage}
      overscan={5}
      className={className}
    />
  );
}
