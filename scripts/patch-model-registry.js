/**
 * Patch pi-coding-agent internals with Chatons-specific compatibility fixes.
 *
 * Current patches:
 * - (Legacy) Cache the model-registry AJV schema validator to avoid recompilation on every session start.
 *   NOTE: Newer versions of pi-coding-agent use ajv.addSchema/getSchema which already provides caching.
 * - Preserve the bare "!" apiKey placeholder used for keyless local providers
 *   (LM Studio, Ollama-style OpenAI-compatible endpoints) instead of treating it
 *   as an empty shell command in resolveConfigValue().
 *
 * This script is idempotent and safe to run multiple times.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MODEL_REGISTRY_TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@mariozechner',
  'pi-coding-agent',
  'dist',
  'core',
  'model-registry.js',
)

const RESOLVE_CONFIG_VALUE_TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@mariozechner',
  'pi-coding-agent',
  'dist',
  'core',
  'resolve-config-value.js',
)

function patchModelRegistry() {
  if (!fs.existsSync(MODEL_REGISTRY_TARGET)) {
    console.log('[patch-model-registry] model-registry.js not found, skipping.')
    return
  }

  let content = fs.readFileSync(MODEL_REGISTRY_TARGET, 'utf8')

  // Check if already patched with the "!" apiKey fix
  if (content.includes('_cachedModelsConfigValidator') || content.includes('ajv.addSchema(ModelsConfigSchema')) {
    // Newer versions of pi-coding-agent use ajv.addSchema/getSchema which already caches the compiled schema
    console.log('[patch-model-registry] model-registry.js uses built-in schema caching (ajv.addSchema/getSchema), skipping AJV cache patch.')
    return
  }

  // Legacy patch for older versions of pi-coding-agent
  const schemaEnd = `providers: Type.Record(Type.String(), ProviderConfigSchema),
});
function emptyCustomModelsResult`

  const schemaEndPatched = `providers: Type.Record(Type.String(), ProviderConfigSchema),
});
// Cached AJV validator — avoids recompiling the schema on every loadCustomModels call
let _cachedModelsConfigValidator = null;
function getModelsConfigValidator() {
    if (!_cachedModelsConfigValidator) {
        const ajv = new Ajv();
        _cachedModelsConfigValidator = ajv.compile(ModelsConfigSchema);
    }
    return _cachedModelsConfigValidator;
}
function emptyCustomModelsResult`

  if (!content.includes(schemaEnd)) {
    throw new Error('[patch-model-registry] Could not find schema insertion point.')
  }
  content = content.replace(schemaEnd, schemaEndPatched)

  const inlineAjv = `const ajv = new Ajv();
            const validate = ajv.compile(ModelsConfigSchema);`

  const cachedAjv = `const validate = getModelsConfigValidator();`

  if (!content.includes(inlineAjv)) {
    throw new Error('[patch-model-registry] Could not find inline AJV usage.')
  }
  content = content.replace(inlineAjv, `// Validate schema (using cached validator)\n            ${cachedAjv}`)

  fs.writeFileSync(MODEL_REGISTRY_TARGET, content, 'utf8')
  console.log('[patch-model-registry] Patched model-registry.js')
}

function patchResolveConfigValue() {
  if (!fs.existsSync(RESOLVE_CONFIG_VALUE_TARGET)) {
    console.log('[patch-model-registry] resolve-config-value.js not found, skipping.')
    return
  }

  let content = fs.readFileSync(RESOLVE_CONFIG_VALUE_TARGET, 'utf8')

  if (content.includes('if (config === "!")')) {
    console.log('[patch-model-registry] resolve-config-value.js already patched.')
    return
  }

  const lookup = `export function resolveConfigValue(config) {
    if (config.startsWith("!")) {
        return executeCommand(config);
    }`

  const replacement = `export function resolveConfigValue(config) {
    if (config === "!") {
        return "!";
    }
    if (config.startsWith("!")) {
        return executeCommand(config);
    }`

  if (!content.includes(lookup)) {
    throw new Error('[patch-model-registry] Could not find resolveConfigValue insertion point.')
  }

  content = content.replace(lookup, replacement)
  fs.writeFileSync(RESOLVE_CONFIG_VALUE_TARGET, content, 'utf8')
  console.log('[patch-model-registry] Patched resolve-config-value.js')
}

patchModelRegistry()
patchResolveConfigValue()
