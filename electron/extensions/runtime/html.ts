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

    appendExtensionLog(extensionId, 'info', 'script_inlining.start', {
      targetPath,
      baseDir,
    })

    // Inline scripts - CRITICAL: scripts MUST be inlined or they won't load from srcDoc
    html = html.replace(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, srcRaw: string) => {
      const src = String(srcRaw || '')
      appendExtensionLog(extensionId, 'info', 'script_inlining.found', { src })
      
      // Skip external URLs
      if (/^https?:\/\//i.test(src) || src.startsWith('data:')) {
        appendExtensionLog(extensionId, 'info', 'script_inlining.skip_external', { src })
        return match
      }
      
      const scriptPath = path.resolve(baseDir, src)
      const fileExists = fs.existsSync(scriptPath)
      const isValid = scriptPath.startsWith(path.resolve(baseDir)) && fileExists
      
      appendExtensionLog(extensionId, 'info', 'script_inlining.resolve', {
        src,
        scriptPath,
        baseDir: path.resolve(baseDir),
        isValid,
      })
      
      if (!isValid) {
        // Critical: if we can't inline, the script will fail to load from srcDoc
        appendExtensionLog(extensionId, 'warn', 'script_inlining.failed', { src, scriptPath, fileExists })
        return `<!-- ERROR: Could not inline script: ${src} -->`
      }
      
      const content = fs.readFileSync(scriptPath, 'utf8')
      appendExtensionLog(extensionId, 'info', 'script_inlining.success', {
        src,
        contentLength: content.length,
      })
      return `<script>\n${content}\n</script>`
    })

    // Inline stylesheets
    html = html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, hrefRaw: string) => {
      const href = String(hrefRaw || '')
      if (/^https?:\/\//i.test(href) || href.startsWith('data:')) {
        return match
      }
      const cssPath = path.resolve(baseDir, href)
      if (!cssPath.startsWith(path.resolve(baseDir)) || !fs.existsSync(cssPath)) {
        return `<!-- Stylesheet not found: ${href} -->`
      }
      const content = fs.readFileSync(cssPath, 'utf8')
      return `<style>\n${content}\n</style>`
    })

    // Inject UI bridge script
    const escapedBridge = EXTENSION_UI_BRIDGE_SCRIPT.replace(/<\/script/gi, '<\\/script')

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (matchTag) => `${matchTag}\n<script>\n${escapedBridge}\n</script>`)
    } else {
      html = `<script>\n${escapedBridge}\n</script>\n${html}`
    }

    return { ok: true, html }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
