import { describe, expect, it } from 'vitest'

import { getExtensionIcon, getStaticExtensionIconBaseUrl } from './extension-icons'

describe('getExtensionIcon', () => {
  it('preserves a relative Vite base URL for file:// production loads', () => {
    expect(getStaticExtensionIconBaseUrl('./')).toBe('./')
  })

  it('preserves an absolute Vite base URL for dev server loads', () => {
    expect(getStaticExtensionIconBaseUrl('/')).toBe('/')
  })

  it('uses only known bundled static extension icon files', () => {
    const icon = getExtensionIcon(null, '@thibautrey/chatons-channel-telegram')

    expect(icon).toEqual({
      kind: 'image',
      src: '/extension-icons/@thibautrey-chatons-channel-telegram.png',
      fallbacks: [],
    })
  })

  it('falls back to a local svg icon without probing missing static files', () => {
    const icon = getExtensionIcon(null, '@vendor/example-extension')

    expect(icon.kind).toBe('svg')
  })
})
