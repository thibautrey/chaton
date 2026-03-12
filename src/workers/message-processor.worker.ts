/**
 * Message Processing Web Worker
 * Offloads heavy computation from main thread
 * 
 * Handles:
 * - Message parsing and metadata extraction
 * - Markdown processing
 * - Syntax highlighting
 * - Tool block parsing
 */

interface WorkerMessage {
  id: string
  type: 'parse-message' | 'highlight-code' | 'parse-markdown'
  data: any
}

interface WorkerResponse {
  id: string
  type: string
  data: any
  error?: string
}

/**
 * Parse message metadata without main thread
 */
function parseMessage(msg: any): any {
  return {
    id: msg.id,
    role: msg.role,
    timestamp: msg.timestamp,
    hasTools: Boolean(msg.toolBlocks?.length),
    hasMeta: Boolean(msg.meta),
    contentLength: msg.content?.length || 0,
  }
}

/**
 * Highlight code syntax (simple version)
 * In production, would integrate Prism or Shiki
 */
function highlightCode(code: string, language: string = 'javascript'): string {
  // This is a stub - in real implementation, would use highlight.js or similar
  // For now, just wrap in span with language class
  return `<pre class="hljs language-${language}">${escapeHtml(code)}</pre>`
}

/**
 * Basic HTML escaping
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * Parse markdown (simple version)
 * In production, would use remark or similar
 */
function parseMarkdown(markdown: string): any {
  const lines = markdown.split('\n')
  const result = {
    headings: [] as Array<{ level: number; text: string }>,
    codeBlocks: [] as string[],
    links: [] as string[],
    parsed: true,
  }

  let inCodeBlock = false
  let currentCode = ''

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.codeBlocks.push(currentCode)
        currentCode = ''
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
    } else if (inCodeBlock) {
      currentCode += line + '\n'
    } else if (line.match(/^#+\s/)) {
      const level = line.match(/^#+/)?.[0].length || 1
      const text = line.replace(/^#+\s/, '')
      result.headings.push({ level, text })
    } else if (line.match(/\[.+\]\(.+\)/)) {
      const matches = line.match(/\[(.+?)\]\((.+?)\)/g) || []
      result.links.push(...matches)
    }
  }

  return result
}

/**
 * Main worker message handler
 */
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data
  let response: WorkerResponse = { id, type, data: null }

  try {
    switch (type) {
      case 'parse-message':
        response.data = parseMessage(data)
        break

      case 'highlight-code':
        response.data = highlightCode(data.code, data.language)
        break

      case 'parse-markdown':
        response.data = parseMarkdown(data)
        break

      default:
        response.error = `Unknown message type: ${type}`
    }
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error)
  }

  self.postMessage(response)
}

export {}
