# Extension Manager

A built-in Chatons extension that provides tools for managing extensions from the marketplace.

## Features

- **Search Marketplace**: Find extensions by name, description, or keywords
- **List Installed**: View all installed extensions with their status
- **Install Extensions**: Install new extensions from npm
- **Uninstall Extensions**: Remove installed extensions
- **Read Logs**: Debug extensions by viewing their runtime and installation logs
- **Check Updates**: See which extensions have updates available
- **Update Extensions**: Update extensions to their latest versions
- **Enable/Disable**: Toggle extensions on/off without uninstalling

## Available Tools

### `extension.search_marketplace`
Search for extensions available on the Chatons marketplace.

Parameters:
- `query` (optional): Search query for name/description/keywords
- `category` (optional): Filter by category (Channels, Productivity, Analytics, Tools, etc.)
- `limit` (optional): Maximum results, integer 1-100 (default: 20)

### `extension.list_installed`
List all currently installed extensions with their status, version, and health.

### `extension.install`
Install an extension from the marketplace.

Parameters:
- `id` (required): npm package name (e.g., "@thibautrey/chatons-extension-linear")

### `extension.uninstall`
Remove an installed extension.

Parameters:
- `id` (required): Extension ID to uninstall

### `extension.get_logs`
Read runtime and installation logs for debugging.

Parameters:
- `id` (required): Extension ID to get logs for
- `lines` (optional): Maximum log lines to return (default: 500)

### `extension.check_updates`
Check if any installed extensions have updates available.

### `extension.update`
Update an extension to the latest version.

Parameters:
- `id` (required): Extension ID to update

### `extension.toggle`
Enable or disable an extension.

Parameters:
- `id` (required): Extension ID
- `enabled` (required): true to enable, false to disable

## Example Usage

```typescript
// Search for calendar extensions
extension.search_marketplace({ query: "calendar", limit: 10 })

// Install an extension
extension.install({ id: "@thibautrey/chatons-extension-linear" })

// Check for updates
extension.check_updates()

// Get logs for debugging
extension.get_logs({ id: "@thibautrey/chatons-extension-linear", lines: 100 })
```

## Implementation

This extension is implemented as a builtin extension with `llm.tools` capability. The tool implementations are in `/electron/extensions/runtime.ts` and delegate to functions in `/electron/extensions/manager.ts`.
