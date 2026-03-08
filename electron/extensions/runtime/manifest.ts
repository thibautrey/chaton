import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_AUTOMATION_DIR, BUILTIN_AUTOMATION_ID, BUILTIN_BROWSER_DIR, BUILTIN_BROWSER_ID, BUILTIN_MEMORY_DIR, BUILTIN_MEMORY_ID, EXTENSIONS_DIR, ICON_EXTENSIONS } from './constants.js'
import { runtimeState } from './state.js'
import type { Capability, ExtensionManifest } from './types.js'

export function normalizeManifest(value: unknown): ExtensionManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.version !== 'string') return null
  const capabilities = Array.isArray(m.capabilities)
    ? m.capabilities.filter((c): c is Capability => typeof c === 'string')
    : []
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    kind: m.kind === 'channel' ? 'channel' : undefined,
    icon: typeof m.icon === 'string' && m.icon.trim().length > 0 ? m.icon.trim() : undefined,
    entrypoints: m.entrypoints && typeof m.entrypoints === 'object' && !Array.isArray(m.entrypoints)
      ? (m.entrypoints as Record<string, string>)
      : undefined,
    ui: m.ui && typeof m.ui === 'object' && !Array.isArray(m.ui)
      ? (m.ui as ExtensionManifest['ui'])
      : undefined,
    capabilities,
    hooks: m.hooks && typeof m.hooks === 'object' && !Array.isArray(m.hooks)
      ? (m.hooks as ExtensionManifest['hooks'])
      : undefined,
    apis: m.apis && typeof m.apis === 'object' && !Array.isArray(m.apis)
      ? (m.apis as ExtensionManifest['apis'])
      : undefined,
    llm: m.llm && typeof m.llm === 'object' && !Array.isArray(m.llm)
      ? (m.llm as ExtensionManifest['llm'])
      : undefined,
    compat: m.compat && typeof m.compat === 'object' && !Array.isArray(m.compat)
      ? (m.compat as ExtensionManifest['compat'])
      : undefined,
    server: m.server && typeof m.server === 'object' && !Array.isArray(m.server)
      ? (m.server as ExtensionManifest['server'])
      : undefined,
  }
}

export function getExtensionRoot(extensionId: string) {
  return runtimeState.extensionRoots.get(extensionId) ?? path.join(EXTENSIONS_DIR, extensionId)
}

export function getExtensionRootCandidates(extensionId: string): string[] {
  return [
    runtimeState.extensionRoots.get(extensionId),
    path.join(EXTENSIONS_DIR, extensionId),
    path.join(EXTENSIONS_DIR, 'extensions', extensionId),
  ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
}

export function readManifestFromExtensionDir(extensionId: string): { manifest: ExtensionManifest; root: string } | null {
  for (const root of getExtensionRootCandidates(extensionId)) {
    const manifestPath = path.join(root, 'chaton.extension.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
      const manifest = normalizeManifest(raw)
      if (manifest) return { manifest, root }
    } catch {
      // ignore invalid manifest candidates and continue searching fallback roots
    }
  }
  return null
}

export function resolveIconFilePath(extensionId: string, iconPath: string): string | null {
  const relative = String(iconPath || '').trim()
  if (!relative) return null
  const rootsToTry = (extensionId === BUILTIN_AUTOMATION_ID || extensionId === BUILTIN_MEMORY_ID || extensionId === BUILTIN_BROWSER_ID)
    ? [
        extensionId === BUILTIN_AUTOMATION_ID ? BUILTIN_AUTOMATION_DIR : extensionId === BUILTIN_MEMORY_ID ? BUILTIN_MEMORY_DIR : BUILTIN_BROWSER_DIR,
        ...getExtensionRootCandidates(extensionId),
      ].filter((value, index, array): value is string => typeof value === 'string' && value.length > 0 && array.indexOf(value) === index)
    : getExtensionRootCandidates(extensionId)

  for (const root of rootsToTry) {
    const candidate = path.resolve(root, relative)
    if (!candidate.startsWith(path.resolve(root))) continue
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export function resolveIconDataUrl(extensionId: string, iconPath: string): string | null {
  const target = resolveIconFilePath(extensionId, iconPath)
  if (!target) return null
  const ext = path.extname(target).toLowerCase()
  const mime = ICON_EXTENSIONS.get(ext)
  if (!mime) return null
  try {
    const data = fs.readFileSync(target)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}
