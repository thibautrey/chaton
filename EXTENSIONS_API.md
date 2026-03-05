# Extensions API (V1)

Ce document décrit les contrats d'API implémentés pour la plateforme d'extensions Chatons.

## Manifest
- Fichier: `chaton.extension.json`
- Champs supportés:
  - `id`, `name`, `version`
  - `entrypoints`
  - `ui.menuItems[]`
  - `ui.mainViews[]`
  - `capabilities[]`
  - `hooks`
  - `apis.exposes[]`, `apis.consumes[]`
  - `compat`

## Capabilities V1
- `ui.menu`
- `ui.mainView`
- `events.subscribe`
- `events.publish`
- `queue.publish`
- `queue.consume`
- `storage.kv`
- `storage.files`
- `host.notifications`
- `host.conversations.read`
- `host.projects.read`

## IPC Host (renderer -> main)
- `extensions:getManifest`
- `extensions:registerUi`
- `extensions:events:subscribe`
- `extensions:events:publish`
- `extensions:queue:enqueue`
- `extensions:queue:consume`
- `extensions:queue:ack`
- `extensions:queue:nack`
- `extensions:queue:deadLetter:list`
- `extensions:storage:kv:get|set|delete|list`
- `extensions:storage:files:read|write`
- `extensions:hostCall`
- `extensions:call`
- `extensions:runtime:health`

## Host events émis
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

## I18n des extensions
- Le host Chatons ne traduit pas les labels/titres d'extension.
- Les champs UI du manifest (`ui.menuItems[].label`, `ui.mainViews[].title`, etc.) sont rendus tels quels.
- Chaque extension est responsable de son propre système de traduction (catalogues, locale active, fallbacks).
- Règle produit: aucune traduction implicite ou automatique côté Chatons pour du contenu fourni par une extension.

## Queue persistante
- Stockage DB: table `extension_queue`
- Sémantique: at-least-once
- États: `queued`, `processing`, `done`, `dead`
- Retry: exponentiel, puis DLQ

## Storage extension
- KV namespaced: table `extension_kv`
- Files sandboxés: `~/.chaton/extensions/data/<extensionId>/`

## API service extension
- Appel inter-extension: `extensions:call(callerExtensionId, extensionId, apiName, versionRange, payload)`
