import type { ReactNode } from 'react'

type MessageAttachmentProps = {
  attachments: Array<{
    name: string
    type: string
    size: string
    isImage: boolean
    imageData?: string
    imageMimeType?: string
  }>
}

export function MessageAttachments({ attachments }: MessageAttachmentProps): ReactNode {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="message-attachments">
      {attachments.map((attachment, index) => (
        attachment.isImage && attachment.imageData && attachment.imageMimeType ? (
          <div key={index} className="message-image-preview">
            <img
              className="message-image-preview-thumb"
              src={`data:${attachment.imageMimeType};base64,${attachment.imageData}`}
              alt={attachment.name}
            />
            <div className="message-image-preview-meta">
              <span className="message-image-preview-name">{attachment.name}</span>
              <span className="message-image-preview-size">{attachment.size}</span>
            </div>
          </div>
        ) : (
          <div key={index} className="message-attachment-chip">
            <span className="message-attachment-chip-label">
              📎 {attachment.name} ({attachment.type}, {attachment.size})
            </span>
          </div>
        )
      ))}
    </div>
  )
}

// Parse attachment text format from message content
// Example format:
// --- Pièce jointe 1 ---
// Nom: filename.png
// Type: image/png
// Taille: 478.9 KB
// [optional base64 data for images]
// Remove attachment text blocks from message content
export function removeAttachmentText(text: string): string {
  return text.replace(/--- Pièce jointe \d+ ---[\s\S]*?(?=\n--- Pièce jointe \d+ ---|$)/g, '').trim()
}

export function parseAttachmentsFromText(text: string): MessageAttachmentProps['attachments'] {
  const attachmentRegex = /--- Pièce jointe \d+ ---\nNom: (.+?)\nType: (.+?)\nTaille: (.+?)(?:\n([\s\S]*?))?(?=\n--- Pièce jointe \d+ ---|$)/g
  const matches = [...text.matchAll(attachmentRegex)]
  const attachments: MessageAttachmentProps['attachments'] = []

  for (const match of matches) {
    const [, name, type, size, rest] = match
    
    if (!name || !type || !size) continue

    const isImage = type.startsWith('image/')
    let imageData: string | undefined
    let imageMimeType: string | undefined

    if (isImage && rest && rest.trim()) {
      // Clean up the data - remove any extra whitespace and newlines
      const cleanedData = rest.trim()
      
      if (cleanedData.startsWith('data:')) {
        // It's a data URL
        const dataUrlMatch = cleanedData.match(/^data:(.+?);base64,(.+)$/)
        if (dataUrlMatch) {
          imageMimeType = dataUrlMatch[1]
          imageData = dataUrlMatch[2]
        }
      } else if (cleanedData.match(/^[A-Za-z0-9+/=]+$/)) {
        // It's raw base64
        imageData = cleanedData
        imageMimeType = type
      }
    }

    attachments.push({
      name: name.trim(),
      type: type.trim(),
      size: size.trim(),
      isImage,
      imageData,
      imageMimeType
    })
  }

  return attachments
}

// Check if text contains attachment patterns
export function hasAttachments(text: string): boolean {
  return /--- Pièce jointe \d+ ---/.test(text)
}
