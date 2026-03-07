# Chatons Developer Guide

## 1. Architecture at a glance

Chatons is an Electron desktop application with a React renderer and a Pi-based AI runtime.

At a high level, the app is made of five layers:

1. **Electron main process** for boot, IPC, persistence wiring, updates, and host integrations
2. **React renderer** for the application UI
3. **Pi runtime bridge** for per-conversation AI sessions
4. **SQLite storage** for app data, caches, automations, extension state, and memory
5. **Extension runtime** for built-in and user-installed extensions

Core entry points worth knowing:

- `electron/main.ts`
- `electron/ipc/workspace.ts`
- `electron/pi-sdk-runtime.ts`
- `src/features/workspace/store/provider.tsx`
- `electron/extensions/runtime.ts`

---

## 2. Main technology choices

Current stack in the codebase:

- **Desktop shell:** Electron
- **Renderer UI:** React + TypeScript
- **Localization:** i18next
- **Database:** SQLite through `better-sqlite3`
- **AI runtime:** `@mariozechner/pi-coding-agent`
- **Git support:** mixed approach using app logic plus Git helpers
- **Extension host:** Chatons-specific runtime in Electron main process

The app also contains public web properties in the repository, but the desktop application is the primary runtime discussed in this guide.

---

## 3. How app startup works

### Main-process boot

On startup, `electron/main.ts` does the following important work:

1. sets the application name to `Chatons`
2. forces Electron `userData` to a Chatons-specific directory
3. initializes logging
4. bootstraps the internal Pi agent directory
5. initializes the Pi manager
6. initializes telemetry when allowed and not in dev mode
7. cleans up orphaned worktrees
8. registers IPC handlers
9. creates the main browser window

### User data location

Chatons overrides Electron's default user data path and uses:

- `<appData>/Chatons`

This matters because many runtime files are stored relative to that location.

### Loading gate in the renderer

`src/App.tsx` blocks the normal interface until workspace hydration is complete.

While loading, it renders `LoadingSplash` instead of allowing a blank or half-initialized UI.

---

## 4. Pi integration: what is actually used

Chatons depends heavily on Pi, but it does **not** depend on a user manually running a global Pi install in day-to-day app usage.

### Internal Pi agent directory

Chatons uses a dedicated Pi directory under user data:

- `<userData>/.pi/agent`

`electron/ipc/workspace.ts` bootstraps that directory and ensures these files or folders exist:

- `settings.json`
- `models.json`
- `auth.json`
- `sessions/`
- `worktrees/chaton/`
- `bin/`
- global workspace directory under `<userData>/workspace/global`

### CLI execution path

For Pi CLI-style commands such as model sync and skill management, Chatons prefers its internal runtime.

The intended execution path is:

- bundled `@mariozechner/pi-coding-agent/dist/cli.js` when available
- otherwise fallback paths under the Chatons-managed agent area

The important product-level consequence is this:

- Chatons uses its own Pi runtime and config directory
- it is not relying on a user-global shell setup as the source of truth

### Configuration files that matter

The main Pi files are:

- `settings.json`
- `models.json`
- `auth.json`

Their roles are:

- `settings.json`: settings such as `enabledModels`
- `models.json`: provider definitions and available models
- `auth.json`: provider credentials for runtime auth

### Model scoping

Chatons follows Pi's scoped-model concept.

The actual source of truth for model scope is:

- `settings.json > enabledModels`

Chatons does not keep a UI-only model scope layer. When the user stars or unstars a model, it updates actual Pi config.

---

## 5. Provider and auth synchronization

Chatons actively synchronizes provider credentials between `models.json` and `auth.json`.

This happens because the current implementation supports both storage shapes and keeps them aligned.

Implemented behavior:

- if `models.json` contains `provider.apiKey` and auth is missing, Chatons can populate `auth.json`
- if `auth.json` contains API key credentials, Chatons can mirror them back into `models.json`
- `auth.json` is proactively created during bootstrap if missing

This synchronization is part of why provider edits made through Chatons stay usable by the Pi runtime.

### Auth diagnostics

On auth-related runtime failures such as `401` or missing credentials, Chatons appends a sanitized debug suffix to runtime error information.

That suffix can include:

- provider id
- credential source
- masked key preview
- short fingerprint

Raw keys are not logged.

---

## 6. Per-conversation Pi runtimes

Chatons does not use one giant shared AI session for the whole app.

Instead, `PiSessionRuntimeManager` in `electron/pi-sdk-runtime.ts` creates a runtime per conversation.

### Runtime working directory

The runtime cwd is chosen in this order:

1. conversation worktree if present
2. project repository if present
3. global workspace directory

### Access mode and tool cwd

The assistant access mode affects tool execution scope.

Implemented behavior:

- `secure` mode uses the conversation runtime cwd
- `open` mode uses filesystem root (`/` on Unix, drive root on Windows)

That is the key mechanical difference behind the user-facing access-mode toggle.

### Runtime prompt composition

Chatons appends additional system prompt guidance at session creation time.

Current prompt additions include guidance about:

- thread action suggestions
- current conversation access mode
- how the model should behave when secure mode blocks broader filesystem context

The runtime also exposes `get_access_mode` so the model can re-check the live mode instead of relying only on startup context.

### Runtime event bridge

Pi runtime events are forwarded into the renderer and also logged through Chatons logging infrastructure with `source: "pi"`.

---

## 7. Renderer state and orchestration

The main renderer state engine is the workspace store.

Important files:

- `src/features/workspace/store.tsx`
- `src/features/workspace/store/provider.tsx`
- `src/features/workspace/store/state.ts`
- `src/features/workspace/store/pi-events.ts`
- `src/features/workspace/store/context.ts`

Responsibilities include:

- hydrating projects, conversations, and settings
- tracking Pi runtime state by conversation
- inserting optimistic user messages
- applying runtime events to message state
- coordinating notices and extension interactions

The UI relies heavily on this store rather than scattering backend state across many local components.

---

## 8. Data model and SQLite tables

Database migrations live in:

- `electron/db/migrations/`

Current migration files include:

- `001_init.sql`
- `002_pi_rpc.sql`
- `003_pi_models_cache.sql`
- `004_pi_models_thinking.sql`
- `005_conversation_worktree.sql`
- `006_conversations_project_nullable.sql`
- `007_conversation_access_mode.sql`
- `008_extensions_platform.sql`
- `009_quick_actions_usage.sql`
- `010_memory_extension.sql`
- `011_project_custom_terminal_commands.sql`

### Core tables currently used

Important tables referenced by the code include:

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

### Important conversation fields

A conversation currently stores, among other things:

- `project_id`
- `model_provider`
- `model_id`
- `thinking_level`
- `worktree_path`
- `access_mode`
- runtime error state

That is why model choice, worktree state, and access mode remain tied to a thread rather than being just UI state.

---

## 9. Composer behavior

The composer implementation is in:

- `src/components/shell/Composer.tsx`
- `src/components/shell/composer/*`

### What the composer handles

The current composer handles:

- free text input
- attachments
- model selection
- thinking level
- access mode
- queued outgoing messages
- suggested thread action badges
- thread-scoped file modifications panel

### Queueing behavior

If the runtime is busy, messages are not discarded.

Instead, the UI queues them. The queue is visible and editable.

### Suggested thread actions

The runtime can emit `set_thread_actions`, and the renderer displays up to 4 action badges above the textarea.

Those badges are ephemeral:

- click one and it prefills the composer
- send any message and they are cleared

### Attachment pipeline

Current behavior in the composer attachment pipeline:

- images -> image payloads
- small text files -> inline text blocks
- binary or large content -> preview/base64-style fallback representation

---

## 10. Model loading and cache behavior

The renderer uses a dedicated hook for model loading:

- `src/components/shell/composer/useModelCache.ts`

### Current cache strategy

The hook:

- tries `listPiModels()` first
- keeps an in-memory cache with timestamps
- can refresh via `syncPiModels()`
- applies provider filtering from the Pi config snapshot

Important defensive behavior in the implementation:

- if configured providers exist but no models match, the UI falls back to all models instead of showing an empty picker
- if cache loading returns an empty result, the hook still updates state rather than staying stuck forever in loading mode

The goal is resilience more than perfect elegance.

---

## 11. Main view behavior

`src/components/shell/MainView.tsx` is the high-level renderer for the main panel when a conversation is selected.

### Empty state rules

The empty-thread hero and quick actions are shown only when:

- there are no runtime messages
- there is no persisted activity for the conversation
- there is no pending message being processed
- the runtime is not currently streaming

The implementation also checks persisted message timestamps to avoid stale empty states after a first exchange.

### Full-width extension views

When the user opens an extension main view, Chatons renders it in a dedicated host panel designed for full-width and full-height usage.

This is important for extension authors: your main view is not limited to the standard 920px conversation column.

---

## 12. Worktrees: current behavior and limits

Worktree support exists, but it should be understood as a partially mature subsystem.

### Creation model

Worktrees are **not** created automatically for project conversations.

A worktree is created only when the user explicitly enables it for that thread.

### UI entry point

The top bar branch icon toggles worktree mode for the current conversation.

### Implemented actions

The worktree dialog supports actions such as:

- inspect worktree info
- generate a commit message suggestion
- commit
- merge into the base branch
- push
- open in VS Code

### Limits that are real today

The current implementation is not full Git parity.

Known examples from the code:

- some worktree metadata is approximate
- ahead/behind and merged checks are not fully authoritative in all paths
- push is currently unavailable in self-contained mode
- commit and merge flows are implemented, but not every field or path should be treated as canonical Git truth

If you change this area, documentation updates are mandatory because users are relying on these caveats.

---

## 13. Project terminal subsystem

The project terminal feature is implemented through:

- `src/components/shell/Topbar.tsx`
- `src/components/shell/ProjectTerminalDialog.tsx`
- workspace IPC handlers in Electron

### How it works today

The renderer asks the backend to detect runnable commands for a project conversation.

Detection is heuristic and based on files such as:

- `package.json`
- `pyproject.toml`
- `Cargo.toml`
- `go.mod`
- `Makefile`
- `CMakeLists.txt`

Users can also run custom commands.

### Command history

Custom command history is persisted, and the current implementation keeps recent entries for the project.

### Execution model

A started command creates an in-memory terminal run in the Electron main process.

The renderer polls for incremental output and metadata updates.

Important limitation:

- this is not an interactive PTY terminal
- it is a managed process runner with streamed output

### Host environment behavior

Project terminal commands are deliberately run from the host environment, not through the Pi runtime helpers.

This exception is important. If you are debugging command execution behavior, do not assume it follows the same path as Pi tool execution.

---

## 14. Extension platform overview

Chatons has a real extension platform with:

- a registry file
- runtime manifest loading
- capability-gated APIs
- extension storage
- extension queueing
- main view hosting
- optional server startup
- optional LLM tools

Primary files to know:

- `electron/extensions/manager.ts`
- `electron/extensions/runtime.ts`
- `electron/extensions/runtime/*`
- `docs/EXTENSIONS.md`
- `docs/EXTENSIONS_CHANNELS.md`
- `docs/EXTENSIONS_UI_LIBRARY.md`

### Registry file

Installed extension state is stored in:

- `~/.chaton/extensions/registry.json`

### Canonical user extension location

User extensions are installed under:

- `~/.chaton/extensions/<extension-id>`

A legacy fallback path is still supported:

- `~/.chaton/extensions/extensions/<extension-id>`

### Built-in extensions

The registry always includes built-in entries for:

- `@chaton/automation`
- `@chaton/memory`

### Auto-discovery

When the registry is read, Chatons also scans extension directories and can auto-add valid on-disk extensions it finds.

That makes local extension development easier because a manually dropped extension can appear without going through the normal catalog install path first.

---

## 15. Runtime manifest loading

The extension runtime initializes manifests at startup.

Current sources:

- built-in automation manifest
- built-in memory manifest
- installed user extension directories containing `chaton.extension.json`

Important current behavior:

- runtime manifest initialization happens at startup
- install or toggle operations do not guarantee a full same-process runtime rebuild
- restart remains the safe path after adding or changing extension files

That limitation should shape how you document and test extension developer workflows.

---

## 16. Capabilities and host APIs

The extension runtime checks capabilities per API family.

The implementation references capabilities for areas such as:

- event subscription and publication
- queue publication and consumption
- KV and file storage
- host calls
- LLM tool exposure
- extension server auto-start

If a capability is missing, the call is rejected.

That means extension manifests are not just descriptive. They are operational.

---

## 17. Creating an extension that works today

If you want to build an extension against the current implementation, use this mental model.

### 17.1 Required files

At minimum, create:

- `~/.chaton/extensions/<your-extension-id>/chaton.extension.json`
- any HTML, JS, or asset files referenced by the manifest

Example minimal manifest:

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

### 17.2 Required manifest fields in practice

You should provide at least:

- `id`
- `name`
- `version`
- `capabilities`
- `ui.mainViews` if the extension has a visible configuration or app view

The `name` matters because the app prefers the manifest display name as the primary UI label.

### 17.3 Getting the extension to appear

The runtime can auto-discover valid extensions on disk, but it still depends on the registry and manifest scan performed at startup.

In practice:

- create the files
- ensure the manifest is valid
- restart Chatons

That is the most reliable workflow today.

### 17.4 Quick actions

Extensions can contribute quick actions.

Chatons currently reads them from extension config and shows at most 2 quick actions per extension in the home quick-action rail.

If you use quick actions with deeplinks, see `docs/EXTENSIONS.md` for the contract.

### 17.5 Main-view access

Your extension's `mainView` is the primary visible surface in Chatons.

Current behavior:

- extension main views are hosted full width
- channel extensions are grouped under the Channels page instead of getting their own sidebar entries
- ordinary extension views can be opened from the extension system or via deeplink paths

---

## 18. Deeplink contract for extension views

When Chatons opens an extension main view with a deeplink, it sends a browser message event to the extension page.

Current payload shape:

```js
window.postMessage({
  type: 'chaton.extension.deeplink',
  payload: {
    viewId: 'my.main',
    target: 'open-create',
    params: {}
  }
}, '*')
```

An extension page should listen for `message` and react based on `payload.target`.

This is the mechanism behind many quick-action-to-extension flows.

---

## 19. Injected extension UI helpers

For extension `mainView` pages, Chatons injects a small UI helper layer under `window.chatonUi`.

Available helpers documented in the repository include:

- `ensureStyles()`
- `createModelPicker(...)`
- `createButton(...)`
- `createComponents()`

This is optional. Extensions remain free to ship their own UI.

What the helper is for:

- make extension pages feel visually aligned with Chatons
- reuse common controls such as the model picker
- reduce duplicate styling work

The current built-in automation extension is the main reference implementation for this shared UI layer.

---

## 20. Extension servers

An extension can declare a local server process in its manifest.

Example shape:

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

Current behavior:

- the host can start the process automatically
- if `readyUrl` is provided, Chatons polls it until it gets HTTP 200 or times out
- the server may be started on app startup and before a main view is loaded

Environment variables exposed to the server include:

- `CHATON_EXTENSION_ID`
- `CHATON_EXTENSION_ROOT`
- `CHATON_EXTENSION_DATA_DIR`

---

## 21. Channel extensions

Channel extensions are a documented extension profile, not a separate platform.

They are identified by:

- `kind: "channel"`

Current product rules implemented around channels:

- enabled channel extensions make the `Channels` sidebar entry appear
- channel entries are shown on a dedicated Channels screen
- inbound channel messages are intended for global threads only
- channel extensions should not present themselves as standalone sidebar items through their own menu entries

The detailed recommended contract is documented in:

- `docs/EXTENSIONS_CHANNELS.md`

### Telegram reference implementation

The repository and runtime documentation reference a Telegram channel extension as a working model.

What matters for developers is the pattern:

- external platform auth and polling are extension-owned
- mapping state is stored by the extension
- Chatons provides the host side for storage, queues, and conversation integration

---

## 22. Built-in automation extension

Built-in extension id:

- `@chaton/automation`

It provides:

- a main view UI
- automation rule APIs
- automation run listing
- subscriptions to built-in trigger topics

Current trigger topics used by the automation system:

- `conversation.created`
- `conversation.message.received`
- `project.created`
- `conversation.agent.ended`

---

## 23. Built-in memory extension

Built-in extension id:

- `@chaton/memory`

It provides APIs and LLM tools for:

- upsert
- search
- get
- update
- delete
- list

### Persistence model

Memory data is stored in the SQLite table:

- `memory_entries`

### Scopes

Current scopes are:

- `global`
- `project`

### Semantic search implementation

The current memory search implementation is local and lightweight.

It uses an embedded hashed trigram vector strategy rather than an external embedding service.

That means:

- no extra model download is required
- no network dependency is required
- retrieval is practical for factual memory lookup
- it should not be described as equivalent to a neural embedding model

---

## 24. Skills vs extensions

These are separate systems and should be documented that way.

### Skills

Managed through Pi commands and Pi catalog logic.

The skills screen calls Pi commands such as listing, installing, and removing skills.

### Extensions

Managed through the Chatons extension registry and runtime.

If you are building something that needs a UI, storage, events, server startup, or host APIs, you are almost certainly building an extension, not a skill.

---

## 25. Updates and platform-specific behavior

Update flow is implemented in `electron/lib/update/update-service.ts` and related IPC.

Current behavior:

- checks GitHub releases
- supports download progress
- exposes apply hooks
- shows changelog UI for unseen versions

### macOS

On macOS, applying an update opens the downloaded DMG in Finder.

This is intentional because the running app does not replace its own bundle in place.

### Windows and Linux

Update application remains more limited than the macOS download-and-open flow.

If you change updater behavior, update docs in the same change.

---

## 26. Telemetry and crash reporting

Chatons supports anonymous error telemetry, but it is gated by user consent.

### Current behavior

- telemetry is not initialized in local dev mode
- renderer errors and unhandled rejections can be forwarded through IPC
- sending is gated by `allowAnonymousTelemetry`
- user consent state is persisted in sidebar settings

Relevant fields in persisted sidebar settings include:

- `allowAnonymousTelemetry`
- `telemetryConsentAnswered`

Sentry is configured as the current telemetry backend.

---

## 27. Documentation references for extension work

If you are creating or editing an extension, the most relevant repository docs are:

- `docs/EXTENSIONS.md`
- `docs/EXTENSIONS_CHANNELS.md`
- `docs/EXTENSIONS_UI_LIBRARY.md`
- `docs/AUTOMATION_EXTENSION.md`

Use those alongside the implementation in:

- `electron/extensions/runtime/`
- `electron/extensions/builtin/automation/`
- `electron/extensions/builtin/memory/`

---

## 28. What to treat as stable and what not to overstate

### Stable enough to document as current product behavior

These areas are clearly implemented and visible in the code:

- internal Pi-managed runtime and config directory
- per-conversation session runtimes
- scoped model selection through Pi settings
- settings, onboarding, and model sync flows
- extension registry and manifest loading
- built-in automation and memory extensions
- channels page and channel extension classification
- project terminal output runner

### Areas that should be documented carefully with caveats

These areas exist, but still have implementation limits or partial behavior:

- worktree parity with Git
- full push flows in worktree mode
- fully interactive terminal behavior
- same-process extension hot reload
- some update apply paths outside macOS

When you change any of those, document both what works and what still does not.
