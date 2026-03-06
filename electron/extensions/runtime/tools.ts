import { normalizeTypeBoxSchema, sanitizePiToolName } from './helpers.js'
import { PI_TOOL_NAME_PATTERN } from './constants.js'
import { appendExtensionLog } from './logging.js'
import { hasCapability, trackCapability } from './capabilities.js'
import { runtimeState } from './state.js'
import type { ExposedExtensionToolDefinition } from './types.js'

function resolvePiToolName(extensionId: string, manifestToolName: string, usedNames: Set<string>) {
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

  return { resolved, renamed: resolved !== raw, reason: directlyUsable ? (resolved !== raw ? 'duplicate' : null) : 'invalid' }
}

export function buildExtensionToolDefinitions(
  extensionId: string,
  extensionsCall: (callerExtensionId: string, extensionId: string, apiName: string, versionRange: string, payload: unknown) => ReturnType<ExposedExtensionToolDefinition['execute']> extends Promise<infer _> ? any : never,
): ExposedExtensionToolDefinition[] {
  const manifest = runtimeState.manifests.get(extensionId)
  if (!manifest || !hasCapability(extensionId, 'llm.tools')) return []
  const toolManifests = Array.isArray(manifest.llm?.tools) ? manifest.llm?.tools ?? [] : []
  const usedToolNames = new Set<string>()
  const exposedTools: ExposedExtensionToolDefinition[] = []

  for (const entry of toolManifests) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.description !== 'string') {
      appendExtensionLog(extensionId, 'warn', 'llm.tool_manifest_invalid', {
        reason: 'missing_name_or_description',
      })
      continue
    }

    const resolvedName = resolvePiToolName(extensionId, entry.name, usedToolNames)
    if (resolvedName.renamed) {
      appendExtensionLog(extensionId, 'warn', 'llm.tool_name_normalized', {
        reason: resolvedName.reason,
        manifestName: entry.name,
        exposedName: resolvedName.resolved,
      })
    }

    const apiName = entry.name
    exposedTools.push({
      extensionId,
      name: resolvedName.resolved,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : apiName,
      description: entry.description,
      promptSnippet: typeof entry.promptSnippet === 'string' ? entry.promptSnippet : undefined,
      promptGuidelines: Array.isArray(entry.promptGuidelines)
        ? entry.promptGuidelines.filter((guideline): guideline is string => typeof guideline === 'string' && guideline.trim().length > 0)
        : undefined,
      parameters: normalizeTypeBoxSchema(entry.parameters),
      execute: async (_toolCallId, params) => {
        trackCapability(extensionId, 'llm.tools')
        const result = extensionsCall('chatons-llm', extensionId, apiName, '^1.0.0', params) as any
        if (!result.ok) {
          return {
            content: [{ type: 'text', text: result.error.message }],
            details: { extensionId, apiName, exposedToolName: resolvedName.resolved, ok: false },
            isError: true,
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data ?? null, null, 2) }],
          details: { extensionId, apiName, exposedToolName: resolvedName.resolved, ok: true, data: result.data ?? null },
        }
      },
    })
  }

  return exposedTools
}
