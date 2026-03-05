# Chatons Developer Guide

## 1. Purpose
This guide documents the **actual technical behavior** of Chatons as implemented in the current codebase.

Scope baseline: observed in source on **March 5, 2026**.

## 2. Stack and Runtime Layers

- Desktop shell: Electron
- UI: React + TypeScript + i18next
- Local data: SQLite (`better-sqlite3`)
- AI runtime: `@mariozechner/pi-coding-agent`
- Git operations: mixed (`isomorphic-git` + native git fallback)

Main runtime layers:

1. `electron/main.ts`: app boot, window lifecycle, IPC registration
2. `electron/ipc/workspace.ts`: primary app API surface
3. `electron/pi-sdk-runtime.ts`: per-conversation Pi session runtime bridge
4. `src/features/workspace/store.tsx`: frontend orchestration and runtime state

## 3. App Boot Sequence
At startup (`electron/main.ts`):

1. userData path is forced to Chatons-specific directory
2. local Pi agent folder is bootstrapped (`.pi/agent`)
3. logging, Pi manager, and sandbox manager are initialized
4. orphan worktrees cleanup runs
5. IPC handlers are registered
6. extension runtime is initialized via workspace IPC registration

## 4. Persistent Data Model (SQLite)
Migrations are in `electron/db/migrations/*.sql`.

Core tables:

- `projects`
- `conversations`
- `conversation_messages_cache`
- `app_settings`
- `pi_models_cache`
- `quick_actions_usage`
- `extension_kv`
- `extension_queue`
- `automation_rules`
- `automation_runs`

Notable conversation fields:

- `project_id` (nullable for global threads)
- `model_provider`, `model_id`, `thinking_level`
- `worktree_path`
- `access_mode` (`secure` / `open`)

## 5. Workspace State and Frontend Orchestration
`WorkspaceProvider` (`src/features/workspace/store.tsx`) is the main state engine.

Responsibilities include:

- hydration of projects/conversations/settings
- Pi runtime status and message stream synchronization
- optimistic user message insertion
- queue/retry behavior when upstream returns empty output
- conversation title updates from backend events
- extension notifications and extension main-view open events

## 6. Pi Session Runtime Architecture
`PiSessionRuntimeManager` in `electron/pi-sdk-runtime.ts` creates one Pi runtime per conversation.

Key points:

- runtime cwd selection:
  - conversation worktree if present
  - otherwise project repo
  - otherwise global workspace
- tools cwd differs by access mode:
  - `secure` => conversation runtime cwd
  - `open` => filesystem root (`/` on Unix)
- settings/model registry/auth storage are loaded from Chatons-owned Pi directory
- extension hooks run before Pi launch (Qwen sanitizer hook path)

## 7. Composer Behavior (Actual)
`src/components/shell/Composer.tsx` implements:

- model picker with scoped/all toggle (`more`)
- in-place scope toggling with star button
- thinking level selector only when model supports it
- per-thread access mode switch (`secure`/`open`)
- attachments pipeline:
  - images => image payload
  - small text => inline content block
  - binary/large => base64 preview text
- auto-title request on first send in a new thread
- queued message behavior while runtime is busy
- live modifications panel with per-file inline diff navigation

## 8. Worktree Lifecycle and Current Limits
Worktrees are created per project conversation and stored under Chatons Pi worktree root.

Current implementation status (important):

- `commitWorktree`: currently stages changes, returns a generated short hash placeholder instead of a real commit hash path from native git
- `mergeWorktreeIntoMain`: custom copy-based merge strategy is used for many flows
- `pushWorktreeBranch`: currently returns unavailable in self-contained mode
- ahead/behind and merged checks are currently stubbed in parts of IPC helper logic

Do not treat worktree metadata fields as full Git parity yet.

## 9. Update System Status
Update flow (`electron/lib/update/update-service.ts`) supports:

- GitHub release check
- download with progress
- platform apply hooks

Current apply hooks are placeholder-style on some platforms (cleanup/restart path present; full installer orchestration is limited).
Runtime guards in current implementation:

- renderer changelog reader now gracefully skips filesystem changelog reads when `window.electron.ipcRenderer` is not available
- `apply-update` IPC now checks that `<userData>/updates` exists before scanning files and returns a friendly error if missing

## 9.1 macOS Release Notarization Validation (CI)
The macOS GitHub Actions pipeline validates built DMGs in `.github/workflows/build-all-platforms.yml`.

When notarization is enabled, CI now staples with retries before validation:

- `xcrun stapler staple <dmg>`
- `xcrun stapler validate <dmg>`

Reason: Apple ticket availability can lag just after notarization acceptance. This can surface transient failures such as CloudKit `Record not found` on early staple attempts. CI uses bounded retries with delay to absorb this propagation window.

## 10. Extension Platform Architecture

### 10.1 Registry and install manager
`electron/extensions/manager.ts` handles registry at:

- `~/.chaton/extensions/registry.json`

Catalog sources:

- bundled entries
- npm `@chaton/*` discovery cache

Install behaviors:

- builtin install toggles registry entries
- npm install currently creates extension folder and writes minimal `package.json`
- remove is blocked for builtin registry entries

### 10.2 Runtime manifest loading
`electron/extensions/runtime.ts` initializes runtime manifests from:

- built-in automation manifest
- installed extension directories containing `chaton.extension.json`

Important:

- runtime manifest map is initialized at startup
- install/toggle actions do not automatically rebuild runtime manifest map during same process
- restart is the safe path after adding/changing extension files

### 10.3 Capability-gated APIs
Capabilities are enforced per call for major APIs:

- events (`subscribe`, `publish`)
- queue (`publish`, `consume`)
- storage (`kv`, `files`)
- host calls (`notifications`, `conversations.list`, `projects.list`)

Queue semantics:

- at-least-once style
- states: queued/processing/done/dead
- exponential retry + dead-lettering
- idempotency key dedup for enqueue

### 10.4 Built-in automation extension
Built-in extension ID: `@chaton/automation`

Provides:

- main view UI (`index.html` + `index.js`)
- APIs: `automation.rules.list/save/delete`, `automation.runs.list`
- trigger topics:
  - `conversation.created`
  - `conversation.message.received`
  - `project.created`
  - `conversation.agent.ended`

## 11. How to Create an Extension That Works Today
This section reflects the actual current mechanics.

### 11.1 Create extension files
Under extensions base dir:

- `~/.chaton/extensions/extensions/<your-extension-id>/chaton.extension.json`
- web assets referenced by `webviewUrl` (for example `index.html`, `index.js`)

Minimal manifest:

```json
{
  "id": "@chaton/my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "capabilities": ["ui.mainView", "host.notifications"],
  "ui": {
    "mainViews": [
      {
        "viewId": "my.main",
        "title": "My Extension",
        "webviewUrl": "chaton-extension://@chaton/my-extension/index.html",
        "initialRoute": "/"
      }
    ]
  }
}
```

### 11.2 Register extension entry
Add or update entry in `~/.chaton/extensions/registry.json` so it appears in the extensions panel.

Minimal entry shape:

```json
{
  "id": "@chaton/my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "Local dev extension",
  "enabled": true,
  "installSource": "localPath",
  "health": "ok"
}
```

### 11.3 Expose user access path
Important current behavior:

- `ui.menuItems` from manifest are not rendered directly in the main sidebar navigation yet.
- To make your view reachable, use one of:
  - quick action config in registry entry (`config.quickActions`)
  - explicit host call to `open.mainView`
  - direct app event path during development

### 11.4 Restart app
Restart Chatons to force runtime manifest reload.

### 11.5 Verify
Use:

- Extensions panel for install/toggle/log visibility
- runtime health (`extensions:runtime:health` IPC path)
- main-view loading via `extensions:getMainViewHtml`

## 12. Deeplink Contract (Main View)
When opening extension main view + deeplink, UI sends:

```js
window.postMessage({
  type: 'chaton.extension.deeplink',
  payload: {
    viewId: 'my.main',
    target: 'open-create',
    params: { }
  }
}, '*')
```

In extension webview page, listen for `message` and dispatch behavior by `payload.target`.

## 13. Skills vs Extensions
Skills and extensions are separate subsystems.

## 14. Onboarding Provider Card Styling
Provider cards in onboarding (`.onboarding-provider-card` in `src/index.css`) intentionally use a transparent background in both light and dark themes (with visible borders) for better readability against the onboarding shell/card backgrounds.
The Mistral preset is visually flagged with a gold star badge (`.onboarding-provider-preferred-star`) to mark it as preferred without changing selection logic.
Provider-card clicks in onboarding Step 1 trigger a smooth scroll to the provider form/API key block (`providerFormRef`) so the credential fields are brought into view after selection.

- Skills: managed via Pi commands (`pi list/install/remove`) and external catalog
- Extensions: managed by Chatons extension registry/runtime and Electron IPC

## 15. Operational Caveats (Must-Know)

- Runtime extension reload is not fully hot; restart is recommended after install/update.
- npm extension install path currently does not materialize full extension runtime assets by itself.
- Worktree push path is currently disabled in self-contained mode.
- Some Git status metadata in worktree dialogs is currently approximate.
- Updater apply path is partially scaffolded depending on platform.

## 15. Recommended Documentation Policy
For reliable docs going forward:

1. treat these guides as source of truth
2. update docs in same PR as feature behavior changes
3. add explicit “current limitations” section for partially implemented features
4. avoid documenting planned behavior as shipped behavior
