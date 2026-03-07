# Pi Integration in Chatons

## 1. High-level model

Chatons uses Pi as its coding-agent runtime.

In practice, Pi is responsible for:

- model and provider handling
- session creation
- tool execution inside conversations
- skills commands
- parts of the settings and diagnostics workflow

The desktop app wraps Pi with its own:

- Electron IPC layer
- per-conversation runtime management
- persistent app database
- renderer state and UI

---

## 2. The important Pi directories and files

Chatons keeps a managed Pi directory under:

- `<userData>/.pi/agent`

Key files and directories used there include:

- `settings.json`
- `models.json`
- `auth.json`
- `sessions/`
- `worktrees/chaton/`
- `bin/`

Chatons also maintains a global workspace directory under:

- `<userData>/workspace/global`

These paths are created and managed from the Electron side.

---

## 3. Internal runtime resolution

For Pi CLI-style actions, Chatons prefers its internal runtime.

The intended resolution path is:

- bundled `@mariozechner/pi-coding-agent/dist/cli.js` when available
- otherwise fallback paths under the Chatons-managed agent directory

Key logic lives in:

- `electron/ipc/workspace.ts`

Important methods to know:

- `getBundledPiCliPath()`
- `getPiBinaryPath()`
- `runPiExec()`

### What this means in practice

Chatons app behavior is based on its own Pi runtime wiring and config directory.

It does not depend on a user's shell-level global Pi install being present or configured in the same way.

---

## 4. Configuration files

### `settings.json`

This file stores Pi settings used by the app, including model scope.

Most importantly for the UI:

- `enabledModels` is the source of truth for scoped model selection

### `models.json`

This file stores provider definitions and model information.

### `auth.json`

This file stores provider credentials used for runtime authentication.

Chatons proactively creates this file during bootstrap if needed.

---

## 5. Provider/auth synchronization

Chatons currently keeps provider auth information synchronized between `models.json` and `auth.json`.

That means:

- if provider API keys exist in `models.json` and auth is missing, Chatons can populate `auth.json`
- if credentials exist in `auth.json`, Chatons can mirror them into the provider model configuration when needed

This dual handling exists to keep the app runtime and Pi-side auth behavior consistent.

---

## 6. Model scope behavior

Chatons follows Pi's distinction between:

- all available models
- scoped models

The source of truth for scope is:

- `settings.json > enabledModels`

User-facing implications:

- the normal model picker shows scoped models first
- the `more` action reveals all models
- starring or unstarring a model updates real Pi config, not just UI state

This is consistent across:

- onboarding
- composer model picking
- provider/model settings
- extension model picker helper behavior

---

## 7. Per-conversation Pi sessions

Chatons creates a Pi runtime per conversation through its runtime manager in:

- `electron/pi-sdk-runtime.ts`

### Working directory selection

The runtime cwd is chosen in this order:

1. conversation worktree if present
2. project repository if present
3. global workspace directory

### Access mode effect

Access mode affects tool cwd behavior:

- `secure` mode uses the conversation cwd
- `open` mode uses filesystem root

That difference is what powers the user-visible `secure` / `open` toggle in the composer.

---

## 8. Prompt and runtime additions

At session creation time, Chatons adds host-level prompt guidance around topics such as:

- access mode
- thread action suggestions
- how the assistant should explain secure-mode limitations

The runtime also exposes commands such as `get_access_mode` so the model can check live state while a session is running.

---

## 9. Event bridge

Pi runtime events are bridged back into the renderer.

Examples include:

- message lifecycle events
- tool execution lifecycle events
- compaction events
- retry events
- extension UI requests
- runtime status and error events

Chatons also logs runtime-side events through its logging pipeline with Pi as the source.

---

## 10. Settings manager robustness

The Pi integration includes defensive handling around Pi settings locking.

Current behavior in `electron/pi-sdk-runtime.ts` includes:

- cleanup of stale `settings.json.lock` files older than 5 minutes
- retrying `SettingsManager.create(...)` with exponential backoff

This exists to reduce failures from stale lock state.

---

## 11. Diagnostics and settings UI

The Chatons settings interface exposes Pi-related sections for:

- providers and models
- sessions
- commands
- diagnostics

Diagnostics currently surfaces runtime path information such as:

- Pi path
- settings path
- models path

This makes it easier to debug what runtime the app is actually using.

---

## 12. Skills integration

Skills are managed through Pi commands, not through the Chatons extension runtime.

The Skills panel in the app uses Pi command execution to:

- list installed skills
- search available skills
- install skills
- uninstall skills

This is one of the clearest examples of the distinction between:

- Pi-managed skills
- Chatons-managed extensions

---

## 13. Current source files to trust

The current source of truth lives primarily in:

- `electron/ipc/workspace.ts`
- `electron/pi-sdk-runtime.ts`
- the workspace store and related renderer components

---

## 14. What is safe to rely on today

These points are clearly implemented:

- Chatons uses an internal managed Pi directory
- model scope is driven by Pi settings `enabledModels`
- Pi sessions are created per conversation
- access mode changes the effective tool cwd
- the app routes Pi runtime events into the renderer
- Pi is the backend used for skills management

---

## 15. What to document carefully

A few things should be described precisely rather than broadly:

- Chatons is Pi-backed, but the app wraps Pi with its own runtime and UI model
- the project terminal is a separate host command runner and not the same thing as Pi tool execution
- global shell Pi setup is not the source of truth for the desktop app runtime

If Pi wiring changes, this file and the main user/developer guides should be updated in the same change.
