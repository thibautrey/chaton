import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXTENSION_UI_BRIDGE_ASSET_PATH, rewriteSrcDocAssetUrls, injectSrcDocRuntimeScaffold } from './html.js'

let tempRoots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('rewriteSrcDocAssetUrls', () => {
  it('rewrites relative and root-relative srcdoc assets to chaton-extension URLs', () => {
    const html = [
      '<link rel="stylesheet" href="style.css">',
      '<script src="./app.js"></script>',
      '<img src="/icons/icon.png">',
      '<a href="#local">local</a>',
      '<script src="https://cdn.example/app.js"></script>',
    ].join('')

    const rewritten = rewriteSrcDocAssetUrls(
      html,
      'chaton-extension://%40scope%2Fextension/views/',
      'chaton-extension://%40scope%2Fextension/',
    )

    expect(rewritten).toContain('href="chaton-extension://%40scope%2Fextension/views/style.css"')
    expect(rewritten).toContain('src="chaton-extension://%40scope%2Fextension/views/app.js"')
    expect(rewritten).toContain('src="chaton-extension://%40scope%2Fextension/icons/icon.png"')
    expect(rewritten).toContain('href="#local"')
    expect(rewritten).toContain('src="https://cdn.example/app.js"')
  })
})

describe('injectSrcDocRuntimeScaffold', () => {
  it('injects the extension base and protocol-served bridge without an inline Chatons script', () => {
    const html = '<html><head><title>View</title></head><body><div id="app"></div></body></html>'

    const injected = injectSrcDocRuntimeScaffold(
      html,
      'chaton-extension://%40scope%2Fextension/views/',
      'chaton-extension://%40scope%2Fextension/',
    )

    expect(injected).toContain('<base href="chaton-extension://%40scope%2Fextension/views/">')
    expect(injected).toContain(`<script src="chaton-extension://%40scope%2Fextension/${EXTENSION_UI_BRIDGE_ASSET_PATH}"></script>`)
    expect(injected).not.toContain('window.chatonUi = Object.assign')
  })
})

describe('getExtensionMainViewHtml', () => {
  it('loads encoded scoped chaton-extension URLs from the registered extension root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chaton-html-test-'))
    tempRoots.push(root)
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(root, 'dist', 'react-index.html'), '<html><head></head><body>Memory</body></html>')

    const state = await import('./state.js')
    state.runtimeState.manifests.set('@chaton/memory-test', {
      id: '@chaton/memory-test',
      name: 'Memory Test',
      version: '1.0.0',
      capabilities: ['ui.mainView'],
      ui: {
        mainViews: [{
          viewId: 'memory-test.main',
          title: 'Memory Test',
          webviewUrl: 'chaton-extension://%40chaton%2Fmemory-test/dist/react-index.html',
        }],
      },
    })
    state.runtimeState.extensionRoots.set('@chaton/memory-test', root)

    const { getExtensionMainViewHtml } = await import('./html.js')
    const result = getExtensionMainViewHtml('memory-test.main')

    expect(result.ok).toBe(true)
    expect(result.ok ? result.html : '').toContain('Memory')
    expect(result.ok ? result.baseUrl : '').toBe('chaton-extension://%40chaton%2Fmemory-test/dist/')
  })

  it('rejects malformed chaton-extension main view URLs', async () => {
    const state = await import('./state.js')
    state.runtimeState.manifests.set('@chaton/broken-test', {
      id: '@chaton/broken-test',
      name: 'Broken Test',
      version: '1.0.0',
      capabilities: ['ui.mainView'],
      ui: {
        mainViews: [{
          viewId: 'broken-test.main',
          title: 'Broken Test',
          webviewUrl: 'chaton-extension://@chaton/broken-test/',
        }],
      },
    })

    const { getExtensionMainViewHtml } = await import('./html.js')
    const result = getExtensionMainViewHtml('broken-test.main')

    expect(result).toEqual({
      ok: false,
      message: 'malformed webviewUrl: chaton-extension://@chaton/broken-test/',
    })
  })
})
