/**
 * Comprehensive SVG sanitization utility
 * Removes potentially dangerous elements and attributes to prevent XSS attacks
 */

export function sanitizeSvg(svg) {
  if (!svg || typeof svg !== 'string') return ''
  
  let result = svg
  
  // Phase 1: Remove dangerous elements entirely
  // Remove script tags (standard and malformed)
  result = result.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  result = result.replace(/<script\b[\s\S]*$/gi, '')
  
  // Remove style elements (can contain CSS-based attacks)
  result = result.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  result = result.replace(/<style\b[\s\S]*$/gi, '')
  
  // Remove object, embed, iframe (can load external content)
  result = result.replace(/<object\b[\s\S]*?<\/object>/gi, '')
  result = result.replace(/<embed\b[\s\S]*>/gi, '')
  result = result.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
  result = result.replace(/<frame\b[\s\S]*>/gi, '')
  
  // Remove link tags that can import external CSS
  result = result.replace(/<link\b[\s\S]*>/gi, '')
  
  // Remove use elements that can reference external content
  result = result.replace(/<use\b[\s\S]*>/gi, '')
  
  // Phase 2: Remove all HTML comments (can be used to hide malicious content)
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  result = result.replace(/<!--[\s\S]*$/g, '')
  
  // Phase 3: Remove event handler attributes (on* attributes)
  // This catches all variations: onclick, onerror, onload, onmouseover, etc.
  result = result.replace(/\s+on\w+\s*=/gi, ' ')
  
  // Phase 4: Remove dangerous href attributes
  // Remove javascript:, data:, vbscript: URLs from href
  result = result.replace(/\shref\s*=\s*["']?\s*(javascript|data|vbscript):[^"'\s]*/gi, ' href=""')
  
  // Remove dangerous xlink:href
  result = result.replace(/\sxlink:href\s*=\s*["']?\s*(javascript|data|vbscript):[^"'\s]*/gi, ' xlink:href=""')
  
  // Phase 5: Remove dangerous style attributes
  // Remove style attributes containing url(), expression(), javascript:, behavior:
  result = result.replace(/\sstyle\s*=\s*["'][^"']*(url|expression|javascript|vbscript|behavior):[^"']*["']/gi, '')
  
  // Phase 6: Remove foreignObject (can contain arbitrary HTML)
  result = result.replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
  
  // Phase 7: Remove animate and set elements that can manipulate attributes
  result = result.replace(/<animate\b[\s\S]*?>/gi, '')
  result = result.replace(/<set\b[\s\S]*>/gi, '')
  
  return result
}

/**
 * @deprecated Use sanitizeSvg() instead for comprehensive sanitization
 */
export function stripSvgComments(svg) {
  return sanitizeSvg(svg)
}

/**
 * @deprecated Use sanitizeSvg() instead for comprehensive sanitization
 */
export function stripSvgEventHandlers(svg) {
  return sanitizeSvg(svg)
}

/**
 * @deprecated Use sanitizeSvg() instead for comprehensive sanitization
 */
export function stripDangerousHrefAttributes(svg) {
  return sanitizeSvg(svg)
}

/**
 * @deprecated Use sanitizeSvg() instead for comprehensive sanitization
 */
export function stripDangerousStyleAttributes(svg) {
  return sanitizeSvg(svg)
}

/**
 * @deprecated Use sanitizeSvg() instead for comprehensive sanitization
 */
export function stripDangerousStyleElements(svg) {
  return sanitizeSvg(svg)
}
