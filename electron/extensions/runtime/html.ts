import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_DIR, BUILTIN_BROWSER_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID, BUILTIN_TPS_MONITOR_DIR, BUILTIN_TPS_MONITOR_ID, EXTENSIONS_DIR } from './constants.js'
import { appendExtensionLog } from './logging.js'
import { getExtensionRootCandidates } from './manifest.js'
import { isPathInsideRoot } from './path-safety.js'
import { parseExtensionAssetUrl } from './extension-url.js'
import { listExtensionManifests } from './registry.js'
import { ensureExtensionServerStarted } from './server.js'

const ATTRIBUTE_URL_PATTERN = /\b(src|href)=(['"])([^'"]+)\2/gi
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i
const EXTENSION_UI_BRIDGE_ASSET_NAME = '__chaton-ui-bridge.js'
export const EXTENSION_UI_BRIDGE_ASSET_PATH = EXTENSION_UI_BRIDGE_ASSET_NAME

function shouldRewriteAssetUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
    return false
  }
  if (URL_SCHEME_PATTERN.test(trimmed)) {
    return false
  }
  return true
}

function joinExtensionAssetUrl(baseUrl: string, extensionRootUrl: string, value: string): string {
  if (value.startsWith('/')) {
    return `${extensionRootUrl}${value.replace(/^\/+/, '')}`
  }
  return `${baseUrl}${value.replace(/^\.\//, '')}`
}

export function rewriteSrcDocAssetUrls(html: string, baseUrl: string, extensionRootUrl: string): string {
  return html.replace(ATTRIBUTE_URL_PATTERN, (match, attribute: string, quote: string, value: string) => {
    if (!shouldRewriteAssetUrl(value)) {
      return match
    }
    return `${attribute}=${quote}${joinExtensionAssetUrl(baseUrl, extensionRootUrl, value)}${quote}`
  })
}

function buildBridgeScriptTag(extensionRootUrl: string): string {
  return `<script src="${extensionRootUrl}${EXTENSION_UI_BRIDGE_ASSET_NAME}"></script>`
}

export function injectSrcDocRuntimeScaffold(html: string, baseUrl: string, extensionRootUrl: string): string {
  const baseTag = `<base href="${baseUrl}">`
  const bridgeScriptTag = buildBridgeScriptTag(extensionRootUrl)
  const rewrittenHtml = rewriteSrcDocAssetUrls(html, baseUrl, extensionRootUrl)

  if (/<head[^>]*>/i.test(rewrittenHtml)) {
    return rewrittenHtml.replace(/<head[^>]*>/i, (matchTag) => `${matchTag}\n${baseTag}\n${bridgeScriptTag}`)
  }
  return `${baseTag}\n${bridgeScriptTag}\n${rewrittenHtml}`
}

export function getExtensionMainViewHtml(viewId: string): { ok: true; html: string; baseUrl: string } | { ok: false; message: string } {
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

  const parsedAssetUrl = parseExtensionAssetUrl(webviewUrl)
  if (!parsedAssetUrl) {
    return { ok: false, message: `malformed webviewUrl: ${webviewUrl}` }
  }
  if (parsedAssetUrl.extensionId !== match.extensionId) {
    return { ok: false, message: `webviewUrl extension id mismatch: ${webviewUrl}` }
  }
  const relativePath = parsedAssetUrl.relativePath
  const extensionId = match.extensionId
  function getBuiltinDirForExtension(id: string): string | null {
    if (id === BUILTIN_AUTOMATION_ID) return BUILTIN_AUTOMATION_DIR
    if (id === BUILTIN_MEMORY_ID) return BUILTIN_MEMORY_DIR
    if (id === BUILTIN_BROWSER_ID) return BUILTIN_BROWSER_DIR
    if (id === BUILTIN_TPS_MONITOR_ID) return BUILTIN_TPS_MONITOR_DIR
    return null
  }

  const builtinDir = getBuiltinDirForExtension(extensionId)
  const rootsToTry = builtinDir
    ? [
        builtinDir,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

  let targetPath: string | null = null
  for (const root of rootsToTry) {
    const candidate = path.resolve(root, relativePath)
    if (!isPathInsideRoot(root, candidate)) {
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
    const pathPart = relativePath
    const basePath = path.posix.dirname(`/${pathPart}`)
    const baseUrl = `chaton-extension://${encodeURIComponent(extensionId)}${basePath === '/' ? '/' : `${basePath}/`}`
    const extensionRootUrl = `chaton-extension://${encodeURIComponent(extensionId)}/`

    appendExtensionLog(extensionId, 'info', 'script_inlining.start', {
      targetPath,
      baseUrl,
    })

    html = injectSrcDocRuntimeScaffold(html, baseUrl, extensionRootUrl)

    return { ok: true, html, baseUrl }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
