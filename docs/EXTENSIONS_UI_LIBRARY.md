# Chatons Extension UI Library

Primary implementation file:

- `electron/extensions/runtime/ui-bridge.ts`

---

## 1. What gets injected

For extension `mainView` pages, Chatons injects helpers under:

- `window.chatonUi`

Current helpers include:

- `ensureStyles()`
- `createModelPicker(options)`
- `createButton(options)`
- `createComponents()`

Chatons also augments `window.chaton` with:

- `registerExtensionServerFromUi(...)`

That helper lets an extension UI register a local server configuration at runtime.

---

## 2. Design intent

The helper layer exists to solve a practical problem.

Many extensions want to be self-contained HTML pages, but still feel visually at home inside Chatons.

The injected UI layer helps with that by providing:

- a shared visual baseline
- a few reusable controls
- a model picker that matches Chatons behavior
- simple DOM helpers for non-React extensions

It does **not** try to be:

- a full component framework
- a React replacement
- a stable design-token API for every Chatons surface

---

## 3. Styling model

`ensureStyles()` injects a style block into the extension page if it is not already present.

The current style layer defines variables such as:

- background
- foreground
- card
- primary
- muted
- accent
- border
- input
- focus ring

These values are chosen to align with Chatons' visual language, especially for simple extension pages.

The helper also defines the styling used by the injected model picker.

---

## 4. `createButton(options)`

Creates a styled button element.

Current options used by the helper:

- `text`
- `variant`
- `type`

Current button variants:

- `default`
- `outline`
- `ghost`

Example:

```js
const button = window.chatonUi.createButton({
  text: 'Run',
  variant: 'default',
  type: 'button'
});
```

---

## 5. `createModelPicker(options)`

This is the most useful helper for many extensions.

It creates a model picker that mirrors Chatons' own conventions.

### Current behavior

- shows scoped models by default
- exposes a `more` toggle to reveal all models
- supports text filtering when all-model mode is open
- notifies the extension when selection changes
- exposes helper methods for model list and current selection

### Required option

- `host`: an existing HTMLElement where the picker will mount

### Optional options

- `onChange(modelKey)`
- `labels`

Current label keys:

- `filterPlaceholder`
- `more`
- `scopedOnly`
- `noScoped`
- `noModels`

### Example

```js
const picker = window.chatonUi.createModelPicker({
  host: document.getElementById('modelHost'),
  onChange: (modelKey) => {
    localStorage.setItem('my-extension:model', modelKey);
  },
  labels: {
    filterPlaceholder: 'Filter models...',
    more: 'more',
    scopedOnly: 'scoped only',
    noScoped: 'No scoped models',
    noModels: 'No models'
  }
});

const res = await window.chaton.listPiModels();
if (res.ok) {
  picker.setModels(res.models);
  picker.setSelected(localStorage.getItem('my-extension:model'));
}
```

### Returned API

- `setModels([{ id, provider, key, scoped }])`
- `setSelected(modelKey | null)`
- `getSelected()`
- `destroy()`

### Behavior details worth knowing

- if scoped-only mode has no visible models, the picker shows the `noScoped` message
- if all-model mode has no visible models, it shows the `noModels` message
- switching between scoped-only and all-model mode re-renders the current options list

---

## 6. `createComponents()`

This helper returns a small DOM-oriented toolkit.

It is useful when an extension wants to stay framework-free and still build a tidy UI quickly.

Current helpers returned:

- `cls(...classNames)`
- `el(tag, className?, text?)`
- `createButton(...)`
- `createBadge(...)`
- `ensureStyles()`

### Badge variants

Current badge variants:

- `default`
- `secondary`
- `outline`

### Example

```js
const ui = window.chatonUi.createComponents();
ui.ensureStyles();

const title = ui.el('h2', '', 'My Extension');
const button = ui.createButton({ text: 'Execute', variant: 'default' });
const badge = ui.createBadge({ text: 'Beta', variant: 'secondary' });
```

---

## 7. Runtime server registration from the UI

Chatons also injects:

- `window.chaton.registerExtensionServerFromUi(...)`

This function validates a payload and forwards it to the host bridge if available.

Typical fields supported by the injected bridge include:

- `extensionId`
- `command`
- `args`
- `cwd`
- `env`
- `readyUrl`
- `healthUrl`
- `expectExit`
- `startTimeoutMs`
- `readyTimeoutMs`

This is useful when the extension wants to decide server startup details dynamically instead of declaring everything statically in the manifest.

---

## 8. Host layout behavior

Extension `mainView` pages are mounted in a full-width, full-height main-panel container.

That means:

- no standard centered conversation-column constraint
- no extra host padding intended to mimic the chat view
- an extension page can behave more like a full app screen

For extension authors, this makes it reasonable to build:

- admin pages
- dashboards
- configuration screens
- catalog-like interfaces

---

## 9. Best practices

If you want an extension to feel native without overengineering it, the best current approach is:

- use `window.chatonUi.ensureStyles()` early
- use the injected model picker instead of rebuilding model-scope behavior yourself
- use the DOM helpers for simple buttons, badges, and structure
- keep the extension self-contained rather than depending on the host renderer build pipeline

---

## 10. Reference implementation

The built-in automation extension is the main reference implementation for this helper layer.

Useful files:

- `electron/extensions/builtin/automation/index.html`
- `electron/extensions/builtin/automation/index.js`
- `electron/extensions/builtin/automation/components.js`

It shows how to build a self-contained extension page that still looks integrated with Chatons.

---

## 11. Current limits

The UI helper layer is intentionally small.

Current limits include:

- no imposed React framework
- no full layout system
- no large stable component catalog
- no extension-specific theming API beyond the injected helper styles
- a DOM-first API designed for plain HTML extension pages

That is by design. The goal is to reduce friction, not to lock extension authors into a host UI framework.
