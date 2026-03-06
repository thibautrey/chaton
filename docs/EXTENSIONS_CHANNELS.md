# Channel Extensions

This document defines the V1 contract for Chatons `Channel` extensions.

A `Channel` extension is a bridge between Chatons and an external messaging platform.
Examples: Telegram, WhatsApp, Slack, Discord, email-style inbox gateways, SMS relays.

Goal:
- receive messages coming from outside Chatons
- map them into Chatons global threads (non-project conversations)
- optionally send Chatons replies back to the external channel

Important V1 rule:
- inbound Channel messages are always routed to **global threads**
- they must **not** create or target project conversations
- in database terms, the target conversation must have `project_id = null`

---

## 1. Positioning in the current extension platform

In V1, a Channel extension is defined as a specialized Chatons extension profile built on top of the existing extension platform.

It is identified by:
- manifest field: `"kind": "channel"`

This kind has product-level UI behavior:
- Channel extensions are not allowed to appear as standalone sidebar entries through their own `ui.menuItems`
- if at least one enabled Channel extension is installed, Chatons shows a dedicated `Channels` sidebar item under `Extensions`
- this entry opens a dedicated Channels configuration screen listing installed Channel extensions
- from that screen, the user opens each Channel extension's dedicated configuration view

It uses the current extension mechanisms:
- manifest: `chaton.extension.json`
- capabilities
- extension APIs (`apis.exposes[]`)
- optional UI main view for setup/status
- optional `llm.tools[]` for model-side actions
- optional event subscription/publication
- optional queue consumption/publication
- optional KV/files storage

So `Channel` is currently a **documented extension contract and category**, not a new low-level host manifest field enforced by the runtime.

Recommended product metadata:
- expose the extension to users as a "Channel" integration
- mention the provider/platform in the extension name and description
- optionally add `config.kind = "channel"` in registry-side metadata if the catalog/UI wants to group such extensions later

---

## 2. What a Channel extension does

A Channel extension acts as a messaging bridge.

Typical responsibilities:
- authenticate to an external platform
- receive inbound messages/webhooks/polls from that platform
- identify the remote user/conversation
- find or create the matching Chatons global thread
- inject the inbound message into Chatons
- optionally observe Chatons replies and deliver them back to the remote platform
- persist remote/thread mapping state
- handle retries, deduplication, and delivery failures

Examples:
- Telegram bot -> Chatons global thread
- WhatsApp business inbox -> Chatons global thread
- Slack DM -> Chatons global thread

Non-goals in V1:
- project-thread routing
- worktree/repo-aware routing
- multi-project dispatch
- rich bidirectional attachment sync contract
- built-in host-managed webhook server contract

---

## 3. Routing model

### 3.1 Global-thread only

Messages coming from a Channel extension are considered external conversational input.
They must be routed into non-project conversations only.

Rules:
- create or reuse a Chatons conversation with `project_id = null`
- never attach a Channel session to a project conversation
- if a remote identity is already mapped to a project conversation, the extension should treat that as invalid state and create/migrate to a global thread strategy instead of writing into the project thread

### 3.2 Suggested identity model

A Channel extension should maintain a mapping such as:
- `channelId`: stable extension-local channel identifier
- `remoteThreadId`: platform-side conversation/chat identifier
- `remoteUserId`: platform-side sender identifier
- `chatonsConversationId`: Chatons conversation id

Recommended uniqueness key:
- `(extensionId, remoteThreadId)` for shared chats
- or `(extensionId, remoteUserId)` for direct-message style channels

Store this mapping in:
- `storage.kv`
- or extension-owned files under `~/.chaton/extensions/data/<extensionId>/`

---

## 4. Recommended manifest shape

A Channel extension uses the standard extension manifest.

Minimal recommended manifest:

```json
{
  "id": "@chaton/channel-telegram",
  "name": "Telegram Channel",
  "version": "1.0.0",
  "kind": "channel",
  "capabilities": [
    "ui.mainView",
    "storage.kv",
    "queue.publish",
    "queue.consume",
    "events.subscribe",
    "events.publish",
    "host.notifications",
    "host.conversations.read"
  ],
  "ui": {
    "mainViews": [
      {
        "viewId": "telegram.main",
        "title": "Telegram",
        "webviewUrl": "chaton-extension://@chaton/channel-telegram/index.html",
        "initialRoute": "/"
      }
    ]
  },
  "apis": {
    "exposes": [
      { "name": "channel.connect", "version": "1.0.0" },
      { "name": "channel.disconnect", "version": "1.0.0" },
      { "name": "channel.status", "version": "1.0.0" },
      { "name": "channel.receive", "version": "1.0.0" },
      { "name": "channel.send", "version": "1.0.0" }
    ]
  },
  "llm": {
    "tools": [
      {
        "name": "channel.send",
        "label": "Send channel message",
        "description": "Send a reply to the external messaging channel mapped to the current bridge state.",
        "parameters": {
          "type": "object",
          "properties": {
            "conversationId": { "type": "string" },
            "text": { "type": "string" }
          },
          "required": ["conversationId", "text"]
        }
      }
    ]
  }
}
```

Notes:
- `kind: "channel"` is required for Chatons to classify the extension as a Channel integration
- `ui.mainView` is recommended for setup, auth, diagnostics, and mapping inspection
- Channel extensions must not rely on `ui.menuItems` to create their own sidebar entry; Chatons exposes them through the dedicated `Channels` screen instead
- `storage.kv` is strongly recommended for connection and mapping state
- `queue.publish` / `queue.consume` are strongly recommended for robust inbound/outbound delivery
- `host.conversations.read` is useful to inspect existing global threads
- `llm.tools` is optional; use it only if the model must explicitly call extension operations

---

## 5. Channel API contract

The host runtime does not enforce these API names automatically, but this is the recommended V1 contract for Channel extensions.

### 5.1 `channel.connect`

Purpose:
- configure or authenticate the bridge against the external provider

Input:

```json
{
  "type": "object",
  "properties": {
    "config": { "type": "object" },
    "interactive": { "type": "boolean" }
  }
}
```

Expected result:

```json
{
  "connected": true,
  "account": {
    "id": "bot-123",
    "label": "My Telegram Bot"
  }
}
```

### 5.2 `channel.disconnect`

Purpose:
- revoke local connection state and stop bridge activity

Input:

```json
{
  "type": "object",
  "properties": {}
}
```

Expected result:

```json
{
  "disconnected": true
}
```

### 5.3 `channel.status`

Purpose:
- report bridge health and current connection state

Expected result:

```json
{
  "connected": true,
  "provider": "telegram",
  "account": {
    "id": "bot-123",
    "label": "My Telegram Bot"
  },
  "counters": {
    "mappedThreads": 12,
    "pendingInbound": 0,
    "pendingOutbound": 1,
    "deadLetters": 0
  },
  "lastInboundAt": "2026-03-06T06:10:00.000Z",
  "lastOutboundAt": "2026-03-06T06:10:12.000Z"
}
```

### 5.4 `channel.receive`

Purpose:
- ingest an inbound platform event into the extension runtime
- normalize it
- resolve/create a Chatons global thread
- hand off message delivery to Chatons

This API can be used by:
- an embedded polling loop
- a local relay/webhook process
- an extension UI test harness
- a queue worker

Input schema:

```json
{
  "type": "object",
  "properties": {
    "messageId": { "type": "string" },
    "remoteThreadId": { "type": "string" },
    "remoteUserId": { "type": "string" },
    "remoteUserName": { "type": "string" },
    "text": { "type": "string" },
    "attachments": {
      "type": "array",
      "items": { "type": "object" }
    },
    "timestamp": { "type": "string" },
    "raw": { "type": "object" }
  },
  "required": ["remoteThreadId", "remoteUserId"]
}
```

Expected result:

```json
{
  "accepted": true,
  "deduplicated": false,
  "conversationId": "chatons-conv-id",
  "routing": "global-thread"
}
```

Rules:
- `routing` must always be `global-thread` in V1
- duplicate external events should return `deduplicated: true`
- the extension should store enough metadata to avoid replaying the same inbound message twice

### 5.5 `channel.send`

Purpose:
- deliver a Chatons-originated reply to the remote messaging platform

Input schema:

```json
{
  "type": "object",
  "properties": {
    "conversationId": { "type": "string" },
    "remoteThreadId": { "type": "string" },
    "text": { "type": "string" },
    "attachments": {
      "type": "array",
      "items": { "type": "object" }
    },
    "replyToExternalMessageId": { "type": "string" }
  },
  "required": ["text"]
}
```

Expected result:

```json
{
  "sent": true,
  "externalMessageId": "provider-message-id"
}
```

Rules:
- `conversationId` should map to a known Channel-managed global thread, or the call should fail explicitly
- if both `conversationId` and `remoteThreadId` are provided, they must resolve to the same bridge mapping

---

## 6. Inbound delivery contract

### 6.1 Normalized inbound message

A Channel extension should normalize provider payloads to a structure close to:

```ts
type ChannelInboundMessage = {
  messageId?: string
  remoteThreadId: string
  remoteUserId: string
  remoteUserName?: string
  text?: string
  attachments?: Array<{
    kind: 'image' | 'file' | 'audio' | 'video' | 'unknown'
    url?: string
    mimeType?: string
    name?: string
    size?: number
  }>
  timestamp?: string
  raw?: Record<string, unknown>
}
```

### 6.2 Delivery into Chatons

Current runtime note:
- the host now exposes generic bridge helpers usable by any extension through `extensions:hostCall`
- `channels.upsertGlobalThread`: resolve or create a global conversation for a stable external mapping key
- `channels.ingestMessage`: inject an external inbound message into a global conversation and run it through the normal Pi thread flow
- `conversations.getMessages`: read cached conversation messages for outbound mirroring or diagnostics

These helpers are generic and are not Telegram-specific.
They are intended to be the reusable host-side bridge for Channel-style extensions.

---

## 7. Outbound delivery contract

A Channel extension may support outbound reply mirroring.

Recommended trigger source:
- subscribe to `conversation.agent.ended`
- inspect the target conversation
- if it is mapped to an external thread owned by the channel extension, extract the latest assistant-visible reply and send it through `channel.send`

Important limitation in current host events:
- current event payloads are minimal and may not contain the fully rendered assistant reply body needed for outbound mirroring
- practical implementations may require an additional host API to fetch the latest conversation messages or to subscribe to richer message events

So outbound mirroring is part of the V1 contract, but may require extra host support to be fully implemented cleanly.

---

## 8. Capabilities guidance

Recommended capabilities by concern:

### Required in practice
- `storage.kv`: connection state, remote/thread mapping, cursors, dedup markers

### Strongly recommended
- `queue.publish`
- `queue.consume`
- `events.subscribe`
- `host.conversations.read`
- `ui.mainView`

### Optional
- `events.publish`
- `storage.files`
- `host.notifications`
- `llm.tools`

Guidance:
- prefer queue-backed ingestion for provider retries and rate-limit smoothing
- prefer KV for small mapping/state
- prefer files only for larger provider snapshots or debug dumps

---

## 9. Reliability requirements

Channel extensions interact with external systems and must be resilient.

### 9.1 Deduplication

Inbound events should be idempotent.
Use one of:
- provider message id
- webhook delivery id
- `(remoteThreadId, providerTimestamp, hash(text))`

### 9.2 Queue usage

Recommended pattern:
1. poll/webhook receives raw provider event
2. normalize event
3. enqueue normalized event with idempotency key
4. queue worker consumes event
5. resolve/create Chatons global thread
6. inject into Chatons
7. ack only after successful handoff

### 9.3 Dead letters

If a message cannot be processed after retries:
- nack it until dead-lettered
- expose dead-letter count in `channel.status`
- show diagnostics in the extension main view

### 9.4 Rate limits

The extension should implement provider-specific rate-limit handling for:
- sending replies
- polling
- media fetches

---

## 10. Security and privacy

Channel extensions usually hold external credentials and user messages.

Rules:
- store only the minimum credential set needed
- never log raw secrets
- mask remote tokens in UI and logs
- avoid persisting unnecessary raw provider payloads long-term
- document what provider data is mirrored into Chatons
- remember that all Channel inbound messages become part of Chatons conversation history

Recommended UI disclosures:
- connected account name
- last sync time
- number of mapped threads
- whether outbound reply mirroring is enabled
- a warning that external messages are imported into Chatons global threads

---

## 11. UX expectations

A good Channel extension should provide a `mainView` with:
- connection/auth screen
- health/status panel
- thread mapping inspection
- dead-letter/retry visibility
- test-send / test-receive controls
- clear statement that imported messages go to global threads

Recommended copy:
- "Messages received from this channel are imported into Chatons as global threads."

---

## 12. Example lifecycle

Telegram example:

1. User installs `@chaton/channel-telegram`
2. User opens `telegram.main`
3. Extension runs `channel.connect`
4. Extension stores bot token and connection metadata in KV
5. Telegram webhook or poll receives message from `chatId = 123`
6. Extension normalizes event into `ChannelInboundMessage`
7. Extension resolves mapping:
   - if `chatId = 123` already mapped, reuse that Chatons conversation
   - otherwise create a new global thread mapping
8. Extension injects the text into Chatons
9. Chatons processes it as a normal non-project thread message
10. When Chatons produces a reply, the extension can mirror it back to Telegram through `channel.send`

---

## 13. Current gaps vs desired host support

To make Channel extensions first-class, the host should eventually expose dedicated APIs such as:
- create/find global conversation by external identity
- append inbound external message to a conversation
- fetch latest assistant reply for a conversation
- subscribe to richer message-level events for outbound mirroring
- optional hosted local webhook endpoint registration

These are not all available yet in the current runtime.

So this document defines the **target extension contract** for Channel integrations while staying aligned with the current extension architecture.

---

## 14. Summary

A Channel extension is a messaging bridge extension.

V1 contract:
- built on the standard Chatons extension platform
- routes external inbound messages into Chatons **global threads only**
- manages remote/thread mapping itself
- should expose `channel.connect`, `channel.disconnect`, `channel.status`, `channel.receive`, and optionally `channel.send`
- should use queues, deduplication, and KV storage for robustness
- may require additional host bridge APIs for full production-grade inbound/outbound message injection
