# Pi Integration for Chatons

**For:** Maintainers, contributors, and developers working on Chatons runtime behavior

**Related:** See also `docs/PI_INTEGRATION.md` for user-facing integration details and `docs/CHATONS_DEVELOPER_GUIDE.md` for overall architecture.

---

## 1. Why Pi Exists in Chatons

Chatons uses [Pi Coding Agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) as its conversation runtime. This choice means:

- **Single source of truth for model/provider handling** — Pi manages the model registry, credentials, and API compatibility
- **Reusable conversation logic** — Rather than rebuilding session management, we use Pi's proven approach
- **Skills system included** — Pi's skills marketplace is available to users without reimplementation
- **Tool execution environment** — Pi handles read, bash, edit, write, and other developer tools

Chatons wraps this with its own:

- Electron IPC layer for cross-process communication
- Per-conversation runtime management
- SQLite database for app-level persistence
- React UI and workspace state
- Extension runtime for third-party integrations, including packaged extension web apps and topbar widgets served from `chaton-extension://<extension-id>/...`
- Packaged extension package-manager flows that run `npm` through Electron's embedded Node runtime with a bundled `npm` CLI, instead of depending on system `node`/`npm` being present in the desktop app PATH
- Local extension servers that declare a `readyUrl` are allowed to reuse an already-live local service instead of forcing a second bind on the same port; readiness should follow the health endpoint, not only the newly spawned child process
- Dev-only Electron automation runs may opt out of the single-instance lock by setting `CHATON_ALLOW_AUTOMATION_INSTANCE=1`; use this only for automated QA harnesses that must attach to a separate real app window without shutting down the primary dev session

---

## 2. How Chatons Boots Pi

### App-Level Bootstrap

When Chatons starts, `electron/main.ts` and `electron/ipc/workspace.ts` perform these initialization steps:

1. **Create managed Pi directory** at `<userData>/.pi/agent/`
2. **Ensure configuration files exist:**
   - `settings.json` (model scope, themes, preferences)
   - `models.json` (provider definitions and model metadata)
   - `auth.json` (credentials for API keys and OAuth tokens)
   - `sessions/` directory (Pi session state)
   - `worktrees/chaton/` directory (Git worktree storage)
3. **Normalize provider base URLs** by probing URL variants and preferring generation-compatible endpoints (`/chat/completions` or `/responses`) in addition to `/models`
4. **Initialize the Pi manager** via Pi SDK

### Why Managed Pi, Not User's Global Pi

The app forces its Pi environment via `PI_CODING_AGENT_DIR` pointing to `<userData>/.pi/agent`. This means:

- **App behavior is deterministic** — It doesn't depend on user's shell-level Pi config
- **Credentials are app-scoped** — API keys and OAuth tokens live in the app's config directory
- **Model scope is app-scoped** — The `enabledModels` setting controls what the app sees, not what a user's global Pi install sees
- **Skills and settings are isolated** — Each Chatons instance manages its own environment

This design allows multiple Chatons versions or other Pi-based applications to coexist without interference.

### Cloud Project Exception

Cloud projects are not backed by the managed local Pi directory.

For a cloud project:

- the desktop app authenticates against Chatons Cloud in the system browser
- the desktop app stores only the resulting desktop session locally
- project and conversation state are hydrated from the cloud bootstrap API
- cloud conversation message history is read from and persisted back to the cloud control plane
- provider credentials, OAuth tokens, model access, and runtime execution remain organization-owned in the cloud
- the browser-side cloud portal in `landing/` may collect signup, organization, and provider data, but it is only a thin client over `cloud-api`; it must not become a second source of truth
- unless a deployment explicitly overrides `VITE_CHATONS_CLOUD_API_URL`, the browser-side cloud portal should default its web auth/bootstrap calls to `https://cloud.chatons.ai` rather than any localhost control-plane URL
- in the default hosted layout, `cloud-api` should also be configured with `CHATONS_CLOUD_PUBLIC_URL=https://cloud.chatons.ai`; `api.chatons.ai` may remain a direct alias to the same service while `realtime.chatons.ai` stays dedicated to websocket traffic
- because the hosted `cloud.chatons.ai` ingress may point directly at `cloud-api`, the control plane must keep lightweight fallback GET pages for `/cloud/login` and `/cloud/signup` in addition to the JSON `POST /v1/web/*` auth endpoints used by the richer landing client
- password-based web auth, email verification, and password recovery for Chatons Cloud must also remain control-plane owned; mail tokens and SMTP delivery belong to `cloud-api`, not to the desktop app or landing-only client state
- complimentary cloud subscription grants assigned by admins must also remain control-plane owned and time-aware; the effective plan used for quota checks is the active grant if one exists, otherwise the user's stored baseline plan
- cloud subscription, quota, project access, conversation ownership, and websocket authorization must be derived server-side by the cloud control plane, never trusted from desktop-supplied headers or request bodies
- internal service-to-service routes between `cloud-api`, `cloud-realtime`, and `runtime-headless` must require a shared service credential; network reachability alone is not sufficient authorization
- the desktop app must not create a local Pi session as a fallback
- the cloud web onboarding may open the desktop with `chatons://cloud/connect?base_url=...`; the desktop must then start its own browser auth flow and only treat `chatons://cloud/auth/callback` as the real auth callback

---

## 3. Configuration Source of Truth

### `settings.json`

Stores Pi-level preferences and scoped model selection.

Key fields relevant to Chatons:

```json
{
  "enabledModels": ["provider/modelId", "provider/modelId"],
  "theme": "dark",
  "defaultModel": "provider/modelId",
  "defaultProvider": "provider"
}
```

**What matters:**

- `enabledModels` is the single source of truth for scoped model selection
- When a user stars/unstars a model in the UI, `enabledModels` is updated
- The app reads this array to populate the model picker

**Validation logic:** `electron/ipc/workspace.ts` lines 1510-1520 sanitize this field

### `models.json`

Describes available providers and their models.

Structure (simplified):

```json
{
  "providers": {
    "provider-id": {
      "name": "Provider Name",
      "baseUrl": "https://api.example.com/v1",
      "models": [
        { "id": "model-name", "maxTokens": 4096, ... }
      ]
    }
  }
}
```

**What matters:**

- This file is the registry Pi uses to load available models
- Chatons UI reads this to display model lists
- Provider base URLs are normalized here during setup
- Provider model lists must remain in `models.json` even when API keys are migrated to `auth.json`; model visibility must not depend on credentials being duplicated in both files
- For custom providers that define a `models` array, `models.json` must still satisfy Pi's schema validation even when the real credential lives only in `auth.json`; otherwise Pi rejects the entire custom-model registry and the UI collapses to `0 models`
- For custom HTTP providers, probing and model discovery use a main-process Node HTTP client rather than relying on Electron's ambient `fetch`, because packaged-app runtime behavior may differ from terminal/dev mode on local-network endpoints

**Loading logic:** `electron/ipc/workspace.ts` lines 1320+ handle model discovery and deduplication

### `auth.json`

Stores credentials (API keys and OAuth tokens).

Structure:

```json
{
  "provider-id": {
    "type": "api-key",
    "key": "sk-..."
  },
  "provider-id-oauth": {
    "type": "oauth",
    "access": "...",
    "refresh": "...",
    "expires": 1234567890
  }
}
```

**Important:**

- API keys and OAuth tokens are stored here, not in `models.json`
- Chatons may synchronize credentials between `models.json` and `auth.json` for compatibility
- OAuth flows store credentials here after successful login
- Writes to `auth.json` should be atomic (temp file + rename), matching the rest of the managed Pi config files
- Known local no-auth providers such as `lmstudio`, `ollama`, `local`, and `localhost` must not be backfilled into `auth.json` during runtime startup; otherwise Pi sessions can resurrect stale `api_key` entries and incorrectly fail on keyless local endpoints
- Those same local providers may still carry `apiKey: "!"` inside `models.json` as a Pi schema-compatibility sentinel when they define explicit custom models. Treat that bare `!` as a literal placeholder, not a shell-command config value, or Pi will resolve it to nothing and reject local model switches with false `No API key` errors.

---

## 4. Per-Conversation Runtime Creation

### Session Lifecycle

For each conversation, Chatons creates a Pi session with these steps:

1. **Determine working directory:**
   - If worktree is enabled for this conversation, use worktree path
   - Else if conversation is project-linked, use project repository path
   - Else use global workspace at `<userData>/workspace/global`
   - Only persist a worktree path after verifying the created directory is a valid Git worktree/repository; do not fall back to an empty directory as a fake runtime cwd

2. **Create Pi runtime instance** via `electron/pi-sdk-runtime.ts`

3. **Set access mode:**
   - `secure` mode: tool cwd is the conversation's working directory
   - `open` mode: tool cwd is the filesystem root
   - This controls what files the assistant can read/write/execute
   - When the user changes mode on an existing local conversation, Chatons may send a technical hidden system steer to the runtime, but that bookkeeping message must stay out of the user-visible transcript and cached conversation messages

4. **Add host context** through system prompts that explain:
   - Access mode constraints
   - Suggested actions available in the UI
   - How to explain limitations to the user
   - Channel-specific delivery constraints when the conversation is owned by a channel extension (for example the local Even Realities glasses channel requires very short, fast replies optimized for on-glasses display)

5. **Apply the active Meta-Harness candidate** before session start. The runtime may prepend or append bounded prompt sections and can run a short environment-bootstrap probe that captures a sandbox snapshot before the first model turn.

6. **Start Pi session** and expose commands like `get_access_mode` for the model to query live state

For cloud conversations, skip this entire local Pi lifecycle. The desktop app may cache cloud project and conversation state locally for display, but execution belongs to the remote headless Chatons runtime and its control-plane services.

### Meta-Harness Runtime Rule

Chatons now supports a typed Meta-Harness layer around the normal Pi runtime. The harness is applied in `electron/pi-sdk-runtime.ts` and must remain an outer-loop runtime concern, not a second assistant persona.

Current first-phase behavior:

- the active harness candidate is loaded from the managed Pi directory archive
- the runtime may gather an environment snapshot before the first model turn
- the snapshot is injected into the initial system prompt as an additive section
- prompt additions must remain bounded and typed through a `HarnessCandidate` object
- startup prompt text and snapshot artifacts are archived under `<userData>/.pi/agent/meta-harness/`

The initial harness candidate space is intentionally narrow. It may control bounded prompt sections, environment bootstrap, lazy tool-discovery posture, subagent posture, and scoring objectives. It must not grant arbitrary runtime-file mutation to a proposer in this first implementation stage.

### Memory Retrieval

Chatons must not inject retrieved memories automatically into a new conversation, whether by concatenating them into the user's message or by pushing them as a startup `steer`.

Why this rule exists:

- Even low-confidence injected memory tends to be over-weighted by the model and can still be interpreted as an instruction
- Automatic retrieval pollutes the initial reasoning context before the model has decided memory is actually relevant
- On-demand retrieval keeps the user's actual request as the primary source of intent

Runtime behavior requirements:

- Memory should remain available as explicit runtime tools such as `memory.search`, `memory.get`, `memory.markUsed`, and `memory.stats`
- The model should query memory only when recalled context is likely to help with the active request
- Retrieved memory must be treated as potentially stale or wrong and must yield to the current user request, repository state, and tool evidence
- Desktop and cloud runtimes should expose the same memory tool semantics; cloud memory persistence belongs to `cloud-api`, and `runtime-headless` should forward memory tool calls through authenticated control-plane APIs rather than owning its own durable memory store

### Worktree Cleanup Rule

When a conversation worktree was created via native Git worktrees, cleanup should prefer `git worktree remove --force` over raw directory deletion. Removing only the folder can leave stale entries in the parent repository metadata and break later worktree reuse.

### Ephemeral Pi Sessions

Chatons also creates short-lived hidden Pi sessions for internal LLM tasks that should use the same runtime/auth/model path as normal conversations.

Current examples:

- **Structured memory capture** via `electron/extensions/runtime/memory-lifecycle.ts`
- **Conversation auto-title refinement** via `electron/ipc/workspace-title.ts`
- **Channel ingestion subagents** via `channels.ingestMessage`, including local channel extensions such as the Even Realities glasses bridge

### ACP Internal Orchestration Layer

Chatons now uses ACP as an internal agent-to-agent coordination layer on top of Pi rather than as a separate end-user runtime.

Current rules:

- ACP is conversation-scoped and attached to one user-visible thread
- Pi remains the execution runtime for tools, files, shells, and model/provider handling
- ACP provides typed envelopes for delegation and reporting between orchestrator-style roles such as planner, coder, reviewer, memory, summarizer, and channel adapters
- Runtime-backed subagents must persist their ACP message and status transitions in SQLite so orchestration survives reloads and is auditable
- The renderer may show ACP progress and history in the side panel, but the user-visible transcript should remain a single coherent conversation
- ACP must stay bounded and typed; do not let internal agents free-chat indefinitely without explicit task/status/result edges

Implementation anchor points:

- `electron/acp/types.ts` defines ACP message, agent, task-list, and timeline state
- `electron/acp/store.ts` persists ACP envelopes, agent state, and task lists in SQLite
- `electron/acp/router.ts` is the local dispatcher/broadcast layer for ACP updates
- `electron/pi-sdk-runtime.ts` reuses runtime-backed Pi subagents under ACP instead of introducing a second execution runtime
- `src/hooks/use-conversation-side-panel.tsx` and `src/components/shell/TaskListPanel.tsx` hydrate and render ACP-backed orchestration state

These tasks should prefer the runtime-session pattern (`start` -> optional `set_model` -> `prompt` -> inspect snapshot -> `stop`) instead of shelling out to the Pi CLI for one-off prompts. This keeps model resolution, OAuth/API-key handling, registry reload behavior, and packaged-app runtime semantics aligned with regular conversations.

### Implementation Details

**Key file:** `electron/pi-sdk-runtime.ts`

**Session creation:** Lines 500-600 (approximate) handle runtime initialization, cwd selection, and prompt injection

**Event bridging:** Pi runtime events (message updates, tool execution, errors) are forwarded to the renderer via IPC

**Cleanup:** When a conversation ends, its Pi session is terminated and cleaned up

---

## 5. Model Scope: Architecture

### The Two Tiers

Pi distinguishes between:

| Tier              | Source                          | What It Means                       |
| ----------------- | ------------------------------- | ----------------------------------- |
| **All models**    | `models.json` (full registry)   | Every model Pi knows about          |
| **Scoped models** | `settings.json > enabledModels` | Subset user has chosen to work with |

### User-Facing Behavior

This distinction powers the UI:

- **Model picker default:** Shows scoped models first
- **"More" action:** Reveals all models
- **Starring a model:** Updates `enabledModels` in real Pi config (not just UI state)
- **Consistent throughout app:** Same scoped/all distinction in onboarding, settings, and composer

### Where Scope Is Enforced

**Onboarding:** User selects which models should be scoped after adding a provider

**Provider/Model settings:** User can add or remove models from scope

**Composer model picker:** Scoped models shown by default; star button updates the scope

**New conversation model alignment:** When a UI entry point creates a new local conversation without explicitly passing `modelProvider` and `modelId`, Chatons should reuse the saved composer model selection so the conversation row, the visible picker, and the first Pi session all start on the same model. Once a conversation exists, the conversation/runtime model is authoritative over any stale draft-only picker state.

**Validation on startup:** If no models are scoped, app prevents launch (enforced in `electron/ipc/workspace.ts` line ~1700)

**Provider cards note:** The onboarding and Provider Settings forms now group vendor cards that expose multiple backends (OpenAI, Mistral). The **ChatGPT** and **OpenAI** variants live under a single OpenAI card (OAuth vs. API key), while the **Mistral** card now exposes both a `Mistral` variant (standard API at `https://api.mistral.ai/v1`) and a `Mistral Vibe` variant (Vibe endpoint at `https://vibe.mistral.ai/v1`). Each visible option maps to its own Pi provider entry even though they share the same scoping machinery, so keep documentation and sync logic aligned whenever one of these flows changes.

---

## 6. CLI Command Resolution

### How Chatons Finds and Runs Pi CLI

When the app needs to run Pi commands (e.g., model sync, skill install), it uses this resolution order:

1. **Bundled Pi CLI:** `@mariozechner/pi-coding-agent/dist/cli.js`
   - Present if package is installed in node_modules
   - Preferred because it's already embedded in the app

2. **Fallback Pi binary:** `<userData>/.pi/agent/bin/pi`
   - If bundled CLI is not available
   - Installed separately if needed

### Key Functions

| Function                   | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `getBundledPiCliPath()`    | Returns path to bundled CLI or null                                               |
| `getPiBinaryPath()`        | Returns preferred CLI path (bundled or fallback)                                  |
| `runPiExec(args, timeout)` | Executes Pi with given args, forces `PI_CODING_AGENT_DIR` to managed Pi directory |

**Usage example:**

```typescript
// List all available models
const output = await runPiExec(["--list-models"], 30_000);
```

### Force-Setting Pi Directory

All CLI executions run with:

```bash
PI_CODING_AGENT_DIR=<userData>/.pi/agent pi [command]
```

This ensures the command uses Chatons' managed Pi environment, not the user's global Pi config.

---

## 7. Known Limitations and Safeguards

### Settings Locking

Pi uses `settings.json.lock` to prevent concurrent modifications. Chatons implements defensive handling:

- **Cleanup stale locks:** Removes locks older than 5 minutes on startup
- **Retry with backoff:** `SettingsManager.create()` is retried with exponential backoff if the lock is held

**Location:** `electron/pi-sdk-runtime.ts` lines ~300-350

### Same-Process Extension Reload

Currently, installing or updating extension files does not guarantee a complete same-process runtime reload. Workaround: Restart Chatons after extension changes.

**Implication:** Changes to Pi configuration or extension manifests are safest applied with an app restart.

### OAuth Token Refresh

OAuth tokens (for Codex, Claude Pro, GitHub Copilot) are stored with an `expires` timestamp. Chatons does not yet automatically refresh expired tokens.

**Current behavior:** If a token expires during use, the conversation will fail. User must re-authenticate via Settings/Providers.

---

## 8. Debugging: Verify Runtime State

### Commands Available in Settings

From `Settings > Diagnostics`, users (and developers) can see:

- **Pi path:** The actual binary being used
- **Settings path:** Where `settings.json` lives
- **Models path:** Where `models.json` lives
- **Runtime checks:** Basic validation that Pi can be invoked

### Manual Verification

To check what Pi config the app is using:

```bash
# Check the managed Pi directory
ls -la ~/.chaton/.pi/agent/

# Inspect current model scope
cat ~/.chaton/.pi/agent/settings.json | grep enabledModels

# Check available models
cat ~/.chaton/.pi/agent/models.json | head -50
```

### Logs

App logs include Pi runtime events. Check:

- Browser DevTools console (in development)
- App log files (from `Settings > Sessions` / "Open Sessions Folder")
- Main process logs (Chatons UI -> Settings -> Diagnostics area)

---

## 9. Documentation Maintenance Rule

Any change to Chatons that affects:

- Runtime model selection behavior
- Pi configuration file semantics
- Session creation or access mode logic
- Provider/OAuth authentication flow
- Extension contracts that depend on Pi

**must** include documentation updates in the same changeset:

- `docs/PI_INTEGRATION.md` — User-facing Pi integration details
- `docs/CHATONS_DEVELOPER_GUIDE.md` — Developer architecture and tech choices
- `AGENTS.md` — This file, maintainer-facing technical reference
- `docs/DOCUMENTATION_AUDIT.md` — Record of what was changed and why
- And all the related mdx

**This is not optional.** Undocumented behavior changes are considered incomplete and should not be merged.

---

## 10. Testing Pi Integration

### Manual Verification Checklist

When making Pi-related changes:

- [ ] App starts and loads onboarding without errors
- [ ] Provider can be added and saved
- [ ] Model scope can be set and persists
- [ ] Conversation can be created and model picker shows scoped models
- [ ] Conversation can run a simple command (e.g., bash: `echo hello`)
- [ ] Secure vs open access mode toggling works
- [ ] Model scope changes are reflected in `settings.json`
- [ ] Accessing `Settings > Diagnostics` shows correct Pi path

### Unit Test Coverage

Current test coverage for Pi integration lives in:

- `src/__tests__/` for renderer-side tests
- `electron/__tests__/` for main-process tests (if present)

Key areas that should have tests:

- Settings parsing and validation (`enabledModels`, provider URLs)
- Model registry loading and deduplication
- Access mode cwd selection
- OAuth flow state management (if testing OAuth)

---

## 13. Troubleshooting Pi Runtime Issues

### Settings Lock Timeout

**Symptom:** Errors like `EACCES` or `SettingsManager lock timeout`

**Cause:** `settings.json.lock` file is stale (usually from a crashed process)

**Fix:**

1. Check for stale lock files:
   ```bash
   ls -la ~/.chaton/.pi/agent/settings.json.lock
   ```
2. If older than 5 minutes, Chatons should clean it on next startup
3. If it persists:
   ```bash
   rm -f ~/.chaton/.pi/agent/settings.json.lock
   ```
4. Restart Chatons

**Prevention:** Chatons automatically cleans locks older than 5 minutes (see `electron/pi-sdk-runtime.ts` line ~340)

### Model Registry Corruption

**Symptom:** `models.json` parse error or empty model list

**Cause:** `models.json` is malformed or incomplete

**Check:**

```bash
cat ~/.chaton/.pi/agent/models.json | jq . > /dev/null
# If jq fails, file is corrupted
```

**Fix:**

1. Backup the corrupted file:
   ```bash
   mv ~/.chaton/.pi/agent/models.json ~/.chaton/.pi/agent/models.json.bak
   ```
2. Restart Chatons — it will regenerate `models.json` with defaults
3. Re-add your providers

### Provider Base URL Probe Failure

**Symptom:** "Could not connect to provider" during setup

**Cause:** Chatons probes multiple URL variants and none responded on compatibility endpoints

**Why it happens:**

- Chatons tries: `http://host:port`, `http://host:port/`, `http://host:port/v1`, `http://host:port/v1/`
- Probe scoring considers `/models` plus generation endpoints (`/chat/completions`, `/responses`) to avoid false positives where model listing works but message generation fails
- If all fail, setup fails
- Provider may be down or URL is incorrect

**Debug:**

```bash
# Test the URL manually
curl -I https://api.openai.com/v1 -H "Authorization: Bearer sk-test"
# Should return 200 or 401, not connection refused
```

**Fix:**

1. Verify the provider is accessible from your network
2. Check firewall/proxy settings
3. Try using the provider's API directly (e.g., `curl` or Postman)
4. If provider is behind a proxy, you may need to configure it system-wide

### OAuth Token Expired

**Symptom:** 401 Unauthorized during conversation after token was valid

**Cause:** OAuth token has expired (stored with `expires` timestamp)

**Current limitation:** Chatons does not auto-refresh tokens

**Workaround:**

1. Go to `Settings > Providers & Models`
2. Find the OAuth provider (e.g., OpenAI)
3. Click the oauth provider and re-authenticate
4. Credentials are stored in `~/.chaton/.pi/agent/auth.json`

**Expected fix in future:** Auto-refresh logic in token validation

### Session Creation Fails

**Symptom:** Conversation starts but immediately errors on first message

**Cause:** Pi session could not be created (multiple possible reasons)

**Debug steps:**

1. Check Pi path: `Settings > Diagnostics > Pi path`
2. Verify bundled CLI exists:
   ```bash
   node -e "console.log(require('@mariozechner/pi-coding-agent/dist/cli.js'))"
   ```
3. Check working directory is writable:
   ```bash
   touch ~/.chaton/.pi/agent/test.tmp && rm ~/.chaton/.pi/agent/test.tmp
   ```
4. Review logs from `Settings > Sessions > Open Sessions Folder`

**Common causes:**

- Insufficient disk space (`df -h` check)
- Permissions issue on `~/.chaton/` directory
- Pi binary missing or corrupted
- Firewall blocking model provider

### Too Many Open File Handles

**Symptom:** "EMFILE: too many open files" after many conversations

**Cause:** Sessions not being properly cleaned up

**Workaround:**

1. Restart Chatons
2. Close unused conversations

**Prevention:**

- Don't leave hundreds of conversations open simultaneously
- Pi cleanup code runs when sessions are terminated

---

## 14. Config Recovery Guide

### When Config Gets Corrupted

Corruption typically affects `settings.json`, `models.json`, or `auth.json`.

### Recovery Hierarchy

#### Level 1: Regenerate One File

**If only `settings.json` is corrupted:**

```bash
# Backup
cp ~/.chaton/.pi/agent/settings.json ~/.chaton/.pi/agent/settings.json.corrupted

# Delete and restart Chatons (will regenerate)
rm ~/.chaton/.pi/agent/settings.json
```

Chatons will regenerate with defaults. You'll need to:

- Re-add providers
- Rescope your models

**If only `models.json` is corrupted:**

```bash
rm ~/.chaton/.pi/agent/models.json
# Restart Chatons
```

**If only `auth.json` is corrupted:**

```bash
rm ~/.chaton/.pi/agent/auth.json
# Restart Chatons
# Re-enter API keys or re-authenticate with OAuth
```

#### Level 2: Restore from Backup

If you have a backup of `~/.chaton/`:

```bash
# Assuming backup at /Volumes/external/chaton-backup
rm -rf ~/.chaton
cp -r /Volumes/external/chaton-backup ~/.chaton
# Restart Chatons
```

#### Level 3: Full Reset

If multiple files are corrupted and no backup exists:

```bash
# Move entire config out
mv ~/.chaton ~/.chaton.corrupted

# Restart Chatons — it will initialize from scratch
# This will feel like first launch (onboarding)
```

**What you lose:**

- All conversations (but they're still in `~/.chaton.corrupted/conversations/`)
- Provider configurations (easy to re-add)
- API keys (need to re-enter)

**What you can recover:**

```bash
# Extract old conversations if needed
cp ~/.chaton.corrupted/conversations ~/.chaton/conversations
# Restart Chatons
```

### Common Corruption Patterns

**Pattern 1: settings.json invalid JSON**

- Symptom: App crashes on startup
- Cause: Usually a crash during write
- Fix: `rm ~/.chaton/.pi/agent/settings.json` and restart

**Pattern 2: models.json missing provider**

- Symptom: Provider exists in auth.json but not in models.json
- Cause: Incomplete provider add operation
- Fix: Re-add the provider in Settings, or restore `models.json` from backup

**Pattern 3: Mismatched enabledModels**

- Symptom: Composer shows "No models available" despite having providers
- Cause: `settings.json > enabledModels` references non-existent models
- Fix:
  ```bash
  # Edit settings.json and set enabledModels to empty array
  # Or delete and restart Chatons
  ```

### Prevention

1. **Regular backups:**

   ```bash
   # Weekly backup
   tar -czf ~/backups/chatons-$(date +%Y-%m-%d).tar.gz ~/.chaton/
   ```

2. **Read-only snapshots (macOS):**

   ```bash
   tmutil snapshot
   # Use Time Machine to recover old configs
   ```

3. **Monitor lock file staleness** — Chatons does this automatically (cleans locks > 5 min)

---

## 15. Common Mistakes When Modifying Pi Integration

### Mistake 1: Treating `enabledModels` as Read-Only

**Wrong approach:**

```typescript
// Don't do this
settings.value.enabledModels = [...];
// UI now out of sync with Pi config
```

**Right approach:**

```typescript
// This updates the actual Pi settings file
await settingsManager.set({
  enabledModels: ["provider/model"],
});
// UI should read from settingsManager, not local state
```

**Impact:** If you don't use `settingsManager`, the UI will show one state but Pi will use another.

### Mistake 2: Assuming Access Mode Works Automatically

**Wrong assumption:**

```
// If I just read from a path, access mode handles it
const result = await readFile("/some/path");
```

**Reality:**

- Access mode only affects the **tool's cwd execution**
- If you call tools directly without respecting the cwd, you bypass the restriction

**Right approach:**

- Check `get_access_mode` at runtime
- If secure mode, validate paths are within allowed directories
- Document that open mode has full filesystem access

### Mistake 3: Not Validating Credential Sync

**Wrong approach:**

```typescript
// Add to models.json and assume auth syncs
models.providers[id] = { apiKey: "sk-..." };
// But auth.json is separate!
```

**Right approach:**

```typescript
// Update both files
settingsManager.setProvider(id, config);
// This handles sync between models.json and auth.json
```

**Impact:** Credentials in wrong place means they won't be found at runtime.

### Mistake 4: Modifying settings.json Directly

**Wrong approach:**

```bash
# Editing file directly
vim ~/.chaton/.pi/agent/settings.json
# Then restarting app
```

**Problem:**

- No validation of JSON syntax
- May conflict with app's writes
- Could create a stale lock file

**Right approach:**

- Use Chatons Settings UI, or
- Use the `SettingsManager` API programmatically, or
- If manual edit is necessary:
  ```bash
  # Validate first
  jq . ~/.chaton/.pi/agent/settings.json > /dev/null
  # Close app first
  # Edit file
  # Restart app
  ```

### Mistake 5: Not Cleaning Up Stale Sessions

**Wrong approach:**

```typescript
// Create session
const session = await createPiSession(...);
// Forget to clean up when conversation ends
```

**Impact:**

- Memory leaks (sessions hold resources)
- File handle exhaustion
- Stale lock files

**Right approach:**

```typescript
try {
  const session = await createPiSession(...);
  // use session
} finally {
  await session.cleanup(); // Always cleanup
}
```

### Mistake 6: Assuming Model Scope Persists Across Restarts

**Wrong assumption:**

```typescript
// Change enabledModels in runtime
settingsManager.set({ enabledModels: [...] });
// But never written to disk
```

**Reality:**

- `SettingsManager` persists to disk automatically
- But if you're testing in development, you might bypass persistence

**Right approach:**

- Verify `~/.chaton/.pi/agent/settings.json` actually changed
- Use `Settings > Diagnostics` to inspect live state

### Mistake 7: Mixing Up Pi Session State with App-Level State

**Wrong approach:**

```typescript
// Store conversation context in Pi session
// But also in app database
// They get out of sync
```

**Right approach:**

- Pi session is ephemeral (per-conversation runtime)
- App database is persistent (across app restarts)
- Never duplicate state — pick one source of truth for each piece of data

### Mistake 8: Ignoring Access Mode in Tool Implementations

**Wrong approach:**

```typescript
// Tool always operates from /
const result = exec(`ls /`);
```

**Right approach:**

```typescript
// Respect access mode
const cwd = accessMode === "open" ? "/" : projectDir;
const result = exec(`ls ${cwd}`);
```

**Impact:** Secure mode becomes a no-op if tools ignore it.

---

## 16. Testing Checklist for Pi Changes

When you modify anything in `electron/pi-sdk-runtime.ts`, `electron/ipc/workspace.ts`, or model scoping logic, run this checklist:

### Unit Tests

- [ ] Settings parsing and validation (sanitizing `enabledModels`)
- [ ] Model registry loading and deduplication
- [ ] Access mode cwd calculation
- [ ] Provider URL normalization probing
- [ ] OAuth token storage format

### Manual Verification (App Runtime)

#### Startup

- [ ] App boots without errors
- [ ] `Settings > Diagnostics` shows correct Pi path
- [ ] Loading splash displays correctly

#### Onboarding

- [ ] Can add a provider (preset or custom)
- [ ] Base URL normalization works (try entering `http://host:port` and verify it normalizes)
- [ ] Model scope selection works
- [ ] Validation passes or fails correctly
- [ ] Provider credentials are saved to `auth.json`

#### Provider & Model Settings

- [ ] Can view all added providers
- [ ] Can toggle model scope (star button)
- [ ] Changes persist after app restart
- [ ] `settings.json > enabledModels` reflects changes

#### Conversation Creation

- [ ] Can create global and project conversations
- [ ] Model picker shows scoped models first
- [ ] "More" action reveals all models
- [ ] Model selection persists per conversation

#### Tool Execution

- [ ] Secure mode: `bash pwd` shows conversation cwd, not root
- [ ] Open mode: `bash pwd` shows / (or user home depending on cwd logic)
- [ ] Toggling access mode between secure/open works
- [ ] Files are read/written in the correct location

#### Sessions and Cleanup

- [ ] Opening 5 conversations and closing them doesn't leave zombie processes
- [ ] `Settings > Sessions` folder contains only recent session directories
- [ ] No stale `.lock` files accumulate

### Integration Tests

- [ ] Add provider → create conversation → run tool → verify working directory
- [ ] Switch models mid-conversation → model picker updates
- [ ] Import project → create project thread → verify repo context works
- [ ] Enable worktree → verify git operations work

### Regression Tests

- [ ] Repeat any workflows mentioned in changelogs for recent versions
- [ ] Test the exact scenario described in any related GitHub issues

### Performance Tests

- [ ] Session creation time < 3 seconds
- [ ] Model switching < 500ms
- [ ] Settings save < 500ms
- [ ] No noticeable UI lag during tool execution

---

## 17. Performance Considerations

### Session Creation Latency

**Baseline:** 1-3 seconds per session

**Factors affecting latency:**

- Model load time (bundled vs remote)
- Provider response time for model metadata
- Project size (if project-linked, scanning repo takes time)
- Disk I/O speed

**Optimization opportunities:**

- Lazy-load project metadata instead of upfront
- Cache model metadata from providers
- Use SSD for `~/.chaton/` directory
- Increase RAM for faster model loading

### Model Loading Slowness

**If model list takes >5 seconds to load:**

1. Check provider API status
2. Verify network connection (`curl https://api.provider.com`)
3. Look for timeout logs in `Settings > Sessions`
4. Try a different provider to isolate the issue

**Mitigation:**

- Cache model list locally (already done in Pi)
- Use `--list-models` cache expiry

### Provider Probe Timeout

**When adding a custom provider, Chatons probes URL variants.**

If this times out (>30 seconds):

1. Provider may be down
2. Network latency is very high
3. URL is incorrect

**Current timeout:** 30 seconds per probe attempt (see `electron/ipc/workspace.ts`)

### Settings Lock Contention

**If you see settings lock messages:**

- Only one process should write to `settings.json` at a time
- Chatons prevents concurrent writes via lock file
- If lock is held >5 minutes, it's considered stale and cleaned

**Prevention:**

- Don't run multiple Chatons instances
- Don't manually edit `settings.json` while app is running

### Memory Usage

**Typical memory footprint:**

- App UI + Pi runtime: 300-500 MB base
- Per active conversation: +50-100 MB
- Per loaded large file: +file size

**High memory usage fix:**

- Close conversations you're not actively using
- Restart app if memory grows unbounded (indicates a leak)

### Disk I/O

**Conversations are persisted to SQLite.**

If save/load is slow:

- Check disk space (`df -h`)
- Check if `/tmp` is full (may interfere with SQLite temp files)
- Consider moving `~/.chaton/` to a local SSD (not network drive)

---

## 18. When to Update This File

Update `AGENTS.md` when:

- Pi SDK API changes or new options are added
- Chatons' Pi initialization process is modified
- Model scoping behavior is updated
- New limitations are discovered (add to section 7)
- Debugging procedures change
- New error patterns are observed
- Config recovery procedures change
- Common mistakes are identified

**In every case, also update `docs/content/documentation-audit.mdx`** with a new dated entry explaining what changed and why.

Do **not** use this file for:

- End-user feature documentation (use `docs/content/user-guide.mdx`)
- Extension developer guides (use `docs/content/extensions/index.mdx`)
- General project description (use `README.md`)
- Contributing workflow (use `CONTRIBUTING.md`)

---

## 19. Extension Versioning Requirements

When creating or modifying an extension, **you must increment the semantic version in both the `manifest.json` and `package.json`** at the end of the modification.

### Why This Matters

- **Extension registry tracking** — The Chatons extension registry and package managers use version numbers to determine if an update is available
- **User awareness** — Users need clear versioning to understand what changes between extension releases
- **Dependency resolution** — Version numbers help tools understand compatibility and breaking changes
- **Rollback capability** — Proper versioning enables users to downgrade to previous versions if needed

### Version Files That Must Be Updated

Every extension has two critical version fields:

1. **`manifest.json`** (located in extension root)
   ```json
   {
     "id": "@namespace/extension-name",
     "version": "1.0.0",
     "name": "Display Name"
   }
   ```

2. **`package.json`** (located in extension root)
   ```json
   {
     "name": "@namespace/extension-name",
     "version": "1.0.0",
     "description": "..."
   }
   ```

**Both must have identical version numbers.**

### Semantic Versioning Rules

Follow [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** (e.g., `1.0.0` → `2.0.0`):
  - Breaking API changes
  - Incompatible manifest schema changes
  - Removal of capabilities or tools
  - Changes that require user reconfiguration

- **MINOR** (e.g., `1.0.0` → `1.1.0`):
  - New features or capabilities
  - New tools or commands added
  - Non-breaking enhancements
  - Backward-compatible extensions to the manifest

- **PATCH** (e.g., `1.0.0` → `1.0.1`):
  - Bug fixes
  - Performance improvements
  - Documentation updates
  - Internal refactoring with no behavioral changes

### Extension Versioning Workflow

**At the end of every extension modification:**

1. **Determine the change type:**
   - `feat` → Minor bump (e.g., `1.0.0` → `1.1.0`)
   - `fix` → Patch bump (e.g., `1.0.0` → `1.0.1`)
   - `BREAKING CHANGE` → Major bump (e.g., `1.0.0` → `2.0.0`)

2. **Update `manifest.json`:**
   ```bash
   # Before
   "version": "1.0.0"
   
   # After (for a fix)
   "version": "1.0.1"
   ```

3. **Update `package.json`:**
   ```bash
   # Use the same version number
   "version": "1.0.1"
   ```

4. **Verify both files match:**
   ```bash
   # Check they're identical
   jq .version manifest.json
   jq .version package.json
   # Should output the same version
   ```

5. **Commit the changes with a message describing the modification:**
   ```bash
   git add manifest.json package.json
   git commit -m "feat: add new tool endpoint (v1.1.0)"
   ```

### Examples

#### Example 1: Bug Fix in Extension

**Before:**
- Extension version: `1.2.3`
- Modified file: `src/handler.js` (fixed a null pointer exception)

**After:**
- `manifest.json`: `"version": "1.2.4"`
- `package.json`: `"version": "1.2.4"`

#### Example 2: Adding a New Feature

**Before:**
- Extension version: `2.1.0`
- Modified files: Added `src/new-tool.js` and extended `manifest.json` with new capability

**After:**
- `manifest.json`: `"version": "2.2.0"`
- `package.json`: `"version": "2.2.0"`

#### Example 3: Breaking Change

**Before:**
- Extension version: `3.0.0`
- Modified files: Restructured UI components, removed deprecated API

**After:**
- `manifest.json`: `"version": "4.0.0"`
- `package.json`: `"version": "4.0.0"`

### Validation Checklist

When you finish modifying an extension, verify:

- [ ] `manifest.json` has been updated to new version
- [ ] `package.json` has been updated to the same version
- [ ] Version strings match exactly (no typos like `1.0.0` vs `1.0.00`)
- [ ] Semantic versioning rules were applied correctly (major/minor/patch)
- [ ] Changes are committed with a meaningful message
- [ ] No version mismatch between the two files

### Common Mistakes to Avoid

**Mistake 1: Forgetting to update one file**
```bash
# Don't do this
# Updated manifest.json to "1.1.0"
# But forgot to update package.json
# Result: Version mismatch detected by tools
```

**Mistake 2: Using inconsistent format**
```bash
# Don't do this
manifest.json: "version": "1.1.0"
package.json: "version": "1.1"      # Missing patch version
```

**Mistake 3: Not following semantic versioning**
```bash
# Don't do this
# Made a patch-level fix but bumped to 2.0.0
# Users expect major version bumps to indicate breaking changes
```

**Mistake 4: Committing without version bump**
```bash
# Don't do this
# Modified extension functionality
# But forgot to increment version
# Users have no way to know an update is available
```

### How This Integrates with CI/CD

The Chatons build pipeline may use version numbers to:

- Trigger registry updates
- Create release artifacts
- Generate changelogs
- Track extension history

Therefore, always ensure versions are accurate and committed before pushing changes.

---

## 20. Documentation Standards

As of 2026, Chatons documentation has migrated to MDX format in the `docs/content/` directory.

### Legacy Markdown Files

All `.md` files in the `docs/` folder have been removed. This documentation was migrated to MDX format for better structure and reusability.

### New Documentation Location

All user and developer documentation now lives in `docs/content/` as `.mdx` files:

- **User guides:** `docs/content/user-guide.mdx`
- **Developer guides:** `docs/content/developer-guide.mdx`
- **Pi integration:** `docs/content/pi-integration.mdx`
- **Extensions:** `docs/content/extensions/` (index, api, tutorial, publishing, etc.)
- **Project decisions:** `docs/content/documentation-audit.mdx`
- **Other docs:** `docs/content/*.mdx`

### When Adding Documentation

1. **Create or edit files in `docs/content/` as `.mdx`** — use frontmatter with `title` and `description`
2. **Use MDX format** — standard Markdown with JSX support
3. **Link to other docs** — use relative links: `/extensions/api`, `/user-guide`, etc.
4. **Update AGENTS.md** — if changes affect Pi integration, maintainer workflows, or testing procedures
5. **Update documentation-audit.mdx** — record what was added/changed and why

### File Organization

```
docs/content/
├── index.mdx                          # Main documentation index
├── getting-started.mdx                # Quick start for new users
├── user-guide.mdx                     # End-user features
├── developer-guide.mdx                # Architecture and development
├── pi-integration.mdx                 # Pi runtime details
├── automation-extension.mdx           # Built-in automation
├── documentation-audit.mdx            # Change history
├── extensions/                        # Extension documentation
│   ├── index.mdx                      # Extensions overview
│   ├── tutorial.mdx                   # Build your first extension
│   ├── api.mdx                        # Full API reference
│   ├── publishing.mdx                 # Publishing to npm
│   ├── channels.mdx                   # Messaging integration
│   ├── ui-library.mdx                 # UI components
│   └── requirement-sheets.mdx         # Tool prerequisites UI
├── semantic-versioning.mdx            # Versioning policy
├── signing-guide.mdx                  # Code signing
├── manual-signing-instructions.mdx    # Manual signing steps
└── task-progress-bar.mdx              # Task progress UI guide
```

### Why MDX Over Markdown

- **Frontmatter support** — automatically handled in docs site metadata
- **Better structure** — reusable components and consistent formatting
- **Future-proof** — supports React/JSX for interactive documentation
- **Easier linking** — docs site can automatically generate navigation

### Do Not Use Markdown (.md)

- ❌ Don't create new `.md` files in `docs/`
- ❌ Don't edit legacy `.md` files (they've been deleted)
- ❌ AGENTS.md is the only exception — it's maintainer-facing and stored in repo root

---

## 21. Related Reading

- **User perspective:** `/docs/content/user-guide.mdx` (sections 3, 4, 6)
- **Architecture overview:** `/docs/content/developer-guide.mdx` (section 4)
- **Pi integration details:** `/docs/content/pi-integration.mdx` (all sections)
- **Extension integration:** `/docs/content/extensions/index.mdx` (section 1 on distinction from Pi skills)
- **Official Pi repo:** https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- **Documentation audit trail:** `/docs/content/documentation-audit.mdx`
