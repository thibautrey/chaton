# Built-in extension `@chaton/automation`

## Goal
Replace the Automation mock with a real extension.

## Exposed APIs
- `automation.rules.list`
- `automation.rules.save`
- `automation.rules.delete`
- `automation.runs.list`
- `automation.schedule_task`
- `automation.list_scheduled_tasks`

## Rule Model
- `id`
- `name`
- `enabled`
- `trigger`
- `conditions[]`
- `actions[]`
- `cooldown`
- `createdAt`
- `updatedAt`

## V1 Triggers
- `conversation.created`
- `conversation.message.received`
- `project.created`
- `conversation.agent.ended`

Runtime validation:
- `automation.rules.save` rejects any trigger outside this list.
- `conversation.created` is part of the supported and validated list.

## V1 Actions
- `notify`
- `enqueueEvent`
- `runHostCommand` (allowlist)
- `setConversationTag` (no-op V1)

## LLM tools
The automation extension now exposes LLM-callable tools in threads via manifest capability `llm.tools`.

Current tools:
- `automation.schedule_task`: creates or updates an automation rule from natural-language task instructions
- `automation.list_scheduled_tasks`: lists current automation rules so the model can inspect existing scheduled tasks

These tools are injected into Pi thread sessions and are callable by the LLM during normal conversation turns.

## UI
- Main view: `automation.main`
- Standalone extension screen (self-contained, not compiled by the Chatons renderer):
  - `electron/extensions/builtin/automation/index.html`
  - `electron/extensions/builtin/automation/index.js`
  - `electron/extensions/builtin/automation/chaton.extension.json`
- Navigation: `extension-main-view` mode

## I18n
- Extension labels/titles are provided by the extension itself.
- Chatons must not automatically translate these labels.
