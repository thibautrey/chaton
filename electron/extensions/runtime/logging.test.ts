import { describe, expect, it } from 'vitest'
import { extensionLogFileSafeId } from './logging.js'

describe('extensionLogFileSafeId', () => {
  it('preserves a readable prefix and appends a stable digest', () => {
    const value = extensionLogFileSafeId('@chaton/browser')

    expect(value).toMatch(/^chaton_browser-[a-f0-9]{10}$/)
    expect(extensionLogFileSafeId('@chaton/browser')).toBe(value)
  })

  it('does not return an empty basename for punctuation-only ids', () => {
    expect(extensionLogFileSafeId('!!!')).toMatch(/^extension-[a-f0-9]{10}$/)
  })

  it('avoids collisions for ids with the same sanitized readable part', () => {
    expect(extensionLogFileSafeId('@scope/name')).not.toBe(extensionLogFileSafeId('@scope_name'))
  })
})
