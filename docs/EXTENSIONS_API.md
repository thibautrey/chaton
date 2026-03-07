# Chatons Extension API

Related documents:

- `docs/EXTENSIONS.md`
- `docs/EXTENSIONS_CHANNELS.md`
- `docs/EXTENSIONS_UI_LIBRARY.md`

---

## 1. Manifest overview

Extension manifests are stored in `chaton.extension.json`.

The current implementation recognizes fields including:

- `id`
- `name`
- `version`
- `entrypoints`
- `capabilities`
- `hooks`
- `ui.menuItems[]`
- `ui.mainViews[]`
- `apis.exposes[]`
- `apis.consumes[]`
- `server.start`
- `llm.tools[]`
- compatibility metadata

Not every field is mandatory for every extension.

---

## 2. Capability model

Capabilities gate access to host features.

Current capability names used by the platform include:

- `ui.menu`
- `ui.mainView`
- `llm.tools`
- `events.subscribe`
- `events.publish`
- `queue.publish`
- `queue.consume`
- `storage.kv`
- `storage.files`
- `host.notifications`
- `host.conversations.read`
- `host.projects.read`
- `host.conversations.write`

If a requested API family does not match the extension's declared capabilities, the runtime rejects the operation.

---

## 3. Host IPC surface

The renderer communicates with the extension host through IPC endpoints such as:

- `extensions:getManifest`
- `extensions:registerUi`
- `extensions:events:subscribe`
- `extensions:events:publish`
- `extensions:queue:enqueue`
- `extensions:queue:consume`
- `extensions:queue:ack`
- `extensions:queue:nack`
- `extensions:queue:deadLetter:list`
- `extensions:storage:kv:get`
- `extensions:storage:kv:set`
- `extensions:storage:kv:delete`
- `extensions:storage:kv:list`
- `extensions:storage:files:read`
- `extensions:storage:files:write`
- `extensions:hostCall`
- `extensions:call`
- `extensions:runtime:health`

These IPC names are useful when tracing behavior across the renderer, Electron main process, and extension runtime.

---

## 4. Host events emitted by Chatons

The host currently emits events including:

- `app.started`
- `conversation.created`
- `conversation.updated`
- `conversation.message.received`
- `conversation.agent.started`
- `conversation.agent.ended`
- `project.created`
- `project.deleted`
- `extension.installed`
- `extension.enabled`

Extensions can subscribe to these events when they declare the relevant event capability.

---

## 5. Exposed APIs and cross-extension calls

Extensions can declare exposed APIs under `apis.exposes[]`.

The host supports cross-extension API calls through a call shape conceptually equivalent to:

- `extensions:call(callerExtensionId, extensionId, apiName, versionRange, payload)`

What matters in practice:

- the caller provides its own extension identity
- the target extension id and API name are explicit
- the runtime can check capability and version compatibility rules before dispatch

---

## 6. Extension storage

### Key-value storage

Namespaced key-value storage is backed by the SQLite table:

- `extension_kv`

This is the right place for:

- settings
- bridge mappings
- cursors
- small extension state

### File storage

Extensions also get sandboxed file storage under:

- `~/.chaton/extensions/data/<extensionId>/`

Use that for:

- larger state files
- caches
- imported assets
- provider-specific local artifacts

---

## 7. Persistent queue

The extension queue is backed by the SQLite table:

- `extension_queue`

Documented semantics today:

- at-least-once delivery
- retry with backoff
- dead-letter handling

Queue item states include:

- `queued`
- `processing`
- `done`
- `dead`

This makes the queue suitable for extension jobs where occasional retry is acceptable and idempotency can be managed at the extension layer.

---

## 8. Extension-owned UI text

Chatons does not automatically translate extension labels or titles.

Manifest-provided text is rendered as-is.

That means localization is the extension author's responsibility.

Examples include:

- `ui.menuItems[].label`
- `ui.mainViews[].title`

---

## 9. Extension servers

An extension can declare a local server process to start automatically.

Manifest shape:

```json
{
  "server": {
    "start": {
      "command": "node",
      "args": ["index.js"],
      "cwd": ".",
      "env": { "MY_VAR": "value" },
      "readyUrl": "http://127.0.0.1:4317/health",
      "readyTimeoutMs": 12000,
      "expectExit": false
    }
  }
}
```

Current behavior:

- `command` is required
- `args` are optional
- `cwd` is resolved relative to the extension root and sandboxed to that directory
- if `readyUrl` is set, Chatons polls it until HTTP 200 or timeout
- `expectExit` can be used for one-shot scripts
- the UI can also register a server dynamically through `window.chaton.registerExtensionServerFromUi(...)`

The host may temporarily report that a server is not ready while it is still starting.

---

## 10. LLM-exposed tools

Extensions can expose tools that are injected into Pi thread sessions.

### Manifest contract

Example shape:

```json
{
  "capabilities": ["llm.tools"],
  "llm": {
    "tools": [
      {
        "name": "my_extension.do_something",
        "label": "Do something",
        "description": "Description shown to the model.",
        "promptSnippet": "Short one-line tool hint in the system prompt.",
        "promptGuidelines": [
          "Optional extra guidance injected in the tool guidelines section."
        ],
        "parameters": {
          "type": "object",
          "properties": {
            "input": { "type": "string" }
          },
          "required": ["input"]
        }
      }
    ]
  },
  "apis": {
    "exposes": [
      { "name": "my_extension.do_something", "version": "1.0.0" }
    ]
  }
}
```

### Rules

- each LLM tool entry must map to an exposed API with the same name
- the extension must declare capability `llm.tools`
- tool results are returned as JSON text output
- execution is routed through the extension runtime bridge rather than by exposing arbitrary code directly to the model

### Name restrictions

Pi-facing tool names must match:

- `^[a-zA-Z0-9_-]+$`

If a manifest tool name contains characters such as `.`, `/`, or spaces, Chatons automatically normalizes the Pi-visible tool name and logs a normalization warning.

The original extension API name still remains the internal dispatch target.

### Current implementation note

Tool execution is currently synchronous through the extension runtime bridge.

---

## 11. Channel extension profile

Chatons documents a specialized extension profile for external messaging bridges.

Channel extensions are identified with:

- `kind: "channel"`

Current rules around that profile:

- inbound channel messages go to global threads only
- channel extensions must not target project conversations
- enabled channel extensions are shown through a dedicated `Channels` navigation entry instead of through separate sidebar items

Recommended channel APIs include:

- `channel.connect`
- `channel.disconnect`
- `channel.status`
- `channel.receive`
- `channel.send`

Current implementation note:

- `channel` is a documented contract layered on top of the standard extension platform
- it is not a completely separate low-level host subsystem
- the host does expose generic bridge-style methods such as `channels.upsertGlobalThread`, `channels.ingestMessage`, and `conversations.getMessages`
- provider-specific delivery logic still belongs to the extension

For the detailed profile, use `docs/EXTENSIONS_CHANNELS.md`.

---

## 12. Logging

Extension runtime logs are written under:

- `~/.chaton/extensions/logs/`

The filename is derived from the extension id using a filesystem-safe normalization step.

This is the first place to inspect when:

- a tool name was normalized
- a server did not become ready
- a runtime hook failed
- an extension API call behaves differently than expected

---

## 13. What to treat as stable today

These behaviors are clearly implemented and safe to rely on:

- capability-gated host access
- manifest-declared main views
- namespaced KV and file storage
- persistent queue with retry/dead-letter handling
- runtime server startup with readiness polling
- LLM tool injection through manifest + API pairing

---

## 14. What to document carefully

These are real, but should be described precisely:

- channel extensions are a documented profile over the existing extension system
- extension runtime changes still often require restart for full reliability
- LLM tool results are JSON-oriented and bridged, not arbitrary direct host execution
- host-managed translation of extension labels does not exist

If platform behavior changes in those areas, update this file in the same change.
