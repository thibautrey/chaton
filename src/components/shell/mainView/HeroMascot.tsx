import { useEffect, useRef } from 'react'

import heroCat from '@/assets/chaton-hero.webm'

export function HeroMascot() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const replayTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (replayTimeoutRef.current !== null) {
        window.clearTimeout(replayTimeoutRef.current)
      }
    }
  }, [])

  return (
    <video
      ref={videoRef}
      src={heroCat}
      className="hero-mascot"
      autoPlay
      muted
      playsInline
      aria-label="Chatons"
      onEnded={() => {
        if (replayTimeoutRef.current !== null) {
          window.clearTimeout(replayTimeoutRef.current)
        }
        replayTimeoutRef.current = window.setTimeout(() => {
          const node = videoRef.current
          if (!node) return
          node.currentTime = 0
          void node.play().catch(() => {
            // Ignore autoplay interruptions when the element is paused or unmounted.
          })
        }, 3000)
      }}
    />
  )
}
