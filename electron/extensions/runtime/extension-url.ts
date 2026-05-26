import { normalizeExtensionId } from './extension-id.js'

const EXTENSION_URL_PREFIX = 'chaton-extension://'

export function parseExtensionAssetUrl(rawUrl: string): { extensionId: string; relativePath: string } | null {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith(EXTENSION_URL_PREFIX)) return null
  const withoutScheme = rawUrl.slice(EXTENSION_URL_PREFIX.length)
  const withoutFragment = withoutScheme.split('#', 1)[0]
  const withoutQuery = withoutFragment.split('?', 1)[0]
  const slashIndex = withoutQuery.indexOf('/')
  if (slashIndex <= 0) return null

  let rawExtensionId = withoutQuery.slice(0, slashIndex)
  let relativePath = withoutQuery.slice(slashIndex + 1)

  if (rawExtensionId.startsWith('@')) {
    const nestedSlashIndex = relativePath.indexOf('/')
    if (nestedSlashIndex <= 0) return null
    rawExtensionId = `${rawExtensionId}/${relativePath.slice(0, nestedSlashIndex)}`
    relativePath = relativePath.slice(nestedSlashIndex + 1)
  }

  let extensionId: string
  try {
    extensionId = decodeURIComponent(rawExtensionId)
    relativePath = decodeURIComponent(relativePath)
  } catch {
    return null
  }

  const normalizedExtensionId = normalizeExtensionId(extensionId)
  if (!normalizedExtensionId || !relativePath) return null
  return { extensionId: normalizedExtensionId, relativePath }
}
