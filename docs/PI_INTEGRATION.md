# Pi Coding Agent Integration

This document describes how Pi Coding Agent is integrated into the Chatons Native application.

## Overview

The application can now use Pi Coding Agent in two ways:

1. **User mode**: If Pi is already installed on the user's machine, the application automatically uses the existing configuration.
2. **Embedded mode**: By default, the application uses an embedded local configuration without depending on an external Pi installation.

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

### 1. Automatic Pi Detection

The system automatically detects whether Pi is installed on the user's machine. If Pi is not found, the application uses its own embedded configuration.

### 2. Local Configuration

If Pi is not installed, a local configuration is created with:
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
- Detect whether the user configuration is in use

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
./test-pi-syntax.sh
```

This script checks:
- Presence of all required files
- Basic file syntax
- Presence of required imports

## Benefits

1. **Flexibility**: The application works with or without a prior Pi installation.
2. **Portability**: Local configuration allows the application to run on any machine.
3. **Customization**: Users can reuse their existing Pi configuration.
4. **Maintainability**: The code is well structured and easy to maintain.

## Next Steps

1. Integrate the `PiSettings` component into the main UI.
2. Use Pi models and settings in existing features.
3. Add more complete unit and integration tests.
4. Document additional Pi APIs that could be exposed.
