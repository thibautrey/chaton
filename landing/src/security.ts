export function getSafeReturnTo(value: string, origin = window.location.origin): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  try {
    const target = new URL(trimmed, origin)
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.origin !== origin) {
      return null
    }
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}
