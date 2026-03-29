export function getSafeReturnTo(value: string, origin = window.location.origin): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const target = new URL(trimmed, origin)
    // Only allow http/https protocols and same origin
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.origin !== origin) {
      return null
    }
    // Sanitize pathname to prevent XSS - only allow safe path characters
    const safePathname = target.pathname.replace(/[^a-zA-Z0-9/_-]/g, encodeURIComponent)
    return `${safePathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}
