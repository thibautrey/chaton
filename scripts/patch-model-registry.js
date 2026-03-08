/**
 * Patch pi-coding-agent's model-registry to cache the AJV schema validator.
 *
 * Without this patch, every ModelRegistry construction compiles the full
 * JSON schema from scratch (new Ajv() + ajv.compile()), which takes ~80ms
 * and happens on every conversation session start.
 *
 * This script is idempotent — safe to run multiple times.
 */
const fs = require('node:fs')
const path = require('node:path')

const TARGET = path.join(
  __dirname,
  '..',
  'node_modules',
  '@mariozechner',
  'pi-coding-agent',
  'dist',
  'core',
  'model-registry.js',
)

if (!fs.existsSync(TARGET)) {
  console.log('[patch-model-registry] Target file not found, skipping.')
  process.exit(0)
}

let content = fs.readFileSync(TARGET, 'utf8')

// Already patched?
if (content.includes('_cachedModelsConfigValidator')) {
  console.log('[patch-model-registry] Already patched, skipping.')
  process.exit(0)
}

// 1. Insert cached validator factory after schema definition
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
  console.error('[patch-model-registry] Could not find schema insertion point.')
  process.exit(1)
}
content = content.replace(schemaEnd, schemaEndPatched)

// 2. Replace the inline Ajv creation with the cached getter
const inlineAjv = `const ajv = new Ajv();
            const validate = ajv.compile(ModelsConfigSchema);`

const cachedAjv = `const validate = getModelsConfigValidator();`

if (!content.includes(inlineAjv)) {
  console.error('[patch-model-registry] Could not find inline AJV usage.')
  process.exit(1)
}
content = content.replace(inlineAjv, `// Validate schema (using cached validator)\n            ${cachedAjv}`)

fs.writeFileSync(TARGET, content, 'utf8')
console.log('[patch-model-registry] Successfully patched model-registry.js')
