import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { replaceLinksWithAnchors } from '@/utils/detectLinks'

/**
 * Renders streaming text with a typewriter fade-in effect.
 *
 * Characters are revealed progressively from a buffer. Each batch
 * of newly-revealed characters fades in via CSS animation. Once
 * streaming ends the full text is shown immediately.
 *
 * Performance: uses a single requestAnimationFrame loop, triggers
 * at most one React setState per frame, and splits the DOM into
 * just two spans (stable + fading) to keep the tree shallow.
 */

const BASE_CHARS_PER_FRAME = 3
const CATCHUP_THRESHOLD = 120
const CATCHUP_CHARS_PER_FRAME = 20

interface TypewriterTextProps {
  text: string
  active: boolean
  onLinkClick: (url: string) => void
}

export const TypewriterText = memo(function TypewriterText({
  text,
  active,
  onLinkClick,
}: TypewriterTextProps) {
  const [revealedLen, setRevealedLen] = useState(() => (active ? 0 : text.length))
  // Track the boundary where the fade span starts
  const [fadeStart, setFadeStart] = useState(() => (active ? 0 : text.length))
  const bufferRef = useRef(text)
  const rafRef = useRef<number | null>(null)
  const revealedLenRef = useRef(revealedLen)
  const fadeStartRef = useRef(fadeStart)
  const prevActiveRef = useRef(active)

  useLayoutEffect(() => {
    bufferRef.current = text
  })

  // Promote faded characters to stable after the CSS animation completes
  useEffect(() => {
    if (!active) return
    if (fadeStart >= revealedLen) return

    const timer = window.setTimeout(() => {
      fadeStartRef.current = revealedLenRef.current
      setFadeStart(revealedLenRef.current)
    }, 200) // matches CSS animation duration

    return () => window.clearTimeout(timer)
  }, [active, revealedLen, fadeStart])

  // When streaming stops, reveal everything immediately
  useEffect(() => {
    if (!active && prevActiveRef.current) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const len = bufferRef.current.length
      revealedLenRef.current = len
      fadeStartRef.current = len
      setRevealedLen(len)
      setFadeStart(len)
    }
    prevActiveRef.current = active
  }, [active])

  // Reset when streaming begins on a fresh message
  const isEmptyText = text.length === 0
  useEffect(() => {
    if (active && isEmptyText) {
      revealedLenRef.current = 0
      fadeStartRef.current = 0
      setRevealedLen(0)
      setFadeStart(0)
    }
  }, [active, isEmptyText])

  // Stable tick function that can be restarted from layout effect
  const tick = useCallback(() => {
    const target = bufferRef.current.length
    const current = revealedLenRef.current

    if (current >= target) {
      rafRef.current = null
      return
    }

    const pending = target - current
    const charsThisFrame =
      pending > CATCHUP_THRESHOLD ? CATCHUP_CHARS_PER_FRAME : BASE_CHARS_PER_FRAME
    const next = Math.min(current + charsThisFrame, target)

    revealedLenRef.current = next
    setRevealedLen(next)
    // eslint-disable-next-line react-hooks/immutability -- tick is stable (useCallback) and self-schedules intentionally
    rafRef.current = requestAnimationFrame(() => tick())
  }, [])

  // rAF rendering loop
  useEffect(() => {
    if (!active) return

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [active, tick])

  // Restart the loop when new text arrives while already active and caught up
  useLayoutEffect(() => {
    if (active && rafRef.current === null && revealedLenRef.current < text.length) {
      rafRef.current = requestAnimationFrame(tick)
    }
  })

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('clickable-link')) {
      e.preventDefault()
      const url = target.getAttribute('data-url')
      if (url) onLinkClick(url)
    }
  }

  // When not streaming, render full text normally (no split)
  if (!active) {
    return (
      <div
        className="clickable-message"
        dangerouslySetInnerHTML={{ __html: replaceLinksWithAnchors(text) }}
        onClick={handleClick}
      />
    )
  }

  const stableText = text.slice(0, fadeStart)
  const fadingText = text.slice(fadeStart, revealedLen)

  return (
    <div className="clickable-message typewriter-container" onClick={handleClick}>
      {stableText ? (
        <span
          className="typewriter-stable"
          dangerouslySetInnerHTML={{ __html: replaceLinksWithAnchors(stableText) }}
        />
      ) : null}
      {fadingText ? (
        <span
          key={`fade-${fadeStart}`}
          className="typewriter-fade"
          dangerouslySetInnerHTML={{ __html: replaceLinksWithAnchors(fadingText) }}
        />
      ) : null}
    </div>
  )
})
