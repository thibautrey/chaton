/**
 * Object pooling utilities to reduce garbage collection pressure
 * Reuses objects instead of creating new ones
 */

import React from 'react'

/**
 * Generic object pool factory
 * Reuses pre-allocated objects to reduce GC overhead
 */
export class ObjectPool<T extends object> {
  private available: T[] = []
  private inUse = new WeakMap<T, boolean>()
  private inUseCount: number = 0
  private factory: () => T
  private reset: (obj: T) => void

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 50,
  ) {
    this.factory = factory
    this.reset = reset
    // Pre-allocate objects
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory())
    }
  }

  acquire(): T {
    let obj: T
    if (this.available.length > 0) {
      obj = this.available.pop()!
    } else {
      obj = this.factory()
    }
    this.inUse.set(obj, true)
    this.inUseCount++
    return obj
  }

  release(obj: T): void {
    if (this.inUse.get(obj)) {
      this.inUse.delete(obj)
      this.inUseCount--
      this.reset(obj)
      this.available.push(obj)
    }
  }

  clear(): void {
    this.available = []
    this.inUse = new WeakMap()
    this.inUseCount = 0
  }

  get size(): number {
    return this.available.length + this.inUseCount
  }
}

/**
 * Pooled message metadata object
 * Reduces allocations during message rendering
 */
export interface PooledMessageMeta {
  id: string
  role: 'user' | 'assistant' | 'system' | 'toolResult'
  timestamp: number
  hasTools: boolean
  hasMeta: boolean
}

/**
 * Factory for message metadata pool
 */
export function createMessageMetaPool(initialSize = 100): ObjectPool<PooledMessageMeta> {
  return new ObjectPool<PooledMessageMeta>(
    () => ({
      id: '',
      role: 'assistant',
      timestamp: 0,
      hasTools: false,
      hasMeta: false,
    }),
    (obj) => {
      obj.id = ''
      obj.timestamp = 0
      obj.hasTools = false
      obj.hasMeta = false
    },
    initialSize,
  )
}

/**
 * Pooled scroll state
 * Reused for scroll events to reduce allocations
 */
export interface PooledScrollState {
  distance: number
  atBottom: boolean
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Factory for scroll state pool
 */
export function createScrollStatePool(initialSize = 50): ObjectPool<PooledScrollState> {
  return new ObjectPool<PooledScrollState>(
    () => ({
      distance: 0,
      atBottom: false,
      scrollTop: 0,
      scrollHeight: 0,
      clientHeight: 0,
    }),
    (obj) => {
      obj.distance = 0
      obj.atBottom = false
      obj.scrollTop = 0
      obj.scrollHeight = 0
      obj.clientHeight = 0
    },
    initialSize,
  )
}

/**
 * Global pools (singleton pattern)
 */
let messageMetaPool: ObjectPool<PooledMessageMeta> | null = null
let scrollStatePool: ObjectPool<PooledScrollState> | null = null

export function getMessageMetaPool(): ObjectPool<PooledMessageMeta> {
  if (!messageMetaPool) {
    messageMetaPool = createMessageMetaPool()
  }
  return messageMetaPool
}

export function getScrollStatePool(): ObjectPool<PooledScrollState> {
  if (!scrollStatePool) {
    scrollStatePool = createScrollStatePool()
  }
  return scrollStatePool
}

/**
 * Clear all pools (call on app shutdown)
 */
export function clearAllPools(): void {
  messageMetaPool?.clear()
  scrollStatePool?.clear()
}

/**
 * Hook to ensure cleanup on component unmount
 */
export function useObjectPoolCleanup(): void {
  React.useEffect(() => {
    return () => {
      // Optional: could clear pools on unmount
      // clearAllPools()
    }
  }, [])
}
