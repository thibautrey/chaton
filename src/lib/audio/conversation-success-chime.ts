import successChimeUrl from '@/assets/conversation-success-chime.wav'

let audioNode: HTMLAudioElement | null = null
let lastPlayedAt = 0

function getAudioNode(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') {
    return null
  }

  if (!audioNode) {
    audioNode = new Audio(successChimeUrl)
    audioNode.preload = 'auto'
  }

  return audioNode
}

export async function playConversationSuccessChime(): Promise<void> {
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
    node.currentTime = 0
    node.volume = 0.24
    await node.play()
  } catch {
    // Ignore playback failures caused by browser autoplay policies.
  }
}
