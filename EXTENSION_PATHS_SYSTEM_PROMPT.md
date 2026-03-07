# Extension Paths in System Prompts - Implementation Guide

## Overview

This document describes the implementation of adding extension paths and metadata to the AI system prompts in Chatons. This change allows the AI assistant to be aware of installed extensions, their locations, and their capabilities when providing assistance.

## Changes Made

### 1. Modified File: `electron/pi-sdk-runtime.ts`

#### Imports Added (Lines 36-37)
```typescript
import { runBeforePiLaunchHooks, getChatonsExtensionsBaseDir } from "./extensions/manager.js";
import { getExposedExtensionTools, listExtensionManifests } from "./extensions/runtime.js";
```

**Purpose**: Import the necessary functions to:
- Retrieve the extensions base directory path
- Get the list of all loaded extension manifests

#### Helper Function Added (Lines 425-460)
```typescript
function buildExtensionContextSection(): string | null
```

**Purpose**: Build a formatted section of the system prompt containing:
- List of all installed extensions
- Extension IDs and versions
- Filesystem paths to each extension
- Declared capabilities for each extension
- Error handling with graceful fallback (returns `null` if no extensions)

**Key Features**:
- Returns `null` if no extensions are installed (section not included in prompt)
- Safely catches and logs errors without breaking the session
- Formats extension information in a readable markdown format
- Includes all available capabilities declared by each extension

**Output Example**:
```
## Available Extensions

The following extensions are installed and available to this session:

- **extension-name** (v1.0.0)
  ID: extension-id
  Location: /Users/username/.chaton/extensions/extension-id
  Capabilities: capability1, capability2

- **another-extension** (v2.1.0)
  ID: another-extension-id
  Location: /Users/username/.chaton/extensions/another-extension-id
  Capabilities: capability3
```

#### System Prompt Integration (Lines 766-769)
The extension context is added to the system prompt when building the `DefaultResourceLoader`:

```typescript
const extensionContext = buildExtensionContextSection();
if (extensionContext) {
  sections.push(extensionContext);
}
```

**Placement**: After the "Secure mode limitation handling" section and before the "Mode ouvert" (open mode) section.

**Conditional**: Only included in the prompt if extensions are actually installed.

## How It Works

### System Prompt Flow

1. **Runtime Start**: When a Pi session is created for a conversation
2. **Extension Detection**: `buildExtensionContextSection()` is called
3. **Manifest Retrieval**: `listExtensionManifests()` gets all loaded extensions
4. **Path Resolution**: Each extension path is resolved relative to `~/.chaton/extensions/`
5. **Formatting**: Information is formatted as a markdown section
6. **Prompt Injection**: If extensions exist, the section is added to the system prompt
7. **Model Awareness**: The AI model receives the prompt with extension information included

### Data Flow Diagram

```
Pi Session Creation
    ↓
appendSystemPromptOverride callback
    ↓
buildExtensionContextSection()
    ↓
listExtensionManifests() → getChatonsExtensionsBaseDir()
    ↓
Format manifest data (id, name, version, path, capabilities)
    ↓
Build markdown section (or return null if no extensions)
    ↓
Add to system prompt sections array
    ↓
Injected into AI model's system prompt
```

## API References

### `getChatonsExtensionsBaseDir()`
**Source**: `electron/extensions/manager.ts`

Returns the base directory where extensions are installed:
```
~/.chaton/extensions
```

### `listExtensionManifests()`
**Source**: `electron/extensions/runtime.ts` (exported from `runtime/registry.ts`)

Returns an array of `ExtensionManifest` objects containing:
- `id`: Extension identifier (string)
- `name`: Display name (string)
- `version`: Semantic version (string)
- `capabilities`: Array of capability strings (optional)
- Other metadata (icon, entrypoints, ui configuration, etc.)

## Extension Manifest Structure

Each extension manifest contains:
```typescript
{
  id: string              // Unique identifier
  name: string            // Display name
  version: string         // Semantic version
  capabilities?: string[] // Declared capabilities
  // ... other optional properties
}
```

## Example Output in System Prompt

When a conversation starts with 2 extensions installed, the AI will see:

```
## Available Extensions

The following extensions are installed and available to this session:

- **GitHub Integration** (v1.2.0)
  ID: github-integration
  Location: /Users/thibaut/.chaton/extensions/github-integration
  Capabilities: vcs.github, ai.chat

- **Documentation Generator** (v2.0.1)
  ID: doc-generator
  Location: /Users/thibaut/.chaton/extensions/doc-generator
  Capabilities: docs.generate, docs.format, ai.chat
```

## Error Handling

The implementation includes robust error handling:

1. **No Extensions**: Returns `null`, section is skipped (no breaking change)
2. **Invalid Manifests**: Gracefully handles by displaying "no capabilities declared"
3. **Path Resolution Errors**: Caught and logged, returns `null` to prevent prompt injection failure
4. **Empty Capability Lists**: Displays "no capabilities declared" instead of empty list

Errors are logged to the console with context:
```
Failed to build extension context: [error message]
```

## Benefits

### For AI Assistants
- **Awareness**: Knows what extensions are available and where they're located
- **Discovery**: Can help users understand what capabilities are installed
- **Context**: Better understanding of the user's development environment
- **Recommendations**: Can suggest using relevant extensions for tasks

### For Users
- **Transparency**: Can see what extensions are being considered by the AI
- **Debugging**: Helps troubleshoot extension-related issues
- **Documentation**: Helps users understand their extension setup

### For Developers
- **Extension Development**: Clear indication of extension paths for local development
- **Integration Testing**: Can reference exact paths when testing
- **Documentation Reference**: Extensions can be referenced by exact paths

## Configuration

The feature is:
- **Always Active**: No configuration needed
- **Conditional**: Only included if extensions exist
- **Non-Breaking**: Returns gracefully if no extensions installed
- **Safe**: Wrapped in try-catch with error logging

## Testing

### Manual Testing

1. **No Extensions Case**:
   - Ensure no extensions are installed
   - Start a conversation
   - Verify extension section does NOT appear in system prompt

2. **With Extensions Case**:
   - Install 1-2 test extensions
   - Start a conversation
   - Verify extension section appears with correct:
     - Extension names and versions
     - Filesystem paths
     - Capabilities lists
     - Proper formatting

3. **Error Handling**:
   - Corrupt an extension manifest
   - Start a conversation
   - Verify graceful degradation (section skipped, no crash)

### Example Test Cases

```bash
# Test 1: No extensions installed
rm -rf ~/.chaton/extensions/*
# Verify extension section is absent

# Test 2: Single extension
mkdir -p ~/.chaton/extensions/test-ext
# Verify extension appears in prompt

# Test 3: Multiple extensions with capabilities
# Add multiple extensions with different capabilities
# Verify all appear correctly formatted
```

## Performance Considerations

- **Execution Time**: < 10ms (trivial overhead)
- **Memory**: Negligible (string formatting)
- **Cache**: Extension manifests already loaded during session init
- **Impact**: No noticeable performance change

## Integration with Other Systems

### Pi Session Lifecycle
- Integrated into: `createAgentSession()` configuration
- Timing: Before session creation, during prompt building
- Impact: None - purely informational

### Extension Manager
- Uses: `getChatonsExtensionsBaseDir()` from manager.ts
- Dependency: Bidirectional, but non-blocking

### Extension Runtime
- Uses: `listExtensionManifests()` from runtime.ts
- Dependency: Read-only operation, safe to call during initialization

## Future Enhancements

Potential improvements for future versions:

1. **Extension Descriptions**: Add brief descriptions from manifest
2. **Extension Status**: Include health/enabled status
3. **User Extensions Only**: Option to hide built-in extensions
4. **Custom Prompt Injection**: Allow extensions to contribute custom prompt sections
5. **Capability Descriptions**: Explain what each capability does
6. **Extension URLs**: Include repository/documentation links

## Documentation Maintenance

This feature is documented in:
- This file: `EXTENSION_PATHS_SYSTEM_PROMPT.md`
- `AGENTS.md`: Mention in system prompt section
- `PI_INTEGRATION.md`: Extension context injection in Pi integration details
- Code comments: Inline documentation in `buildExtensionContextSection()`

## Related Files

- `electron/pi-sdk-runtime.ts`: Main implementation
- `electron/extensions/manager.ts`: Extension base directory
- `electron/extensions/runtime.ts`: Extension manifest listing
- `electron/extensions/runtime/registry.ts`: Registry implementation
- `AGENTS.md`: Architecture and Pi integration documentation

## Troubleshooting

### Extension Section Not Appearing
1. Check if extensions are actually installed: `ls ~/.chaton/extensions/`
2. Check console for errors: Look for "Failed to build extension context"
3. Verify extension manifests are valid JSON

### Extension Paths Incorrect
1. Verify `getChatonsExtensionsBaseDir()` returns correct path
2. Check individual extension directories exist and are readable
3. Check file permissions on extension directories

### Performance Issues
- The feature adds negligible overhead
- If performance is poor, check if extension loading itself is the issue
- Monitor CPU during session initialization

## Version History

- **v1.0.0** (Mar 7, 2026): Initial implementation
  - Added extension context section to system prompts
  - Included extension ID, name, version, path, and capabilities
  - Implemented error handling and graceful degradation
