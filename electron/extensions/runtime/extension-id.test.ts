import { describe, expect, it } from 'vitest'
import { normalizeExtensionId } from './extension-id.js'

describe('normalizeExtensionId', () => {
  it('accepts unscoped and scoped extension ids', () => {
    expect(normalizeExtensionId('plain-extension')).toBe('plain-extension')
    expect(normalizeExtensionId('@chaton/automation')).toBe('@chaton/automation')
  })

  it('trims extension ids', () => {
    expect(normalizeExtensionId('  @chaton/memory  ')).toBe('@chaton/memory')
  })

  it('rejects path traversal and malformed scoped ids', () => {
    expect(normalizeExtensionId('../outside')).toBeNull()
    expect(normalizeExtensionId('@chaton/../outside')).toBeNull()
    expect(normalizeExtensionId('@chaton')).toBeNull()
    expect(normalizeExtensionId('@chaton/')).toBeNull()
    expect(normalizeExtensionId('scope/package/extra')).toBeNull()
    expect(normalizeExtensionId('bad\\path')).toBeNull()
  })
})
