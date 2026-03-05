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
- isomorphic-git HTTP transport in Electron uses `isomorphic-git/http/web` (WHATWG `fetch`), avoiding Node legacy `url.parse()` deprecation path
- Sentry main-process telemetry is configured to use Node transport (not Electron net transport) to avoid Electron `DEP0169` `url.parse()` warnings

Main runtime layers:

1. `electron/main.ts`: app boot, window lifecycle, IPC registration
2. `electron/ipc/workspace.ts`: primary app API surface
3. `electron/pi-sdk-runtime.ts`: per-conversation Pi session runtime bridge
4. `src/features/workspace/store.tsx`: frontend orchestration and runtime state

Pi CLI command execution (settings panel / model sync / skills install) is now forced through:

- bundled `@mariozechner/pi-coding-agent/dist/cli.js` when available
- Electron runtime Node (`process.execPath`) as the launcher
- `PI_CODING_AGENT_DIR=<Chatons userData>/.pi/agent`
- bundled CLI discovery resolves package entrypoint and checks packaged-app fallback paths (including `resources/app.asar.unpacked`) to avoid `package.json` exports resolution failures

This avoids dependency on user-global `~/.pi/agent/bin/pi` and shell `PATH` resolution (`node` not found in packaged app contexts).

Auth bootstrap note:

- Pi SDK runtime auth reads credentials from `<userData>/.pi/agent/auth.json`.
- Chatons now enforces provider credential consistency between `models.json` and `auth.json`:
  - when `models.json` contains `provider.apiKey` and auth is missing, it auto-populates `auth.json`
  - when `auth.json` contains `api_key` credentials, it mirrors them back into provider `apiKey` fields in `models.json`
  - sync runs on workspace IPC startup, model/auth JSON updates, and Pi runtime start

## 3. App Boot Sequence
At startup (`electron/main.ts`):

1. userData path is forced to Chatons-specific directory
2. local Pi agent folder is bootstrapped (`.pi/agent`)
3. logging, Pi manager, and sandbox manager are initialized
4. Sentry telemetry sink is initialized (if `SENTRY_DSN` is configured) and gated by sidebar consent setting
5. orphan worktrees cleanup runs
5. IPC handlers are registered
6. extension runtime is initialized via workspace IPC registration

## 3.1 macOS Close/Hide/Quit Lifecycle
Current lifecycle behavior in `electron/main.ts` + status bar:

- Window `close` on macOS is intercepted and converted to `hide` to keep the app running in background.
- A process-level `isQuitting` guard is set during `app.before-quit`.
- The `close` interception only applies when `isQuitting === false`.
- Result: regular window close keeps app alive, but explicit quit paths (`Cmd+Q`, app menu Quit, tray `Quitter`) close the app normally.
- Status bar icon loading uses a resilient path strategy (`statusbar.png` then `chaton.png` then `icon.png` fallback), resizes to menu-bar-friendly dimensions, and only enables template rendering for explicitly template-named assets.

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

Providers & Models settings behavior:

- In the add-provider modal (`ProvidersModelsSection`), API key is optional for `ollama`, `lmstudio`, and `custom`.
- For other presets, base URL and API key are required to enable provider creation.
- On `pi:updateModelsJson`, backend sanitization now auto-resolves provider `baseUrl` for common OpenAI-compatible variants by probing `GET <candidate>/models` with short timeout and persisting the first reachable candidate (`/v1`, trailing slash, and origin variants).
- A dedicated IPC helper `pi:resolveProviderBaseUrl` is also exposed for UI-level use, returning resolved URL + tested candidates.

`src/components/shell/MainView.tsx` empty-state / quick-actions display logic:

- empty-state quick actions are shown only when runtime messages are empty and no persisted conversation activity exists
- persisted activity fallback uses `conversation.lastMessageAt !== conversation.createdAt` to avoid stale empty-state UI after first exchange during runtime/cache desync

## 8. Worktree Lifecycle and Current Limits
Worktrees are **not created automatically** anymore for project conversations.

A worktree is created lazily when the user activates it from the topbar worktree icon (`conversations:enableWorktree` IPC).

Created worktrees are stored under Chatons Pi worktree root.

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

When notarization is enabled, CI uses a two-level strategy:

- DMG stapling is attempted with bounded retries as best effort (`xcrun stapler staple|validate <dmg>`).
- DMG container signature probing is non-blocking. CI attempts `codesign --verify <dmg>` and runs `spctl -t open` only when the DMG container is verifiable.
- App bundle stapling/validation is required on a writable temporary copy extracted from the mounted DMG (`xcrun stapler staple|validate <app-copy>`).
- App trust checks remain blocking (`codesign --verify --deep --strict` on the enclosed app, and `spctl -t exec` on the writable copied app).

Reason: Apple ticket visibility can lag just after notarization acceptance, and in some flows the staplable ticket is available on the `.app` bundle before (or instead of) the `.dmg`. Also, DMG container signatures are not always present/usable depending on packaging flow. CI tolerates DMG container-level limitations, but still enforces notarization + Gatekeeper validation on the shipped app bundle.

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
- Quick action card rail positioning in empty-thread hero states is constrained by the conversation column (`.chat-section` / `max-width: 920px`) and centered in that column, with vertical placement still derived from the measured composer height (`--composer-overlay-height`) to reduce overlap on short windows and during composer-height changes.

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
For `Custom` provider flows (onboarding and settings modal), preset selection and typed provider name are intentionally managed in separate states so typing the custom name does not switch UI mode and collapse the custom form.

- Skills: managed via Pi commands (`pi list/install/remove`) and external catalog
- Extensions: managed by Chatons extension registry/runtime and Electron IPC

## 15. Operational Caveats (Must-Know)

- Runtime extension reload is not fully hot; restart is recommended after install/update.
- npm extension install path currently does not materialize full extension runtime assets by itself.
- Worktree push path is currently disabled in self-contained mode.
- Some Git status metadata in worktree dialogs is currently approximate.
- Updater apply path is partially scaffolded depending on platform.

## 16. Telemetry and Crash Monitoring (Sentry)
Current implementation:

- Electron + renderer errors/crashes are captured and forwarded as anonymous events when user consent is enabled.
- Renderer telemetry is sent via IPC channels:
  - `telemetry:log`
  - `telemetry:crash`
- Sentry emission is filtered to `error` level only; `info`/`warn`/`debug` events are not sent.

Configuration:

- Sentry DSN is now embedded in app defaults.
- `SENTRY_DSN` remains supported as an optional override.
- Optional `NODE_ENV` used as Sentry environment.

UX linkage:

- consent prompt card is shown once after onboarding until a choice is made
- same toggle is exposed in `Settings > Sidebar`
- telemetry sending is hard-gated by `allowAnonymousTelemetry`

## 15. Recommended Documentation Policy
For reliable docs going forward:

1. treat these guides as source of truth
2. update docs in same PR as feature behavior changes
3. add explicit “current limitations” section for partially implemented features
4. avoid documenting planned behavior as shipped behavior
Sidebar settings persisted in `app_settings.sidebar` now include:

- `allowAnonymousTelemetry` (boolean)
- `telemetryConsentAnswered` (boolean)
