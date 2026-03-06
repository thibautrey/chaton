import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID, EXTENSIONS_DIR } from './constants.js'
import { appendExtensionLog } from './logging.js'
import { getExtensionRootCandidates } from './manifest.js'
import { listExtensionManifests } from './registry.js'
import { ensureExtensionServerStarted } from './server.js'
import { EXTENSION_UI_BRIDGE_SCRIPT } from './ui-bridge.js'

export function getExtensionMainViewHtml(viewId: string): { ok: true; html: string } | { ok: false; message: string } {
  const manifests = listExtensionManifests()
  const match = manifests
    .flatMap((manifest) =>
      (manifest.ui?.mainViews ?? []).map((mainView) => ({
        extensionId: manifest.id,
        mainView,
      })),
    )
    .find((item) => item.mainView.viewId === viewId)

  if (!match) {
    appendExtensionLog('extensions-runtime', 'warn', 'main_view.lookup.failed', { viewId })
    return { ok: false, message: `main view not found: ${viewId}` }
  }

  appendExtensionLog(match.extensionId, 'info', 'main_view.lookup.ok', {
    viewId,
    webviewUrl: match.mainView.webviewUrl,
  })

  const webviewUrl = match.mainView.webviewUrl
  if (!webviewUrl.startsWith('chaton-extension://')) {
    return { ok: false, message: `unsupported webviewUrl: ${webviewUrl}` }
  }

  void ensureExtensionServerStarted(match.extensionId)

  const withoutScheme = webviewUrl.slice('chaton-extension://'.length)
  const expectedPrefix = `${match.extensionId}/`
  let relativePath = withoutScheme
  if (withoutScheme.startsWith(expectedPrefix)) {
    relativePath = withoutScheme.slice(expectedPrefix.length)
  }
  const extensionId = match.extensionId
  const rootsToTry = (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID)
    ? [
        extensionId === BUILTIN_AUTOMATION_ID ? BUILTIN_AUTOMATION_DIR : BUILTIN_MEMORY_DIR,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

  let targetPath: string | null = null
  for (const root of rootsToTry) {
    const candidate = path.resolve(root, relativePath)
    if (!candidate.startsWith(path.resolve(root))) {
      continue
    }
    if (fs.existsSync(candidate)) {
      targetPath = candidate
      break
    }
  }
  if (!targetPath) {
    const primaryRoot = rootsToTry[0] ?? path.join(EXTENSIONS_DIR, extensionId)
    appendExtensionLog(extensionId, 'warn', 'main_view.file.missing', {
      viewId,
      relativePath,
      rootsToTry,
      primaryRoot,
    })
    return { ok: false, message: `view file not found: ${path.resolve(primaryRoot, relativePath)}` }
  }

  appendExtensionLog(extensionId, 'info', 'main_view.file.resolved', {
    viewId,
    relativePath,
    targetPath,
    rootsToTry,
  })

  try {
    let html = fs.readFileSync(targetPath, 'utf8')
    const baseDir = path.dirname(targetPath)

    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, srcRaw: string) => {
      const src = String(srcRaw || '')
      if (/^https?:\/\//i.test(src) || src.startsWith('data:')) {
        return match
      }
      const scriptPath = path.resolve(baseDir, src)
      if (!scriptPath.startsWith(path.resolve(baseDir)) || !fs.existsSync(scriptPath)) {
        return match
      }
      const content = fs.readFileSync(scriptPath, 'utf8')
      return `<script>\n${content}\n</script>`
    })

    html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, hrefRaw: string) => {
      const href = String(hrefRaw || '')
      if (/^https?:\/\//i.test(href) || href.startsWith('data:')) {
        return match
      }
      const cssPath = path.resolve(baseDir, href)
      if (!cssPath.startsWith(path.resolve(baseDir)) || !fs.existsSync(cssPath)) {
        return match
      }
      const content = fs.readFileSync(cssPath, 'utf8')
      return `<style>\n${content}\n</style>`
    })

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (matchTag) => `${matchTag}\n<script>\n${EXTENSION_UI_BRIDGE_SCRIPT}\n</script>`)
    } else {
      html = `<script>\n${EXTENSION_UI_BRIDGE_SCRIPT}\n</script>\n${html}`
    }

    return { ok: true, html }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
