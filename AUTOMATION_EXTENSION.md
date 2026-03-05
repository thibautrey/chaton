# Extension builtin `@chaton/automation`

## Objectif
Remplacer le mock Automatisations par une extension réelle.

## APIs exposées
- `automation.rules.list`
- `automation.rules.save`
- `automation.rules.delete`
- `automation.runs.list`

## Modèle de règle
- `id`
- `name`
- `enabled`
- `trigger`
- `conditions[]`
- `actions[]`
- `cooldown`
- `createdAt`
- `updatedAt`

## Triggers V1
- `conversation.created`
- `conversation.message.received`
- `project.created`
- `conversation.agent.ended`

Validation côté runtime:
- `automation.rules.save` refuse tout trigger hors de cette liste.
- `conversation.created` fait partie de la liste supportée et validée.

## Actions V1
- `notify`
- `enqueueEvent`
- `runHostCommand` (allowlist)
- `setConversationTag` (no-op V1)

## UI
- Vue principale: `automation.main`
- Écran extension autonome (self-contained, non compilé par le renderer Chatons):
  - `electron/extensions/builtin/automation/index.html`
  - `electron/extensions/builtin/automation/index.js`
  - `electron/extensions/builtin/automation/chaton.extension.json`
- Navigation: mode `extension-main-view`

## I18n
- Les libellés/titres de l'extension sont fournis par l'extension elle-même.
- Chatons ne doit pas traduire automatiquement ces libellés.
