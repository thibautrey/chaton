export function stripSvgComments(svg) {
  // Remove all HTML comments robustly
  // HTML5 comment syntax: <!-- content -->, where content cannot contain -- or start with >
  // Use a more aggressive pattern that removes any <!-- ... --> block completely
  // This handles malformed comments by also removing the opening <!-- if no closing is found
  return svg
    .replace(/<!--[\s\S]*?-->/g, '') // Standard HTML comments
    .replace(/<!--[\s\S]*$/g, ''); // Remove unclosed comments at end of string
}

export function stripSvgEventHandlers(svg) {
  // Remove all event handler attributes (on*) case-insensitively
  // This catches: onclick, onload, onerror, onmouseover, onanimationstart, etc.
  return svg
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    // Also remove any remaining on* attributes that might have unusual spacing
    .replace(/\s+on\w+\b/gi, '');
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
  // Remove all <style> elements entirely (case-insensitive)
  // SVG should not contain style elements - they can be used for CSS injection
  return svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    // Also remove unclosed or malformed style tags
    .replace(/<style\b[^>]*\/?>/gi, '')
    // Remove any remaining <style> patterns (even incomplete ones)
    .replace(/<style[\s\S]*$/gi, '');
}
