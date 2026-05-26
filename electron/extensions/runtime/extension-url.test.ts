import { describe, expect, it } from 'vitest'
import { parseExtensionAssetUrl } from './extension-url.js'

describe('parseExtensionAssetUrl', () => {
  it('parses encoded scoped extension asset URLs', () => {
    expect(parseExtensionAssetUrl('chaton-extension://%40chaton%2Fmemory/dist/react-index.html')).toEqual({
      extensionId: '@chaton/memory',
      relativePath: 'dist/react-index.html',
    })
  })

  it('parses existing unencoded scoped manifest URLs', () => {
    expect(parseExtensionAssetUrl('chaton-extension://@chaton/automation/dist/react-index.html')).toEqual({
      extensionId: '@chaton/automation',
      relativePath: 'dist/react-index.html',
    })
  })

  it('parses unscoped extension asset URLs', () => {
    expect(parseExtensionAssetUrl('chaton-extension://local-extension/dist/index.html')).toEqual({
      extensionId: 'local-extension',
      relativePath: 'dist/index.html',
    })
  })

  it('rejects unsupported schemes missing paths and traversal extension ids', () => {
    expect(parseExtensionAssetUrl('https://example.com/index.html')).toBeNull()
    expect(parseExtensionAssetUrl('chaton-extension://@chaton/automation/')).toBeNull()
    expect(parseExtensionAssetUrl('chaton-extension://..%2Foutside/dist/index.html')).toBeNull()
    expect(parseExtensionAssetUrl('chaton-extension://@chaton/..%2Foutside/dist/index.html')).toBeNull()
  })
})
