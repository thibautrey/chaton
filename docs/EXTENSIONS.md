# Extensions

This page documents the current Chatons extension contract, including quick actions, UI deeplinks, and adaptive usage-based sorting.

## Manifest (`chaton.extension.json`)

Minimal example:

```json
{
  "id": "@chaton/your-extension",
  "name": "Your Extension",
  "version": "1.0.0",
  "capabilities": ["ui.mainView"],
  "ui": {
    "mainViews": [
      {
        "viewId": "your.main",
        "title": "Your View",
        "webviewUrl": "chaton-extension://@chaton/your-extension/index.html",
        "initialRoute": "/"
      }
    ]
  }
}
```

## Quick Actions

Extensions can declare quick actions in `ui.quickActions`.

- Limit: maximum `2` quick actions per extension (additional ones are ignored in the UI).
- Quick actions are shown in the horizontal rail of home cards.
- Clicking an action increments its usage counter (persisted in DB).

Recommended schema:

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

Fields:

- `id` (string, required): stable unique identifier (used for usage stats).
- `title` (string, required): visible label in the card.
- `description` (string, optional): helper subtext.
- `scope` (optional): card display context.
  - `always`: always visible.
  - `global-thread`: visible only in global thread mode (outside a project).
  - `project-thread`: visible only in project thread mode.
  - `global-or-no-thread`: visible in global context and when no thread is selected.
  - default: `always`.
- `deeplink` (optional):
  - `viewId` (required): `mainView` to open.
  - `target` (required): targeted action in the view.
  - `params` (optional): free-form payload.
  - `createConversation` (optional, bool): creates a new thread before opening the view.
  - `prefillPrompt` (optional, string): prefilled text in the new thread composer.

Important rule:

- If `deeplink.createConversation = true`, the created thread is always global (outside a project), even if a project is selected.
- The cursor is placed at the end of the prefilled text.

## Deeplinks (Generic Contract)

When a quick action with `deeplink` is clicked:

1. Chatons opens the target `mainView` (`viewId`).
2. Chatons sends a message to the view iframe:

```ts
window.postMessage({
  type: 'chaton.extension.deeplink',
  payload: {
    viewId: 'your.main',
    target: 'open-create',
    params: { /* optional */ }
  }
}, '*')
```

On the extension side (inside the webview page), listen for:

```js
window.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || data.type !== 'chaton.extension.deeplink') return;
  const payload = data.payload || {};
  if (payload.viewId !== 'your.main') return;

  if (payload.target === 'open-create') {
    // Open the creation panel
  }
});
```

## LLM Tools Exposed By Extensions

Extensions can now expose tools directly to the model inside Chatons threads.

How it works:
- declare capability `llm.tools`
- declare tool metadata in `llm.tools[]` inside `chaton.extension.json`
- expose a matching extension API with the same name in `apis.exposes[]`
- Chatons injects these tools into Pi session creation, making them available to the LLM during thread execution

Tool execution flow:
1. the model decides to call the extension tool
2. Chatons routes the tool call to `extensions:call`
3. the extension API returns structured data
4. Chatons serializes the result back to the model as tool output

Important constraints:
- today, the runtime maps one LLM tool to one exposed extension API of the same name
- tool results are returned as JSON text payloads
- use clear parameter schemas and stable API names
- Pi/API transport expects tool names matching `^[a-zA-Z0-9_-]+$`; when an extension manifest declares an invalid name, Chatons normalizes the exposed tool name automatically and keeps the original API name for `extensions:call`

## Extension UI Helpers (Injected)

For extension `mainView` pages loaded by Chatons, a lightweight helper object is injected automatically.

Extensions remain free to ship their own UI, but Chatons now also provides a small UI library aligned with the app visual language so extensions can opt into stronger consistency.

Available helpers:

- `window.chatonUi.ensureStyles()`
- `window.chatonUi.createModelPicker(options)`
- `window.chatonUi.createButton(options)`
- `window.chatonUi.createComponents()`

### Model picker

Use it to render a model picker with scoped/all behavior matching Chatons conventions.

```js
const picker = window.chatonUi.createModelPicker({
  host: document.getElementById('modelHost'),
  onChange: (modelKey) => {
    localStorage.setItem('my-extension:model', modelKey);
  },
  labels: {
    filterPlaceholder: 'Filtrer les modeles...',
    more: 'plus',
    scopedOnly: 'scoped uniquement',
    noScoped: 'Aucun modele scoped',
    noModels: 'Aucun modele disponible',
  },
});

const res = await window.chaton.listPiModels();
if (res.ok) {
  picker.setModels(res.models);
  picker.setSelected(localStorage.getItem('my-extension:model'));
}
```

Helper API:

- `setModels([{ id, provider, key, scoped }])`
- `setSelected(modelKey | null)`
- `getSelected()`
- `destroy()`

### Base UI helpers

For simple DOM-based extension pages:

```js
const ui = window.chatonUi.createComponents();
ui.ensureStyles();

const button = ui.createButton({ text: 'Executer', variant: 'default' });
const badge = ui.createBadge({ text: 'Beta', variant: 'secondary' });
const title = ui.el('h2', '', 'Ma vue extension');
```

Current variants:
- button: `default`, `outline`, `ghost`
- badge: `default`, `secondary`, `outline`

For the broader guidance and positioning of this shared library, see `docs/EXTENSIONS_UI_LIBRARY.md`.

## Quick Action Sorting (Usage + Decay)

Quick actions are automatically sorted with a score that favors recent usage:

- `uses_count`: raw number of uses.
- `decayed_score`: time-weighted score.
- `last_used_at`: latest click.

Behavior:

- On each click: `decayed_score` is first decayed from `last_used_at`, then `+1`.
- Display order is sorted by descending decayed score.
- Result: recent habits rise, older ones progressively lose weight.

Current parameter:

- decay half-life: `14 days`.

## Database

Table: `quick_actions_usage`

- `action_id` (PK)
- `uses_count`
- `decayed_score`
- `last_used_at`
- `created_at`
- `updated_at`

Related migration: `electron/db/migrations/009_quick_actions_usage.sql`.

## Concrete Example: Automation

The `@chaton/automation` extension declares:

- quick action: `Create automation`
- deeplink:
  - `viewId = automation.main`
  - `target = open-create-automation`

The `automation.main` view then listens to `chaton.extension.deeplink` and opens its creation modal.

## UI Notes

- Quick action cards are filtered by `scope` before sorting.
- Cards use enter/exit animations via `AnimatePresence` for smooth transitions.
- Native quick actions:
  - `Create an extension`: scope `global-or-no-thread`.
  - `Create a skill`: scope `global-or-no-thread`.
