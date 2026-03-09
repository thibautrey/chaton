import { sanitizePiToolName } from './helpers.js'
import { PI_TOOL_NAME_PATTERN } from './constants.js'
import type { ExposedExtensionToolDefinition, ExtensionManifest, ExtensionLlmToolManifest } from './types.js'

export type ToolCatalogEntry = {
  name: string
  label: string
  description: string
  source: 'builtin' | 'extension' | 'developer'
  extensionId?: string
  extensionName?: string
  manifestName?: string
  aliases?: string[]
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters?: Record<string, unknown>
  catalogGroup?: string
  catalogGroupLabel?: string
  catalogGroupDescription?: string
  catalogGroupPriority?: number
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveCatalogToolName(extensionId: string, manifestToolName: string, usedNames: Set<string>) {
  const raw = String(manifestToolName || '').trim()
  const directlyUsable = PI_TOOL_NAME_PATTERN.test(raw)
  const base = directlyUsable
    ? raw
    : sanitizePiToolName(`${sanitizePiToolName(extensionId)}_${sanitizePiToolName(raw)}`) || 'extension_tool'

  let resolved = base
  let suffix = 2
  while (usedNames.has(resolved)) {
    resolved = `${base}_${suffix}`
    suffix += 1
  }
  usedNames.add(resolved)

  return resolved
}

function manifestToolToCatalogEntry(
  manifest: ExtensionManifest,
  tool: ExtensionLlmToolManifest,
  usedNames: Set<string>,
): ToolCatalogEntry | null {
  const manifestName = normalizeText(tool.name)
  const description = normalizeText(tool.description)
  if (!manifestName || !description) return null

  const name = resolveCatalogToolName(manifest.id, manifestName, usedNames)
  const aliases = manifestName !== name ? [manifestName] : undefined

  return {
    name,
    label: normalizeText(tool.label) ?? manifestName,
    description,
    source: manifest.id.startsWith('@chaton/') ? 'builtin' : 'extension',
    extensionId: manifest.id,
    extensionName: manifest.name,
    manifestName,
    aliases,
    promptSnippet: normalizeText(tool.promptSnippet),
    promptGuidelines: Array.isArray(tool.promptGuidelines)
      ? tool.promptGuidelines.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : undefined,
    parameters: tool.parameters,
    catalogGroup: normalizeText(tool.catalogGroup),
    catalogGroupLabel: normalizeText(tool.catalogGroupLabel),
    catalogGroupDescription: normalizeText(tool.catalogGroupDescription),
    catalogGroupPriority: typeof tool.catalogGroupPriority === 'number' ? tool.catalogGroupPriority : undefined,
  }
}

function exposedToolToCatalogEntry(tool: ExposedExtensionToolDefinition): ToolCatalogEntry {
  const aliases = typeof tool.originalName === 'string' && tool.originalName.trim() && tool.originalName !== tool.name
    ? [tool.originalName.trim()]
    : undefined

  return {
    name: tool.name,
    label: normalizeText(tool.label) ?? tool.name,
    description: normalizeText(tool.description) ?? tool.name,
    source: tool.extensionId.startsWith('@chaton/') ? 'builtin' : 'extension',
    extensionId: tool.extensionId,
    manifestName: typeof tool.originalName === 'string' ? tool.originalName : undefined,
    aliases,
    promptSnippet: normalizeText(tool.promptSnippet),
    promptGuidelines: Array.isArray(tool.promptGuidelines)
      ? tool.promptGuidelines.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : undefined,
    parameters: tool.parameters as Record<string, unknown> | undefined,
  }
}

function scoreEntry(entry: ToolCatalogEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const name = entry.name.toLowerCase()
  const label = entry.label.toLowerCase()
  const description = entry.description.toLowerCase()
  const snippet = (entry.promptSnippet ?? '').toLowerCase()
  const guidelines = (entry.promptGuidelines ?? []).join(' ').toLowerCase()
  const group = (entry.catalogGroup ?? '').toLowerCase()
  const groupLabel = (entry.catalogGroupLabel ?? '').toLowerCase()
  const groupDescription = (entry.catalogGroupDescription ?? '').toLowerCase()
  const manifestName = (entry.manifestName ?? '').toLowerCase()
  const aliases = (entry.aliases ?? []).map((alias) => alias.toLowerCase())

  let score = 0
  if (name === q) score += 100
  if (label === q) score += 90
  if (manifestName === q) score += 88
  if (aliases.includes(q)) score += 86
  if (group === q) score += 85
  if (groupLabel === q) score += 80
  if (name.includes(q)) score += 60
  if (label.includes(q)) score += 50
  if (manifestName.includes(q)) score += 48
  if (aliases.some((alias) => alias.includes(q))) score += 46
  if (group.includes(q)) score += 45
  if (groupLabel.includes(q)) score += 40
  if (description.includes(q)) score += 25
  if (groupDescription.includes(q)) score += 20
  if (snippet.includes(q)) score += 15
  if (guidelines.includes(q)) score += 10

  return score
}

function inferCatalogGroup(entry: ToolCatalogEntry): ToolCatalogEntry {
  if (entry.catalogGroup) return entry

  const normalizedExtensionId = entry.extensionId?.trim()
  const normalizedExtensionName = normalizeText(entry.extensionName)

  if (normalizedExtensionId === '@chaton/browser') {
    return {
      ...entry,
      catalogGroup: normalizedExtensionId,
      catalogGroupLabel: normalizedExtensionName ?? 'Browser',
      catalogGroupDescription: 'Browser and web navigation tools.',
      catalogGroupPriority: 100,
    }
  }

  return entry
}

function collapseCatalogGroups(entries: ToolCatalogEntry[]): ToolCatalogEntry[] {
  const grouped = new Map<string, ToolCatalogEntry[]>()
  const ungrouped: ToolCatalogEntry[] = []

  for (const rawEntry of entries) {
    const entry = inferCatalogGroup(rawEntry)
    if (!entry.catalogGroup) {
      ungrouped.push(entry)
      continue
    }

    const existing = grouped.get(entry.catalogGroup) ?? []
    existing.push(entry)
    grouped.set(entry.catalogGroup, existing)
  }

  const collapsed = Array.from(grouped.entries()).map(([groupKey, groupEntries]) => {
    const sortedEntries = [...groupEntries].sort((a, b) => a.name.localeCompare(b.name))
    const representative = sortedEntries[0]
    const groupLabel = representative.catalogGroupLabel ?? representative.extensionName ?? representative.label
    const groupDescription = representative.catalogGroupDescription
      ?? representative.extensionName
      ?? representative.description

    return {
      ...representative,
      name: groupKey,
      label: groupLabel,
      description: groupDescription,
      promptSnippet: representative.promptSnippet ?? representative.description,
      parameters: undefined,
      promptGuidelines: representative.promptGuidelines,
    }
  })

  return [...ungrouped, ...collapsed].sort((a, b) => {
    const priorityDelta = (b.catalogGroupPriority ?? 0) - (a.catalogGroupPriority ?? 0)
    if (priorityDelta !== 0) return priorityDelta
    return a.name.localeCompare(b.name)
  })
}

export function buildToolCatalogFromManifests(manifests: ExtensionManifest[]): ToolCatalogEntry[] {
  const entries: ToolCatalogEntry[] = []
  for (const manifest of manifests) {
    const usedNames = new Set<string>()
    const tools = Array.isArray(manifest.llm?.tools) ? manifest.llm?.tools ?? [] : []
    for (const tool of tools) {
      const entry = manifestToolToCatalogEntry(manifest, tool, usedNames)
      if (entry) entries.push(entry)
    }
  }
  return collapseCatalogGroups(entries)
}

export function buildToolCatalogFromExposedTools(tools: ExposedExtensionToolDefinition[]): ToolCatalogEntry[] {
  return collapseCatalogGroups(tools.map(exposedToolToCatalogEntry))
}

function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function normalizeQueryInputs(query: string | string[]): string[] {
  const rawQueries = Array.isArray(query) ? query : [query]
  const normalized = rawQueries
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  return normalized.filter((value, index, array) => array.indexOf(value) === index)
}

export function searchToolCatalog(entries: ToolCatalogEntry[], query: string | string[], limit = 20): ToolCatalogEntry[] {
  const normalizedQueries = normalizeQueryInputs(query)
  if (normalizedQueries.length === 0) {
    return entries.slice(0, Math.max(1, limit))
  }

  const scoredEntries = new Map<string, { entry: ToolCatalogEntry; score: number }>()

  for (const normalizedQuery of normalizedQueries) {
    const tokens = tokenizeQuery(normalizedQuery)
    const candidateQueries = [normalizedQuery, ...tokens].filter((value, index, array) => array.indexOf(value) === index)

    for (const entry of entries) {
      const score = candidateQueries.reduce((bestScore, candidate) => Math.max(bestScore, scoreEntry(entry, candidate)), 0)
      if (score <= 0) continue

      const existing = scoredEntries.get(entry.name)
      if (!existing || score > existing.score) {
        scoredEntries.set(entry.name, { entry, score })
      }
    }
  }

  return Array.from(scoredEntries.values())
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, Math.max(1, limit))
    .map((item) => item.entry)
}

export function getToolCatalogEntry(entries: ToolCatalogEntry[], toolName: string): ToolCatalogEntry | null {
  const exact = entries.find((entry) => entry.name === toolName || entry.manifestName === toolName || entry.aliases?.includes(toolName))
  if (exact) return exact

  const normalized = toolName.trim().toLowerCase()
  if (!normalized) return null
  return entries.find((entry) => {
    if (entry.name.toLowerCase() === normalized) return true
    if (entry.manifestName?.toLowerCase() === normalized) return true
    return (entry.aliases ?? []).some((alias) => alias.toLowerCase() === normalized)
  }) ?? null
}
