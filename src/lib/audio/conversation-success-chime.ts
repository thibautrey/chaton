import successChimeUrl from '@/assets/conversation-success-chime.wav'

let audioNode: HTMLAudioElement | null = null
let audioWarmupPromise: Promise<void> | null = null
let lastPlayedAt = 0

function getAudioNode(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') {
    return null
  }

  if (!audioNode) {
    audioNode = new Audio(successChimeUrl)
    audioNode.preload = 'auto'
    audioNode.volume = 0.24
  }

  return audioNode
}

export function warmConversationSuccessChime(): void {
  const node = getAudioNode()
  if (!node || audioWarmupPromise) {
    return
  }

  audioWarmupPromise = Promise.resolve()
    .then(() => {
      try {
        node.load()
      } catch {
        // Ignore eager warmup failures; regular playback can still work later.
      }
    })
    .finally(() => {
      audioWarmupPromise = null
    })
}

export async function playConversationSuccessChime(enabled: boolean = true): Promise<void> {
  if (!enabled) {
    return
  }

  const now = Date.now()
  if (now - lastPlayedAt < 1500) {
    return
  }

  const node = getAudioNode()
  if (!node) {
    return
  }

  lastPlayedAt = now

  try {
    node.pause()
    if (node.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      try {
        node.load()
      } catch {
        // Ignore and let play() decide whether the resource is usable.
      }
    }
    node.currentTime = 0
    node.volume = 0.24
    await node.play()
  } catch {
    // Ignore playback failures caused by browser autoplay policies.
  }
}
