# Automation Extension

Built-in extension id:

- `@chaton/automation`

Main implementation files:

- `electron/extensions/builtin/automation/chaton.extension.json`
- `electron/extensions/builtin/automation/index.html`
- `electron/extensions/builtin/automation/index.js`
- `electron/extensions/builtin/automation/components.js`
- `electron/extensions/runtime/automation.ts`

---

## 1. What it does

The automation extension lets Chatons store and run simple automation rules.

A rule currently has:

- an id
- a name
- an enabled flag
- one trigger topic
- optional conditions
- one or more actions
- an optional cooldown
- timestamps

The extension also records automation runs so the UI can show recent execution history.

---

## 2. What users see in the app

The extension contributes:

- a sidebar entry labeled `Automatisations`
- a main view with id `automation.main`
- one quick action that opens the creation flow inside the main view

Manifest details currently shipped:

- sidebar icon: `Gauge`
- sidebar order: `10`
- quick action id: `automation.create`
- quick action deeplink target: `open-create-automation`

---

## 3. Exposed extension APIs

The extension currently exposes these APIs:

- `automation.rules.list`
- `automation.rules.save`
- `automation.rules.delete`
- `automation.runs.list`
- `automation.schedule_task`
- `automation.list_scheduled_tasks`

These are declared in the manifest and implemented in `electron/extensions/runtime/automation.ts`.

---

## 4. Trigger topics supported today

The automation runtime validates triggers against a fixed allowlist.

Current supported triggers:

- `conversation.created`
- `conversation.message.received`
- `project.created`
- `conversation.agent.ended`

If a caller tries to save a rule with any other trigger, the save is rejected.

---

## 5. Action types supported today

The runtime currently understands these action types:

- `notify`
- `enqueueEvent`
- `runHostCommand`
- `setConversationTag`

What they mean in practice:

### `notify`

Shows a host notification.

If no explicit title or body is provided, the runtime derives them from the event topic and payload.

### `enqueueEvent`

Publishes an item into the extension queue system.

This is useful when an automation should trigger downstream work instead of doing everything inline.

### `runHostCommand`

Calls a small allowlisted set of host methods.

Today the allowlist is intentionally narrow:

- `notifications.notify`
- `open.mainView`

Anything else is rejected.

### `setConversationTag`

This is currently a no-op placeholder. The runtime accepts it, but it does not apply a real tag mutation yet.

---

## 6. Conditions

Rules can include conditions.

The current condition evaluator is intentionally simple.

Supported operators today:

- `equals`
- `contains`

Current limitations:

- conditions are evaluated only against top-level fields in the event payload
- nested object-path expressions are not implemented
- unsupported or malformed conditions fail conservatively

---

## 7. Cooldown behavior

Each rule can have a cooldown in milliseconds.

When an event matches a rule:

- Chatons checks the rule's `last_triggered_at`
- if the cooldown window has not elapsed, the rule is skipped
- otherwise it runs and updates the last-triggered timestamp

Cooldown is stored as `cooldown_ms` in persistence.

---

## 8. LLM-callable automation tools

The extension declares capability `llm.tools` and exposes two model-callable tools inside conversations:

- `automation.schedule_task`
- `automation.list_scheduled_tasks`

These are injected into Pi thread sessions and can be called by the model during a normal conversation turn.

### `automation.schedule_task`

Purpose:

- create or update a simple automation rule from natural-language instructions

Current behavior:

- derives a rule name from input when needed
- tries to infer a trigger from either the explicit trigger field or the instruction text
- tries to infer a cooldown from the instruction when none is provided
- stores the resulting rule as an automation record
- creates a default `notify` action carrying the instruction text

Optional fields currently supported by the tool:

- `name`
- `instruction`
- `trigger`
- `cooldown`
- `projectId`
- `modelKey`
- `notifyMessage`
- `id`
- `conditions`
- `enabled`

### `automation.list_scheduled_tasks`

Purpose:

- return existing rules so the model can inspect them before creating or updating one

Supported parameter:

- `limit`

---

## 9. Persistence model

Automation state is stored in the Chatons SQLite database.

Relevant tables used by the automation subsystem:

- `automation_rules`
- `automation_runs`

Stored rule information includes:

- trigger topic
- JSON conditions
- JSON actions
- cooldown
- timestamps
- last-triggered timestamp

Run history includes:

- rule id
- event topic
- serialized event payload
- run status
- optional error message
- creation timestamp

---

## 10. UI implementation style

The built-in automation extension is intentionally self-contained.

Its UI is not compiled as part of the main React renderer. Instead, it is served as extension-owned HTML and JavaScript.

Files:

- `electron/extensions/builtin/automation/index.html`
- `electron/extensions/builtin/automation/index.js`
- `electron/extensions/builtin/automation/components.js`

This extension is also the main reference implementation for Chatons' injected extension UI helper layer.

It uses:

- host visual tokens
- shared DOM helpers
- `window.chatonUi.createModelPicker()`

That makes it the best example to copy if you want a plain-HTML extension page that still looks native to Chatons.

---

## 11. Translation ownership

The automation extension owns its own labels and titles.

Chatons renders extension-provided UI strings as-is.

That means:

- the host does not auto-translate extension labels
- if you localize an extension, the extension must handle that itself

---

## 12. What not to overstate

A few parts of the automation system are intentionally small-scope today.

Be careful not to document it as a full workflow engine.

Current limits include:

- fixed trigger allowlist
- simple condition matching only
- narrow host-command allowlist
- `setConversationTag` is not a full implementation yet
- most LLM-scheduled tasks currently become notification-style rules unless a broader action shape is saved explicitly through the API

That still makes the feature useful, but the docs should describe it as pragmatic automation, not as a generic orchestration platform.
