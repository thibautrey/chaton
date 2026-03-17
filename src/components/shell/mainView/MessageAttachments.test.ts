import { parseAttachmentsFromText, hasAttachments, removeAttachmentText } from './MessageAttachments'

describe('MessageAttachments', () => {
  describe('hasAttachments', () => {
    it('should return true when text contains attachment patterns', () => {
      const text = 'Check this out --- Pièce jointe 1 ---\nNom: test.png\nType: image/png\nTaille: 100 KB'
      expect(hasAttachments(text)).toBe(true)
    })

    it('should return false when text does not contain attachment patterns', () => {
      const text = 'This is a regular message without attachments'
      expect(hasAttachments(text)).toBe(false)
    })

    it('should remove attachment text from message', () => {
      const text = 'Check this out --- Pièce jointe 1 ---\nNom: test.png\nType: image/png\nTaille: 100 KB\nThis is the rest of the message'
      const cleaned = removeAttachmentText(text)
      expect(cleaned).toBe('Check this out This is the rest of the message')
    })
  })

  describe('parseAttachmentsFromText', () => {
    it('should parse image attachments correctly', () => {
      const text = 'Check this screenshot --- Pièce jointe 1 ---\nNom: screenshot.png\nType: image/png\nTaille: 478.9 KB\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA'
      
      const attachments = parseAttachmentsFromText(text)
      expect(attachments.length).toBe(1)
      expect(attachments[0]).toEqual({
        name: 'screenshot.png',
        type: 'image/png',
        size: '478.9 KB',
        isImage: true,
        imageData: 'iVBORw0KGgoAAAANSUhEUgAA',
        imageMimeType: 'image/png'
      })
    })

    it('should parse file attachments correctly', () => {
      const text = 'Here is the document --- Pièce jointe 1 ---\nNom: document.pdf\nType: application/pdf\nTaille: 2.3 MB'
      
      const attachments = parseAttachmentsFromText(text)
      expect(attachments.length).toBe(1)
      expect(attachments[0]).toEqual({
        name: 'document.pdf',
        type: 'application/pdf',
        size: '2.3 MB',
        isImage: false,
        imageData: undefined,
        imageMimeType: undefined
      })
    })

    it('should parse multiple attachments', () => {
      const text = 'Multiple files --- Pièce jointe 1 ---\nNom: image1.jpg\nType: image/jpeg\nTaille: 100 KB\n--- Pièce jointe 2 ---\nNom: document.txt\nType: text/plain\nTaille: 5 KB'
      
      const attachments = parseAttachmentsFromText(text)
      expect(attachments.length).toBe(2)
      expect(attachments[0].name).toBe('image1.jpg')
      expect(attachments[1].name).toBe('document.txt')
    })

    it('should return empty array when no attachments found', () => {
      const text = 'Regular message without attachments'
      const attachments = parseAttachmentsFromText(text)
      expect(attachments.length).toBe(0)
    })
  })
})
