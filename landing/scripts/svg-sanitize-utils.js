export function stripSvgComments(svg) {
  return svg.replace(/<!--[\s\S]*?-->/g, '')
}

export function stripSvgEventHandlers(svg) {
  return svg
    .replace(/\s+on[a-z0-9_-]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*[^\s>]+/gi, '')
}

export function stripDangerousHrefAttributes(svg) {
  return svg.replace(
    /\s+(xlink:)?href\s*=\s*("[\t\n\r ]*(?:javascript|data|vbscript)\s*:[^"]*"|'[\t\n\r ]*(?:javascript|data|vbscript)\s*:[^']*'|[^\s>]+)/gi,
    '',
  )
}

export function stripDangerousStyleAttributes(svg) {
  return svg.replace(/\s+style\s*=\s*("[\s\S]*?"|'[\s\S]*?'|[^\s>]+)/gi, (attribute) => {
    const normalized = attribute.toLowerCase()
    if (
      normalized.includes('url(') ||
      normalized.includes('expression(') ||
      normalized.includes('javascript:') ||
      normalized.includes('behavior:')
    ) {
      return ''
    }
    return attribute
  })
}

export function stripDangerousStyleElements(svg) {
  return svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (element) => {
    const normalized = element.toLowerCase()
    if (
      normalized.includes('@import') ||
      normalized.includes('url(') ||
      normalized.includes('expression(') ||
      normalized.includes('javascript:') ||
      normalized.includes('behavior:')
    ) {
      return ''
    }
    return element
  })
}
