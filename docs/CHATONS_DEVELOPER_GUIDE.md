# Chatons Developer Guide

## 1. Purpose
This guide documents the **actual technical behavior** of Chatons as implemented in the current codebase.

Scope baseline: observed in source on **March 5, 2026**.

## 2. Stack and Runtime Layers

Extension UI note:
- extensions remain free to implement their own UI
- Chatons now also injects a small shared UI helper layer for `mainView` pages so extensions can opt into host-aligned visuals without losing autonomy
- reference docs: `docs/EXTENSIONS.md` and `docs/EXTENSIONS_UI_LIBRARY.md`
- reference implementation: `electron/extensions/builtin/automation/`

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
4. `src/features/workspace/store.tsx` + `src/features/workspace/store/*`: frontend orchestration and runtime state

Pi CLI command execution (settings panel / model sync / skills install) is now forced through:

- bundled `@mariozechner/pi-coding-agent/dist/cli.js` when available
- Electron runtime Node (`process.execPath`) as the launcher
- `PI_CODING_AGENT_DIR=<Chatons userData>/.pi/agent`
- bundled CLI discovery resolves package entrypoint and checks packaged-app fallback paths (including `resources/app.asar.unpacked`) to avoid `package.json` exports resolution failures

This avoids dependency on user-global `~/.pi/agent/bin/pi` and shell `PATH` resolution (`node` not found in packaged app contexts).

Model discovery/source-of-truth note:

- `syncPiModels` now refreshes provider model lists from internal `pi --list-models` output and writes them into `<userData>/.pi/agent/models.json` for configured providers.
- onboarding no longer injects hardcoded model IDs when adding a provider.
- runtime/UI model availability still reads from `models.json` via `ModelRegistry`.

Auth bootstrap note:

- Pi SDK runtime auth reads credentials from `<userData>/.pi/agent/auth.json`.
- Chatons bootstraps `auth.json` proactively during app startup (`ensurePiAgentBootstrapped`) so first-run requests do not depend on lazy file creation.
- Chatons now enforces provider credential consistency between `models.json` and `auth.json`:
  - when `models.json` contains `provider.apiKey` and auth is missing, it auto-populates `auth.json`
  - when `auth.json` contains `api_key` credentials, it mirrors them back into provider `apiKey` fields in `models.json`
  - sync runs during bootstrap, workspace IPC startup, model/auth JSON updates, and Pi runtime start
- On runtime auth failures (`401`, `unauthorized`, missing API key), Chatons now appends a sanitized auth debug suffix in `last_runtime_error` and runtime error events:
  - provider id
  - detected credential source (`auth.json`, `models.json` fallback, env/none)
  - masked key preview and short fingerprint (SHA-256 prefix)
  - full raw keys are never logged
- Frontend workspace store now converts failed message-send RPC responses (`prompt`, `follow_up`, `steer`) into user-visible `notice` text in addition to runtime `lastError` state; auth-like failures (`401`/`unauthorized`/API-key-related) map to a dedicated authentication guidance notice.

## 3. App Boot Sequence
At startup (`electron/main.ts`):

1. userData path is forced to Chatons-specific directory
2. local Pi agent folder is bootstrapped (`.pi/agent`)
3. logging, Pi manager, and sandbox manager are initialized
4. Sentry telemetry sink is initialized (if `SENTRY_DSN` is configured) and gated by sidebar consent setting
5. orphan worktrees cleanup runs
5. IPC handlers are registered
6. extension runtime is initialized via workspace IPC registration

Renderer startup gating (`src/App.tsx`):

- while `useWorkspace().isLoading === true`, the app renders a dedicated `LoadingSplash` component
- this prevents initial white-frame exposure during workspace hydration
- splash UI uses the same mascot media asset as onboarding (`src/assets/chaton-hero.webm`)
- loading copy transitions reuse onboarding intro copy animation classes (`.onboarding-intro-title`, `.onboarding-intro-body` with `onboarding-copy-fade`)

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
- `memory_entries`

Notable conversation fields:

- `project_id` (nullable for global threads)
- `model_provider`, `model_id`, `thinking_level`
- `worktree_path`
- `access_mode` (`secure` / `open`)

## 5. Workspace State and Frontend Orchestration
`WorkspaceProvider` (exported from `src/features/workspace/store.tsx`, implemented in `src/features/workspace/store/provider.tsx`) is the main state engine.

Workspace state implementation is now split by responsibility:

- `src/features/workspace/store.tsx`: compatibility entrypoint re-exporting `WorkspaceProvider` + `useWorkspace`
- `src/features/workspace/store/provider.tsx`: provider hooks, IPC wiring, commands, and memoized context value
- `src/features/workspace/store/state.ts`: reducer/action definitions and state helper utilities
- `src/features/workspace/store/pi-events.ts`: Pi runtime event application and snapshot merge logic
- `src/features/workspace/store/context.ts`: `WorkspaceContext` and `WorkspaceContextValue` type

Responsibilities include:

- hydration of projects/conversations/settings
- Pi runtime status and message stream synchronization
- optimistic user message insertion
- queue/retry behavior when upstream returns empty output
- conversation title updates from backend events
- extension notifications and extension main-view open events

## 5.1 Model Cache Initialization
The composer model cache (`src/components/shell/composer/useModelCache.ts`) initializes by loading models via IPC and seeding the in-memory cache with whatever comes back (including an empty list). If the IPC layer returns `null` instead of a structured result, initialization short-circuits and relies on the existing timeout-based recovery to avoid a stuck loading state.

Provider scoping during cache loads is applied defensively: snapshot providers are used when present, but if the snapshot is missing or yields zero matches, the cache falls back to all models so the UI never ends up empty due to a transient config mismatch. If the cache load returns `null`, the cache is marked stale (so recovery paths still fire) instead of aborting in a “loading” state.

## 6. Pi Session Runtime Architecture
`PiSessionRuntimeManager` in `electron/pi-sdk-runtime.ts` creates one Pi runtime per conversation.

Key points:

- Chatons appends additional system-prompt sections after the existing tool/default-behavior prompt sections to:
  - describe the internal thread action suggestions tool in English and instruct the model not to overuse it
  - provide the conversation access mode in the prompt at session preparation time and instruct the model to use the internal `get_access_mode` command/tool if it needs to re-check the live current mode later
  - tell the model that when it is blocked by missing broader filesystem/project context and the current access mode is likely the cause, it should explain that clearly to the user and suggest switching to open mode in the user's language

- runtime cwd selection:
  - conversation worktree if present
  - otherwise project repo
  - otherwise global workspace
- tools cwd differs by access mode:
  - `secure` => conversation runtime cwd
  - `open` => filesystem root (`/` on Unix)
- settings/model registry/auth storage are loaded from Chatons-owned Pi directory
- Pi runtime events are bridged to the log manager from workspace IPC (`electron/ipc/workspace.ts`) and persisted with `source: "pi"` for the log console:
  - `runtime_status` -> `info` (or `error` when status is `error`)
  - `runtime_error` -> `error`
  - other Pi events -> `debug`

## 7. Composer Behavior (Actual)
`src/components/shell/Composer.tsx` implements:

- model picker with scoped/all toggle (`more`)
- in-place scope toggling with star button
- thinking level selector only when model supports it
- per-thread access mode switch (`secure`/`open`)
- access mode controls include an above-toggle popup in `ThreadModelControls` that appears on hover/focus, compares `secure` vs `open` with non-technical copy, and animates in
- LLM-suggested thread action badges rendered above the textarea:
  - driven by a new internal extension UI event `set_thread_actions`
  - limited to 4 actions
  - each action contains a short badge label and the message text to inject into the composer
  - badges are cleared when the user clicks one or sends any message
  - layout shares the same area above the input as existing composer-adjacent elements, so it must coexist with attachments / queue / modifications panel without overlap
- attachments pipeline:
  - images => image payload
  - small text => inline content block
  - binary/large => base64 preview text
- auto-title request on first send in a new thread
- queued message behavior while runtime is busy
- live modifications panel with per-file inline diff navigation

Thread timeline file-change summaries:

- workspace store now captures a per-conversation git baseline when the first user prompt is sent
- on each `tool_execution_end` runtime event, the store fetches current git summary, computes recent changes since the previous snapshot (`computeRecentChangedFiles`), and emits an assistant message block with `content: [{ type: "fileChanges", label: "Modifié", files: [...] }]`
- `MainView` parses this `fileChanges` block and renders compact clickable rows in-thread using existing `chat-file-change-*` styles
- clicking a timeline file-change row lazily calls `window.chaton.getGitFileDiff(conversationId, filePath)` and expands an inline unified diff below that row
- duplicate snapshots are suppressed with a per-conversation signature cache so unchanged repeated tool-end events do not spam the timeline
- transitions to a clean file state (for example after commit/reset/stage-only state transitions) are ignored in timeline rows so only newly changed files are surfaced
- to reduce cross-thread false positives, timeline file-change rows are emitted only when the detected diff change follows a recent `edit` tool execution in the same conversation (currently a small time window heuristic around `tool_execution_start`/`tool_execution_end`)

Reusable model controls:

- `src/components/model/ThreadModelControls.tsx` is now the shared model control component used by composer-level UI.
- `src/components/model/ModelScopePicker.tsx` is a shared scoped-model list + star toggle used in settings/onboarding flows.
- Composer-specific wrapper remains in `src/components/shell/composer/ComposerModelControls.tsx` for local wiring only.

Extension-facing model picker support:

- Extension main views now receive an injected browser helper: `window.chatonUi.createModelPicker(...)`.
- Injection is performed in `electron/extensions/runtime.ts` when composing extension HTML (`getExtensionMainViewHtml`).
- Extension main views are rendered in a dedicated full-width, full-height host container in `src/components/shell/ExtensionMainViewPanel.tsx` so webviews can use the full available main-panel space instead of the standard 920px content column and viewport-estimated iframe height.
- Current built-in automation extension uses this helper in its create-rule modal.
- Contract summary:
  - `const picker = window.chatonUi.createModelPicker({ host, onChange, labels? })`
  - `picker.setModels([{ id, provider, key, scoped }])`
  - `picker.setSelected(modelKey | null)`
  - `picker.getSelected()`
  - `picker.destroy()`

Providers & Models settings behavior:

- In the add-provider modal (`ProvidersModelsSection`), API key is optional for `ollama`, `lmstudio`, and `custom`.
- For other presets, base URL and API key are required to enable provider creation.
- On `pi:updateModelsJson`, backend sanitization now auto-resolves provider `baseUrl` for common OpenAI-compatible variants by probing `GET <candidate>/models` with short timeout and persisting the first reachable candidate (`/v1`, trailing slash, and origin variants).
- A dedicated IPC helper `pi:resolveProviderBaseUrl` is also exposed for UI-level use, returning resolved URL + tested candidates.

`src/components/shell/MainView.tsx` empty-state / quick-actions display logic:

- empty-state quick actions are shown only when runtime messages are empty and no persisted conversation activity exists
- persisted activity fallback uses `conversation.lastMessageAt !== conversation.createdAt` to avoid stale empty-state UI after first exchange during runtime/cache desync

Main view module split:

- `src/components/shell/MainView.tsx` now orchestrates runtime state/effects and high-level layout only
- message/tool parsing helpers live in `src/components/shell/mainView/messageParsing.ts`
- tool block primitives live in `src/components/shell/mainView/ToolBlocks.tsx` with terminal sanitization in `src/components/shell/mainView/terminal.ts`
- message row rendering is isolated in `src/components/shell/mainView/ChatMessageItem.tsx`
- hero and extension request modal are isolated in `src/components/shell/mainView/HeroMascot.tsx` and `src/components/shell/mainView/ExtensionRequestModal.tsx`


## 8. Worktree Lifecycle and Current Limits
Worktrees are **not created automatically** anymore for project conversations.

## 8.1 Project command terminal popup
Project conversations now expose a topbar terminal entry point implemented in:

- `src/components/shell/Topbar.tsx`
- `src/components/shell/ProjectTerminalDialog.tsx`
- `electron/ipc/workspace.ts`

Current behavior:

- renderer asks backend for detected runnable commands through `workspace:detectProjectCommands`
- backend infers project type heuristically from repository files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, `CMakeLists.txt`, etc.)
- Node projects read common scripts from `package.json` and prioritize typical script names (`start`, `dev`, `test`, `build`, `lint`, `preview`)
- Python/Rust/Go/C-like projects expose a small curated set of common commands based on detected files
- users can also run a custom shell command from the project terminal popup
- custom commands are persisted in SQLite per project and the 5 most recently used commands are kept as history
- starting a command creates an in-memory terminal run tracked in Electron main process
- renderer polls `workspace:readProjectCommandTerminal` for incremental stdout/stderr/meta events and renders them in tabbed popup UI
- closing/stopping a running tab terminates the spawned child process via `SIGTERM`
- project terminal commands are the explicit host-execution exception in Chatons: they must run against host machine executables, not Chatons internal Pi/sandbox command helpers
- packaged-app process launch now rebuilds a host-oriented execution environment for project terminal commands before `spawn(...)`, including a synthesized `PATH` and explicit executable resolution (for example `node`, `npm`); this avoids `spawn npm ENOENT` when Electron is launched without the user's interactive shell environment while still preserving host-command execution semantics

Important current limitation:

- this is a live output runner, not a fully interactive PTY terminal (no stdin/session emulation yet)
- command detection is heuristic and does not yet inspect every toolchain-specific config file or task runner

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
- changelog card appears for unseen version and disappears after its dialog is closed
- update checks are cached per app load (first check per session hits GitHub; subsequent checks reuse the cached result)

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

Extension installation behavior:

- builtin extensions are enabled directly in the registry and do not require npm install
- published user extensions are installed with a real `npm install <package> --no-save` executed in the per-extension directory under `~/.chaton/extensions/<package-name>`
- `~/.chaton/extensions/<package-name>` is the canonical runtime location for user extensions
- the runtime still supports legacy fallback lookup under `~/.chaton/extensions/extensions/<package-name>` so older local layouts continue to resolve during migration
- install state is tracked in-memory by the main process (`idle` / `running` / `done` / `error` / `cancelled`)
- renderer polls install state through `extensions:installState` IPC while showing a spinner banner
- renderer can cancel an active install through `extensions:cancelInstall`; current implementation sends `SIGTERM` to the spawned npm process
- install stdout/stderr is appended to `~/.chaton/extensions/logs/<extension>.install.log` and surfaced by the existing extension logs UI

### 10.1 Registry and install manager
`electron/extensions/manager.ts` handles registry at:

- `~/.chaton/extensions/registry.json`

Catalog sources:

- bundled entries
- npm discovery cache for published extensions matching `@user/chatons-extension-name`

Install behaviors:

- builtin install toggles registry entries
- npm install currently creates extension folder and writes minimal `package.json`
- remove is blocked for builtin registry entries

### 10.2 Runtime manifest loading
`electron/extensions/runtime.ts` initializes runtime manifests from:

- built-in automation manifest
- installed extension directories containing `chaton.extension.json`

Runtime path resolution rules:

- canonical user extension root: `~/.chaton/extensions/<extension-id>`
- legacy fallback root: `~/.chaton/extensions/extensions/<extension-id>`
- once a manifest is found, the runtime keeps that resolved extension root for HTML, asset, icon, and server-start resolution
- normalized runtime manifests preserve declared `server` metadata so `server.start` auto-launch works for user extensions

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
- LLM tool exposure (`llm.tools`)
- extension server auto-start (`server.start`)

Extension LLM tools in thread runtime:

- extensions can now declare `llm.tools[]` in `chaton.extension.json`
- each tool is bridged to a same-name exposed extension API via `extensionsCall(...)`
- Chatons injects these tools into Pi sessions through `createAgentSession({ customTools })`
- result: tools become available to the model during normal thread turns, not only in extension UIs
- current bridge returns API result payloads back to the model as JSON text tool output
- safeguard: exposed tool names are normalized to Pi/OpenAI-compatible format `^[a-zA-Z0-9_-]+$`; original manifest API names are preserved for extension call routing and runtime warnings are logged when normalization occurs

Queue semantics:

- at-least-once style
- states: queued/processing/done/dead
- exponential retry + dead-lettering
- idempotency key dedup for enqueue

### 10.4 Channel extensions
Chatons now defines a documented extension profile named `Channel`.

A Channel extension is a bridge between Chatons and an external messaging platform such as Telegram or WhatsApp.

Current contract status:
- Channel extensions are implemented on top of the existing extension platform (`chaton.extension.json`, capabilities, exposed APIs, optional `llm.tools`)
- they are identified by manifest field `kind: "channel"`
- inbound Channel messages are intended to be routed to **global threads only** (`project_id = null`)
- Channel extensions must not write inbound external messages into project conversations
- Channel extensions are not allowed to appear as standalone sidebar entries from their own `ui.menuItems`
- when at least one enabled Channel extension is installed, Chatons shows a dedicated `Channels` navigation item below `Extensions`; that screen lists installed Channel integrations and opens their configuration views
- the recommended V1 API contract is documented in `docs/EXTENSIONS_CHANNELS.md`

Recommended exposed APIs for this profile:
- `channel.connect`
- `channel.disconnect`
- `channel.status`
- `channel.receive`
- `channel.send`

Important current limitation:
- the extension runtime does not yet expose a first-class host bridge dedicated to injecting external inbound messages into conversations, so full Channel delivery behavior may require additional host-side support

### 10.5 Extension server auto-start
Extensions can declare a local server process to run at startup or before opening a main view. This is useful for UI servers or local webhooks.

Manifest example:

```json
{
  "server": {
    "start": {
      "command": "node",
      "args": ["index.js"],
      "readyUrl": "http://127.0.0.1:4317/api/status",
      "readyTimeoutMs": 12000
    }
  }
}
```

Behavior:
- The host starts the process at app startup and before loading `ui.mainView` HTML.
- `readyUrl` is polled until it returns HTTP 200.
- The process is launched with `CHATON_EXTENSION_ID`, `CHATON_EXTENSION_ROOT`, and `CHATON_EXTENSION_DATA_DIR` env vars.
- Extension UIs can also register a server at runtime with `window.chaton.registerExtensionServerFromUi(...)`.

### 10.6 Telegram Channel reference extension (user extensions)
A user-installed reference extension is canonically placed under:

- `~/.chaton/extensions/@user/chatons-channel-telegram/`

Legacy fallback also resolves during migration:

- `~/.chaton/extensions/extensions/@user/chatons-channel-telegram/`

Current shape:
- local user extension, not bundled as a built-in extension
- manifest kind: `channel`
- main view: `telegram.main`
- uses the injected Chatons model selector via `window.chatonUi.createModelPicker(...)`
- exposes `channel.connect`, `channel.disconnect`, `channel.status`, `channel.receive`, `channel.send`, `telegram.poll_once`, `telegram.get_updates`

Current implementation boundary:
- configuration, status, test send, update inspection, queue persistence, and Channel classification are implemented
- the host now provides generic Channel bridge methods that any extension can use to create/reuse global threads and inject external inbound messages
- the Telegram reference extension uses the selected model key when creating mapped global conversations

### 10.7 Built-in automation extension
Built-in extension ID: `@chaton/automation`

Provides:

- main view UI (`index.html` + `index.js`)
- APIs: `automation.rules.list/save/delete`, `automation.runs.list`
- trigger topics:
  - `conversation.created`
  - `conversation.message.received`
  - `project.created`
  - `conversation.agent.ended`

### 10.8 Built-in memory extension
Built-in extension ID: `@chaton/memory`

Provides:

- main view UI (`electron/extensions/builtin/memory/index.html`, `electron/extensions/builtin/memory/index.js`)
- APIs: `memory.upsert`, `memory.search`, `memory.get`, `memory.update`, `memory.delete`, `memory.list`
- LLM tools with the same names, exposed in normal thread sessions through the extension runtime bridge
- internal persistence in SQLite table `memory_entries`
- two scopes:
  - `global`: personal/user memory across all projects
  - `project`: memory tied to a specific project id

Embedding implementation status:

- current implementation uses a tiny built-in local embedding strategy based on normalized character trigrams hashed into a fixed-size vector (`chatons-local-hash-trigram-v1`)
- this is intentionally embedded directly in Chatons runtime, requiring no external model, no extra download, and no network dependency
- it is lightweight and functional for short factual memory retrieval, but it is not equivalent to a neural embedding model
- if Chatons later ships a native on-device embedding model, this extension should remain API-compatible and may swap the embedding backend transparently

## 11. How to Create an Extension That Works Today
This section reflects the actual current mechanics.

### 11.1 Create extension files
Under the canonical extensions base dir:

- `~/.chaton/extensions/<your-extension-id>/chaton.extension.json`
- web assets referenced by `webviewUrl` (for example `index.html`, `index.js`)

Legacy fallback lookup under `~/.chaton/extensions/extensions/<your-extension-id>/` is still supported by the runtime, but new extensions should be created in the canonical location above.

Extension display name:

- `chaton.extension.json` must include a human-readable `name`.
- The app uses the manifest `name` as the primary display label in the UI.
- The npm package name / extension `id` is still shown in specific metadata areas (for example ID rows and diagnostics), but not as the primary title.

Minimal manifest:

```json
{
  "id": "@chaton/my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "icon": "assets/icon.png",
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

Icon handling:

- `icon` can be a Lucide icon name (for example `Gauge`) or a relative asset path inside the extension folder (for example `assets/icon.png`).
- Asset paths are resolved against the extension root and rendered via data URLs in the Extensions and Channels UIs.

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
Provider cards in onboarding (`.onboarding-provider-card` in `src/styles/components/onboarding.css`, imported via `src/index.css`) intentionally use a transparent background in both light and dark themes (with visible borders) for better readability against the onboarding shell/card backgrounds.
The Mistral preset is visually flagged with a gold star badge (`.onboarding-provider-preferred-star`) to mark it as preferred without changing selection logic.
Provider-card clicks in onboarding Step 1 trigger a smooth scroll to the provider form/API key block (`providerFormRef`) so the credential fields are brought into view after selection.
For `Custom` provider flows (onboarding and settings modal), preset selection and typed provider name are intentionally managed in separate states so typing the custom name does not switch UI mode and collapse the custom form.
The log console now uses dedicated theme classes (`.log-console-*`) in `src/components/LogConsole.tsx` with explicit light/dark overrides in `src/styles/components/log-console.css` (imported via `src/index.css`) to keep overlay, panel, filter controls, and row hover/readability consistent across modes.
Builtin extension webviews must also account for Chatons light/dark mode explicitly. The Automation extension now mirrors the parent document `dark` class into its webview document and uses theme tokens with dark overrides in `electron/extensions/builtin/automation/components.js`, so extension surfaces/cards/modals remain readable in both modes instead of staying hardcoded to a light palette.

Skills/extensions library UI refresh:
- `src/components/shell/PiSkillsMainPanel.tsx` and `src/components/shell/ChatonsExtensionsMainPanel.tsx` now use bespoke premium library layouts instead of the generic settings-card stack
- shared visual treatment for these two panels lives in `src/styles/components/settings.css` with matching dark-mode overrides in `src/styles/components/dark.css`
- design intent: keep management/discovery flows visually aligned with the rest of Chatons while preserving existing install/toggle/remove behaviors

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
- dev runs started with `npm run dev` do not initialize Sentry, so no telemetry is emitted in local development even if consent is enabled

## 15. Public website deployment
Current intended Vercel deployment split:

- `docs/` is the production web app for `https://chatons.ai`
- `landing/` remains a separate standalone Vite app that can be deployed independently on another Vercel project/domain if desired
- docs navigation now uses root-relative documentation paths (for example `/getting-started`) instead of `/docs/...`
- Fumadocs source loader base URL is `/` so sidebar and internal links resolve correctly at domain root

## 16. Recommended Documentation Policy
For reliable docs going forward:

1. treat these guides as source of truth
2. update docs in same PR as feature behavior changes
3. add explicit “current limitations” section for partially implemented features
4. avoid documenting planned behavior as shipped behavior
Sidebar settings persisted in `app_settings.sidebar` now include:

- `allowAnonymousTelemetry` (boolean)
- `telemetryConsentAnswered` (boolean)
