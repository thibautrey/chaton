import type { ExposedExtensionToolDefinition, ExtensionManifest, ExtensionLlmToolManifest } from './types.js'

export type ToolCatalogEntry = {
  name: string
  label: string
  description: string
  source: 'builtin' | 'extension' | 'developer'
  extensionId?: string
  extensionName?: string
  promptSnippet?: string
  promptGuidelines?: string[]
  parameters?: Record<string, unknown>
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function manifestToolToCatalogEntry(
  manifest: ExtensionManifest,
  tool: ExtensionLlmToolManifest,
): ToolCatalogEntry | null {
  const name = normalizeText(tool.name)
  const description = normalizeText(tool.description)
  if (!name || !description) return null

  return {
    name,
    label: normalizeText(tool.label) ?? name,
    description,
    source: manifest.id.startsWith('@chaton/') ? 'builtin' : 'extension',
    extensionId: manifest.id,
    extensionName: manifest.name,
    promptSnippet: normalizeText(tool.promptSnippet),
    promptGuidelines: Array.isArray(tool.promptGuidelines)
      ? tool.promptGuidelines.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : undefined,
    parameters: tool.parameters,
  }
}

function exposedToolToCatalogEntry(tool: ExposedExtensionToolDefinition): ToolCatalogEntry {
  return {
    name: tool.name,
    label: normalizeText(tool.label) ?? tool.name,
    description: normalizeText(tool.description) ?? tool.name,
    source: tool.extensionId.startsWith('@chaton/') ? 'builtin' : 'extension',
    extensionId: tool.extensionId,
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

  let score = 0
  if (name === q) score += 100
  if (label === q) score += 90
  if (name.includes(q)) score += 60
  if (label.includes(q)) score += 50
  if (description.includes(q)) score += 25
  if (snippet.includes(q)) score += 15
  if (guidelines.includes(q)) score += 10

  return score
}

export function buildToolCatalogFromManifests(manifests: ExtensionManifest[]): ToolCatalogEntry[] {
  const entries: ToolCatalogEntry[] = []
  for (const manifest of manifests) {
    const tools = Array.isArray(manifest.llm?.tools) ? manifest.llm?.tools ?? [] : []
    for (const tool of tools) {
      const entry = manifestToolToCatalogEntry(manifest, tool)
      if (entry) entries.push(entry)
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export function buildToolCatalogFromExposedTools(tools: ExposedExtensionToolDefinition[]): ToolCatalogEntry[] {
  return tools.map(exposedToolToCatalogEntry).sort((a, b) => a.name.localeCompare(b.name))
}

export function searchToolCatalog(entries: ToolCatalogEntry[], query: string, limit = 20): ToolCatalogEntry[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return entries.slice(0, Math.max(1, limit))
  }

  return [...entries]
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, Math.max(1, limit))
    .map((item) => item.entry)
}

export function getToolCatalogEntry(entries: ToolCatalogEntry[], toolName: string): ToolCatalogEntry | null {
  const exact = entries.find((entry) => entry.name === toolName)
  if (exact) return exact

  const normalized = toolName.trim().toLowerCase()
  if (!normalized) return null
  return entries.find((entry) => entry.name.toLowerCase() === normalized) ?? null
}
