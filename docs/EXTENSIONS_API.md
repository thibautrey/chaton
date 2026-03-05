# Extensions API (V1)

This document describes the API contracts implemented for the Chatons extension platform.

## Manifest
- File: `chaton.extension.json`
- Supported fields:
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

## Emitted Host Events
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

## Extension I18n
- The Chatons host does not translate extension labels/titles.
- UI fields from the manifest (`ui.menuItems[].label`, `ui.mainViews[].title`, etc.) are rendered as-is.
- Each extension is responsible for its own translation system (catalogs, active locale, fallbacks).
- Product rule: no implicit or automatic translation on the Chatons side for content provided by an extension.

## Persistent Queue
- DB storage: `extension_queue` table
- Semantics: at-least-once
- States: `queued`, `processing`, `done`, `dead`
- Retry: exponential, then DLQ

## Extension Storage
- Namespaced KV: `extension_kv` table
- Sandboxed files: `~/.chaton/extensions/data/<extensionId>/`

## Extension Service API
- Cross-extension call: `extensions:call(callerExtensionId, extensionId, apiName, versionRange, payload)`
