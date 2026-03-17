/**
 * Demo component to show how MessageAttachments works
 * This is for development/testing purposes only
 */

import { MessageAttachments, parseAttachmentsFromText, removeAttachmentText } from './MessageAttachments'

export function MessageAttachmentsDemo() {
  // Example message with attachments as it would appear in the conversation
  const exampleMessage = `The layout is broken when the email preview is displayed, there is some space on its right that is not used, look for yourself at the screenshot I have attached

--- Pièce jointe 1 ---
Nom: Capture d’écran 2026-03-17 à 12.28.39.png
Type: image/png
Taille: 478.9 KB
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==

This is another file I want to share

--- Pièce jointe 2 ---
Nom: document.pdf
Type: application/pdf
Taille: 2.3 MB`

  const attachments = parseAttachmentsFromText(exampleMessage)
  const cleanedMessage = removeAttachmentText(exampleMessage)

  return (
    <div className="demo-container">
      <h3>Message Attachments Demo</h3>

      <div className="demo-section">
        <h4>Original Message Text:</h4>
        <pre className="demo-text">{exampleMessage}</pre>
      </div>

      <div className="demo-section">
        <h4>Cleaned Message Text (without attachment blocks):</h4>
        <pre className="demo-text">{cleanedMessage}</pre>
      </div>

      <div className="demo-section">
        <h4>Parsed Attachments:</h4>
        <MessageAttachments attachments={attachments} />
      </div>

      <div className="demo-section">
        <h4>How it would render in conversation:</h4>
        <div className="demo-conversation">
          <div className="demo-message-text">
            {cleanedMessage.split('\n').map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
          <MessageAttachments attachments={attachments} />
        </div>
      </div>
    </div>
  )
}
