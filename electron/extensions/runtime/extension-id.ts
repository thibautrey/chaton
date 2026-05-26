export function normalizeExtensionId(input: string): string | null {
  if (typeof input !== 'string') return null
  const extensionId = input.trim()
  if (!extensionId || extensionId.includes('\0') || extensionId.includes('\\')) return null

  const parts = extensionId.split('/')
  if (extensionId.startsWith('@')) {
    if (parts.length !== 2) return null
    if (!parts[0].slice(1) || !parts[1]) return null
  } else if (parts.length !== 1) {
    return null
  }

  if (parts.some((part) => !part || part === '.' || part === '..')) return null
  return extensionId
}

export function isValidExtensionId(input: string): boolean {
  return normalizeExtensionId(input) !== null
}
