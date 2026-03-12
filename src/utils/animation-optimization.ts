/**
 * Animation Performance Optimization
 * Reduce concurrent animations and use GPU-accelerated properties
 */

import { useRef } from 'react'

/**
 * Configuration for animation optimization
 */
export const ANIMATION_CONFIG = {
  // Only animate these transforms (GPU-accelerated)
  gpuAcceleratedProperties: ['transform', 'opacity', 'z-index'],

  // Avoid animating these (cause layout recalc)
  expensiveProperties: [
    'width',
    'height',
    'top',
    'left',
    'right',
    'bottom',
    'padding',
    'margin',
    'position',
  ],

  // Max concurrent animations
  maxConcurrentAnimations: 10,

  // Use CSS animations for repeating patterns
  cssAnimationThreshold: 100, // items
}

/**
 * Hook to limit concurrent animations
 * Ensures no more than N animations run simultaneously
 */
export function useAnimationQueue() {
  const activeRef = useRef<Set<string>>(new Set())

  const canAnimate = (): boolean => {
    return activeRef.current.size < ANIMATION_CONFIG.maxConcurrentAnimations
  }

  const startAnimation = (id: string): void => {
    activeRef.current.add(id)
  }

  const endAnimation = (id: string): void => {
    activeRef.current.delete(id)
  }

  return {
    canAnimate,
    startAnimation,
    endAnimation,
    activeCount: () => activeRef.current.size,
  }
}

/**
 * Hook to defer animations during scroll
 */
export function useDeferredAnimation(triggerAnimation: boolean, delay: number = 100) {
  const [shouldAnimate, setShouldAnimate] = React.useState(false)
  const isScrollingRef = React.useRef(false)

  // Track scroll state
  React.useEffect(() => {
    let timeout: NodeJS.Timeout | null = null

    const handleScroll = () => {
      isScrollingRef.current = true

      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        isScrollingRef.current = false
      }, delay)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeout) clearTimeout(timeout)
    }
  }, [delay])

  // Only animate when not scrolling
  React.useEffect(() => {
    if (triggerAnimation && !isScrollingRef.current) {
      setShouldAnimate(true)
    }
  }, [triggerAnimation])

  return shouldAnimate
}

/**
 * Recommendations for animation optimization
 */
export const ANIMATION_OPTIMIZATION_GUIDE = {
  currentIssues: [
    {
      issue: 'All 500+ messages animate on render',
      impact: '1499ms of animation time (15% of Blink work)',
      fix: 'Only animate visible messages',
      expectedGain: '-60% animation time',
    },
    {
      issue: 'Animations use layout-affecting properties',
      impact: 'Triggers layout recalc for each animation frame',
      fix: 'Use transform and opacity only',
      expectedGain: '-40% layout work',
    },
    {
      issue: 'Many animations run simultaneously',
      impact: 'Overwhelms GPU, causes stuttering',
      fix: 'Queue animations, max 10 concurrent',
      expectedGain: '-50% frame drops',
    },
  ],

  recommendations: {
    beforeOptimization: `
    // Animate all messages on render
    {messages.map(msg => (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {msg.content}
      </motion.div>
    ))}
    `,

    afterOptimization: `
    // Only animate visible messages
    const visibleRange = { start: 0, end: 20 }; // Virtual window
    const visibleMessages = messages.slice(
      visibleRange.start,
      visibleRange.end
    );

    {visibleMessages.map((msg, i) => (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ 
          duration: 0.2,
          delay: i * 0.05 // Stagger animations
        }}
      >
        {msg.content}
      </motion.div>
    ))}
    `,

    cssAnimationExample: `
    /* Faster for repeating animations */
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .message-item {
      animation: fadeIn 200ms ease-out forwards;
      will-change: opacity; /* Prepare browser */
    }

    /* Instead of framer-motion for simple cases */
    `,
  },

  bestPractices: [
    'Animate transform and opacity only (GPU-accelerated)',
    'Avoid animating position, width, height (layout)',
    'Use CSS animations for simple, repeating patterns',
    'Stagger animations to avoid simultaneous updates',
    'Reduce concurrent animations during scroll',
    'Use will-change during animation, remove after',
    'Profile with DevTools Performance tab',
  ],
}

/**
 * Helper to create staggered animations
 */
export function createStaggerAnimation(index: number) {
  const delayPerItem = 0.01 // 10ms per item
  const maxDelay = 0.3 // Cap at 300ms
  const delay = Math.min(index * delayPerItem, maxDelay)

  return {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: {
      duration: 0.2,
      delay,
      ease: 'easeOut',
    },
  }
}

/**
 * Helper to reduce animation on large lists
 */
export function shouldReduceAnimations(itemCount: number): boolean {
  const ANIMATION_THRESHOLD = 100
  return itemCount > ANIMATION_THRESHOLD
}

import React from 'react'

export default ANIMATION_OPTIMIZATION_GUIDE
