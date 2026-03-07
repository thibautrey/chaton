# Chatons Extensions

This document explains the extension contract that Chatons implements today.

It is meant for developers who want to build, inspect, or maintain extensions against the real host behavior in this repository.

Related documents:

- `docs/EXTENSIONS_API.md`
- `docs/EXTENSIONS_CHANNELS.md`
- `docs/EXTENSIONS_UI_LIBRARY.md`
- `docs/AUTOMATION_EXTENSION.md`

---

## 1. What an extension is

A Chatons extension is a package discovered by the desktop app at runtime.

Depending on its manifest and capabilities, an extension can contribute:

- sidebar navigation
- main views
- quick actions
- exposed APIs
- LLM-callable tools
- queue consumers and publishers
- storage access
- local background servers
- host interactions such as notifications

Extensions are distinct from Pi skills.

Use an extension when you need Chatons host integration, UI, or persistent extension-owned behavior.

---

## 2. Where extensions live

### Canonical user extension directory

User-installed extensions live under:

- `~/.chaton/extensions/<extension-id>`

### Legacy fallback directory

Chatons also still recognizes:

- `~/.chaton/extensions/extensions/<extension-id>`

### Registry file

Installed extension state is tracked in:

- `~/.chaton/extensions/registry.json`

### Built-in extensions

Chatons always includes built-in extension entries for:

- `@chaton/automation`
- `@chaton/memory`

These are shipped with the app and not stored in the user extension folder.

---

## 3. Discovery and loading model

At startup, Chatons loads extension manifests from:

- built-in extensions
- registered user extensions
- valid on-disk extension folders discovered during registry scan

This means manual local development is possible: if you drop a valid extension folder into the expected directory, Chatons can discover it.

Important current limitation:

- the safest workflow after adding or changing extension files is still to restart Chatons
- install or toggle operations do not guarantee a complete same-process runtime rebuild

---

## 4. Minimal manifest

Every extension is described by `chaton.extension.json`.

Minimal example:

```json
{
  "id": "@user/chatons-your-extension",
  "name": "Your Extension",
  "version": "1.0.0",
  "capabilities": ["ui.mainView"],
  "ui": {
    "mainViews": [
      {
        "viewId": "your.main",
        "title": "Your View",
        "webviewUrl": "chaton-extension://@user/chatons-your-extension/index.html",
        "initialRoute": "/"
      }
    ]
  }
}
```

Fields that matter in practice:

- `id`
- `name`
- `version`
- `capabilities`
- `ui.mainViews` if the extension has a visible screen

If the extension exposes APIs or LLM tools, you also need the matching `apis` and `llm` sections.

---

## 5. Common manifest sections

The current manifest format in the codebase includes support for areas such as:

- top-level identity: `id`, `name`, `version`
- `capabilities`
- `hooks`
- `ui.menuItems[]`
- `ui.mainViews[]`
- `ui.quickActions[]`
- `apis.exposes[]`
- `apis.consumes[]`
- `server.start`
- `llm.tools[]`
- compatibility metadata

Not every extension needs every section.

---

## 6. Capabilities

Capabilities are operational, not decorative.

The runtime checks them before allowing access to different API families.

Current capability names documented in the implementation include:

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

If a manifest is missing the relevant capability, host access is rejected.

---

## 7. Sidebar menu items and main views

Extensions can contribute menu items and main views.

### Menu items

Menu items are defined in `ui.menuItems[]`.

A menu item can point to a `mainView` via `openMainView`.

### Main views

Main views are defined in `ui.mainViews[]`.

A main view usually includes:

- `viewId`
- `title`
- `webviewUrl`
- `initialRoute`

### Host layout rule

Extension main views are rendered in a full-width, full-height main-panel container.

They are not constrained to the centered conversation column.

This matters for extension authors because your webview can use the full application content area.

---

## 8. Quick actions

Extensions can contribute quick actions through `ui.quickActions`.

These are shown in the horizontal quick-action rail when the current UI context allows them.

### Current limits

- maximum of `2` quick actions per extension in the home quick-action rail
- additional quick actions are ignored by the UI

### Recommended quick action shape

```json
{
  "ui": {
    "quickActions": [
      {
        "id": "your.create",
        "title": "Create something",
        "description": "Optional",
        "scope": "global-thread",
        "deeplink": {
          "viewId": "your.main",
          "target": "open-create",
          "params": { "preset": "default" },
          "createConversation": true,
          "prefillPrompt": "Optional prompt injected into the composer"
        }
      }
    ]
  }
}
```

### Supported fields

- `id`: stable identifier used for usage tracking
- `title`: visible label
- `description`: optional helper text
- `scope`: visibility context
- `deeplink`: instruction for opening an extension view and optionally preparing a thread

### Scope values currently used

- `always`
- `global-thread`
- `project-thread`
- `global-or-no-thread`

Default behavior is equivalent to `always`.

### Important product rule

If `deeplink.createConversation = true`, the created thread is always a global thread.

It is not attached to the currently selected project.

If `prefillPrompt` is provided, Chatons inserts it into the new composer and places the caret at the end.

---

## 9. Deeplink contract

When Chatons opens an extension main view through a deeplink, it sends a browser message event into the extension page.

Current payload shape:

```js
window.postMessage({
  type: 'chaton.extension.deeplink',
  payload: {
    viewId: 'your.main',
    target: 'open-create',
    params: {}
  }
}, '*')
```

Recommended extension-side listener:

```js
window.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || data.type !== 'chaton.extension.deeplink') return;
  const payload = data.payload || {};
  if (payload.viewId !== 'your.main') return;

  if (payload.target === 'open-create') {
    // react here
  }
});
```

---

## 10. LLM tools exposed by extensions

Extensions can expose tools directly to the model inside Chatons threads.

To do that, an extension needs:

- capability `llm.tools`
- `llm.tools[]` metadata in the manifest
- a matching exposed API in `apis.exposes[]`

### Execution flow

1. the model decides to call the extension tool
2. Chatons routes the request through the extension runtime bridge
3. the matching extension API runs
4. the result is serialized back to the model as tool output

### Current constraints

- one LLM tool maps to one exposed extension API with the same logical name
- results are returned as JSON text payloads
- tool names sent through Pi must match `^[a-zA-Z0-9_-]+$`
- if a declared manifest tool name does not satisfy that rule, Chatons normalizes the Pi-exposed tool name automatically while still calling the original extension API name internally

---

## 11. Injected UI helpers for extension pages

For extension `mainView` pages, Chatons injects a lightweight helper layer under `window.chatonUi`.

Available helpers today:

- `ensureStyles()`
- `createModelPicker(options)`
- `createButton(options)`
- `createComponents()`

Extensions are still free to use their own UI stack. The helper exists to make visually aligned extension pages easier to build.

### Model picker helper

The injected model picker mirrors Chatons conventions:

- scoped models by default
- `more` toggle to reveal all models
- text filtering
- selected model management through helper methods

Basic example:

```js
const picker = window.chatonUi.createModelPicker({
  host: document.getElementById('modelHost'),
  onChange: (modelKey) => {
    localStorage.setItem('my-extension:model', modelKey);
  }
});

const res = await window.chaton.listPiModels();
if (res.ok) {
  picker.setModels(res.models);
  picker.setSelected(localStorage.getItem('my-extension:model'));
}
```

### Base DOM helpers

`createComponents()` returns a small DOM-oriented toolkit with helpers like:

- `cls(...)`
- `el(tag, className?, text?)`
- `createButton(...)`
- `createBadge(...)`
- `ensureStyles()`

Current variants:

- buttons: `default`, `outline`, `ghost`
- badges: `default`, `secondary`, `outline`

---

## 12. Runtime server processes

An extension can declare a local server process in `server.start`.

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
- if `readyUrl` is provided, Chatons polls it until it returns HTTP 200 or the timeout expires
- a server can also be registered at runtime from the UI through `window.chaton.registerExtensionServerFromUi(...)`

Environment variables exposed to extension servers include:

- `CHATON_EXTENSION_ID`
- `CHATON_EXTENSION_ROOT`
- `CHATON_EXTENSION_DATA_DIR`

---

## 13. Quick-action ranking

Quick actions are not displayed in fixed insertion order forever.

Chatons keeps usage statistics and sorts them with a recency-weighted score.

Stored concepts include:

- raw use count
- decayed score
- last-used timestamp

Current decay parameter:

- half-life of `14 days`

This means recent habits rise and stale habits gradually lose weight.

---

## 14. Persistence used by the extension platform

The extension runtime currently uses SQLite tables including:

- `extension_kv`
- `extension_queue`
- `quick_actions_usage`

What they are for:

- `extension_kv`: namespaced key-value persistence
- `extension_queue`: persistent queue with retry/dead-letter handling
- `quick_actions_usage`: usage-based sorting and statistics for quick actions

For file storage, the extension platform also uses a sandboxed directory under:

- `~/.chaton/extensions/data/<extensionId>/`

---

## 15. Channel extensions

Chatons supports a documented extension profile for messaging bridges.

Channel extensions are identified by:

- `kind: "channel"`

Current product behavior:

- if at least one enabled channel extension is installed, Chatons shows a dedicated `Channels` sidebar entry
- channel extensions are grouped inside that page instead of appearing as separate sidebar entries
- inbound channel messages are intended for global threads only, not project conversations

For the detailed contract, use:

- `docs/EXTENSIONS_CHANNELS.md`

---

## 16. Translation ownership

The Chatons host does not auto-translate extension labels.

That includes fields such as:

- `ui.menuItems[].label`
- `ui.mainViews[].title`
- other manifest-provided labels

If an extension needs localization, the extension must own it.

---

## 17. Recommended workflow for local extension development

The most reliable workflow today is:

1. create a folder under `~/.chaton/extensions/<extension-id>`
2. add a valid `chaton.extension.json`
3. add the referenced HTML, JS, and assets
4. restart Chatons
5. inspect extension logs or run health checks from the Extensions screen

This restart step matters because runtime hot reload is not the fully reliable path yet.

---

## 18. What to document carefully

When writing or updating extension docs, avoid overstating these areas.

Current real limitations include:

- restart is still the safe path after manifest or runtime file changes
- channel classification is a documented contract layered on top of the extension platform, not a completely separate host subsystem
- LLM tool exposure is capability-gated and JSON-oriented, not an arbitrary code bridge
- extension-provided translation is extension-owned, not host-managed

If you change any of those behaviors, update this file and the related extension docs in the same change.
