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

## LLM-exposed tools in threads
Extensions can now expose tools that are injected into Pi thread sessions and callable by the LLM during normal conversation turns.

Manifest contract:

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

Rules:
- each `llm.tools[]` entry must map to an exposed API with the same `name`
- the runtime bridges LLM tool execution to `extensions:call('chatons-llm', extensionId, apiName, '^1.0.0', payload)`
- declared tools are added to the Pi session as `customTools`, so they are visible in the thread context and usable immediately by the model
- the extension must declare capability `llm.tools`, otherwise the manifest entries are ignored
- tool results are returned to the model as JSON text output

Current implementation note:
- LLM tool execution is currently synchronous through the Chatons extension runtime bridge
- tool authorization is capability-gated at manifest level (`llm.tools`)
