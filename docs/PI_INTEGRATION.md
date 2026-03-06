# Pi Coding Agent Integration

This document describes how Pi Coding Agent is integrated into the Chatons Native application.

## Overview

Chatons uses an **internal Pi runtime** for app features (models/skills/settings commands and session runtime).

- CLI execution is resolved from bundled `@mariozechner/pi-coding-agent/dist/cli.js` when available.
- Fallback is Chatons-managed `<userData>/.pi/agent/bin/pi`.
- Command execution forces `PI_CODING_AGENT_DIR=<userData>/.pi/agent`.

This means app behavior does not depend on user-global shell Pi paths.

## File Structure

```
src/
├── lib/
│   ├── pi/
│   │   ├── pi-integration.ts  # Pi integration logic
│   │   ├── pi-manager.ts      # Main Pi manager
│   │   ├── index.ts           # Export entry point
│   │   └── test.ts            # Integration tests
│   └── pi-integration.ts      # (Symlink to pi/pi-integration.ts)
│   └── pi-manager.ts          # (Symlink to pi/pi-manager.ts)
├── hooks/
│   └── usePi.ts               # React hook to use Pi
├── types/
│   └── pi-types.ts            # TypeScript types for Pi
├── components/
│   └── PiSettings.tsx         # UI component for Pi settings
└── examples/
    └── PiSettingsPage.tsx     # Example page using PiSettings

electron/
├── ipc/
│   └── pi.ts                  # IPC handlers for Pi
└── preload.ts                 # Exposes Pi methods to the frontend
```

## Features

### 1. Internal Pi Resolution

The app resolves Pi internally through Electron backend logic:
- `getBundledPiCliPath()`
- `getPiBinaryPath()`
- `runPiExec()`

All are implemented in `electron/ipc/workspace.ts`.

### 2. Local Configuration

A local internal configuration is created and maintained with:
- `settings.json`: default settings
- `models.json`: default model list
- `auth.json`: empty file for authentication information

### 3. Model Management

The application can:
- List available models
- Enable/disable models
- Set a default model

### 4. Settings Management

The application can:
- Read user settings
- Update settings
- Keep app runtime settings in Chatons internal agent directory

## Usage

### In React Components

```typescript
import { usePi } from '../hooks/usePi';

function MyComponent() {
  const { models, settings, isUsingUserConfig, updateSettings } = usePi();

  // Use Pi data
  return (
    <div>
      <h2>Available models</h2>
      <ul>
        {models.map(model => (
          <li key={model.id}>{model.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

### In the Electron Backend

```typescript
import { initPiManager, getModels, getSettings } from '../src/lib/pi-manager';

// Initialize Pi on startup
async function initializeApp() {
  await initPiManager();

  const models = getModels();
  const settings = getSettings();

  console.log('Available models:', models);
  console.log('Settings:', settings);
}
```

## Configuration

### Configuration Files

#### settings.json

```json
{
  "enabledModels": [],
  "defaultModel": null,
  "theme": "system",
  "editor": "vscode"
}
```

#### models.json

```json
{
  "providers": []
}
```

## Tests

To verify that the integration works correctly:

```bash
./scripts/test-pi-syntax.sh
```

This script checks:
- Presence of all required files
- Basic file syntax
- Presence of required imports

## Benefits

1. **Determinism**: App runtime behavior is controlled by project runtime logic.
2. **Portability**: Internal configuration allows app operation without global shell setup.
3. **Isolation**: Chatons uses its own Pi agent directory under app data.
4. **Maintainability**: Runtime resolution and config ownership are centralized.

## Next Steps

1. Integrate the `PiSettings` component into the main UI.
2. Use Pi models and settings in existing features.
3. Add more complete unit and integration tests.
4. Document additional Pi APIs that could be exposed.
