# Chatons Extension API

**Quick Start:** If you're new to extensions, see `docs/EXTENSIONS_TUTORIAL.md` for a complete working example.

**This document:** Reference for API methods and capabilities.

Related documents:

- `docs/EXTENSIONS_TUTORIAL.md` — Working example with full code
- `docs/EXTENSIONS.md` — Extension overview and concepts
- `docs/EXTENSIONS_CHANNELS.md` — Messaging platform integration
- `docs/EXTENSIONS_UI_LIBRARY.md` — UI components and styling

---

## 1. Quick API Reference (Copy-Paste Examples)

### Storage: Save and Load Data

```javascript
// Declare capability: "storage.kv"

const { api } = window.chatonExtension;

// Save a string
await api.storage.kv.set('mykey', 'myvalue');

// Load it back
const value = await api.storage.kv.get('mykey');
console.log(value); // 'myvalue'

// Save an object (as JSON)
const data = { name: 'John', age: 30 };
await api.storage.kv.set('user', JSON.stringify(data));

// Load and parse object
const json = await api.storage.kv.get('user');
const user = JSON.parse(json);

// Delete a key
await api.storage.kv.delete('mykey');

// List all keys
const keys = await api.storage.kv.list();
console.log(keys); // ['mykey', 'user', ...]
```

### Events: React to Chatons Events

```javascript
// Declare capability: "events.subscribe"

const { api } = window.chatonExtension;

// Subscribe to conversation created
await api.events.subscribe('conversation.created', (data) => {
  console.log('New conversation:', data.conversation.id);
});

// Subscribe to message received
await api.events.subscribe('conversation.message.received', (data) => {
  console.log('Message:', data.message.content);
  console.log('From:', data.message.role); // 'user' or 'assistant'
});

// Subscribe to agent finished
await api.events.subscribe('conversation.agent.ended', (data) => {
  console.log('Agent finished:', data.conversationId);
});

// Subscribe to project created
await api.events.subscribe('project.created', (data) => {
  console.log('New project:', data.project.name);
});

// Publish custom events (if "events.publish" capability)
await api.events.publish('my_extension.custom_event', { data: 'value' });
```

### Notifications: Show Messages to User

```javascript
// Declare capability: "host.notifications"

const { api } = window.chatonExtension;

// Show success notification
await api.host.notifications.show({
  title: "Success",
  body: "Your data was saved",
  type: "success"
});

// Show error
await api.host.notifications.show({
  title: "Error",
  body: "Failed to save",
  type: "error"
});

// Show warning
await api.host.notifications.show({
  title: "Warning",
  body: "This might take a while",
  type: "warning"
});

// Show info
await api.host.notifications.show({
  title: "Info",
  body: "New version available",
  type: "info"
});
```

### Read Conversations

```javascript
// Declare capability: "host.conversations.read"

const { api } = window.chatonExtension;

// Get current conversation
const conv = await api.host.conversations.get();
console.log(conv.id);           // Conversation ID
console.log(conv.messages);     // Array of messages
console.log(conv.model);        // Selected model
console.log(conv.project);      // Project if linked
console.log(conv.accessMode);   // 'secure' or 'open'

// Get specific conversation
const conv2 = await api.host.conversations.get('conv-id-123');

// Get all messages
const messages = await api.host.conversations.getMessages('conv-id-123');
messages.forEach(msg => {
  console.log(msg.role, msg.content); // 'user' or 'assistant', message text
});
```

### File Storage

```javascript
// Declare capability: "storage.files"

const { api } = window.chatonExtension;

// Write file (creates if not exists)
await api.storage.files.write('notes.txt', 'My notes content');

// Read file
const content = await api.storage.files.read('notes.txt');
console.log(content); // 'My notes content'

// List files in directory
const files = await api.storage.files.list('/');
files.forEach(f => console.log(f.name, f.size));

// Delete file
await api.storage.files.delete('notes.txt');

// Create subdirectories (path includes them)
await api.storage.files.write('docs/readme.md', '# My Docs');

// Read from subdirectory
const readme = await api.storage.files.read('docs/readme.md');
```

### Queue: Background Jobs

```javascript
// Declare capabilities: "queue.publish", "queue.consume"

const { api } = window.chatonExtension;

// Publish a job
await api.queue.publish('myqueue', {
  type: 'email',
  to: 'user@example.com',
  subject: 'Hello'
});

// Consume jobs (worker process)
while (true) {
  const job = await api.queue.consume('myqueue', 5000); // 5 sec timeout
  if (!job) continue;
  
  try {
    // Process the job
    if (job.data.type === 'email') {
      await sendEmail(job.data);
    }
    // Mark as processed
    await api.queue.ack(job.id);
  } catch (err) {
    // Mark for retry
    await api.queue.nack(job.id);
  }
}

// Check dead letters (failed jobs)
const deadLetters = await api.queue.deadLetter.list('myqueue');
deadLetters.forEach(job => {
  console.log('Failed job:', job.data, job.error);
});
```

### LLM Tools: Let the Model Call Your Code

```javascript
// Declare capabilities: "llm.tools"

// In your chaton.extension.json:
// {
//   "llm": {
//     "tools": [{
//       "name": "myext_get_weather",
//       "description": "Get current weather",
//       "parameters": {
//         "type": "object",
//         "properties": {
//           "city": { "type": "string" }
//         }
//       }
//     }]
//   }
// }

// In your app.js:
const { api } = window.chatonExtension;

// Handle tool calls
api.llm.tools.onCall('myext_get_weather', async (params) => {
  const weather = await getWeather(params.city);
  return {
    temperature: weather.temp,
    condition: weather.condition,
    city: params.city
  };
});

async function getWeather(city) {
  const resp = await fetch(`https://api.weather.com/${city}`);
  return resp.json();
}
```

---

## 2. Manifest Overview

Extension manifests are stored in `chaton.extension.json`.

The current implementation recognizes fields including:

- `id` — Extension ID (required, format: `@username/chatons-name`)
- `name` — Display name (required)
- `version` — Semantic version (required)
- `capabilities` — Array of permission capabilities (required)
- `ui.menuItems[]` — Sidebar items
- `ui.mainViews[]` — Full-page views
- `ui.quickActions[]` — Quick action buttons
- `llm.tools[]` — LLM-callable tools
- `apis.exposes[]` — APIs you expose
- `apis.consumes[]` — APIs you depend on
- `server.start` — Local server to start
- `hooks` — Lifecycle hooks

Not every extension needs every section.

---

## 3. Capability Model

Capabilities act like permissions. Declare what you need:

```json
{
  "capabilities": [
    "ui.mainView",           // Show main view
    "storage.kv",            // Key-value storage
    "storage.files",         // File storage
    "events.subscribe",      // Listen to events
    "events.publish",        // Emit events
    "queue.publish",         // Create jobs
    "queue.consume",         // Process jobs
    "llm.tools",             // Expose LLM tools
    "host.notifications",    // Show notifications
    "host.conversations.read",  // Read conversations
    "host.conversations.write", // Modify conversations
    "host.projects.read"     // Read projects
  ]
}
```

**Always:**
- Only declare capabilities you actually use
- Runtime rejects operations without matching capability
- Check capability before using APIs

---

## 4. Manifest Field Reference

### `id` (Required)

```json
{
  "id": "@username/chatons-my-extension"
}
```

Format: `@username/chatons-descriptive-name`

Used as:
- Unique identifier
- Namespace for storage
- Package name for npm publishing

### `name` (Required)

```json
{
  "name": "My Extension"
}
```

Displayed in UI.

### `version` (Required)

```json
{
  "version": "1.0.0"
}
```

Semantic versioning. Updated when you publish changes.

### `ui.mainViews[]`

```json
{
  "ui": {
    "mainViews": [{
      "viewId": "unique_id",
      "title": "Display Title",
      "webviewUrl": "chaton-extension://@username/chatons-name/index.html",
      "initialRoute": "/",
      "icon": "BookOpen"
    }]
  }
}
```

Creates a full-page view in Chatons.

### `ui.menuItems[]`

```json
{
  "ui": {
    "menuItems": [{
      "label": "My Extension",
      "icon": "BookOpen",
      "order": 50,
      "openMainView": "viewId"
    }]
  }
}
```

Adds item to sidebar. `order` controls position (lower = higher in list).

Icon names: Use Lucide React icon names (e.g., "BookOpen", "Settings", "Plus", etc.)

### `ui.quickActions[]`

```json
{
  "ui": {
    "quickActions": [{
      "id": "action-id",
      "label": "Action Name",
      "icon": "Plus",
      "action": "openMainView",
      "target": "viewId"
    }]
  }
}
```

Shows in empty conversation state.

### `llm.tools[]`

```json
{
  "llm": {
    "tools": [{
      "name": "myext_tool_name",
      "description": "What this tool does",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": { "type": "string", "description": "..." },
          "param2": { "type": "number" }
        },
        "required": ["param1"]
      }
    }]
  }
}
```

Tools must be referenced in `apis.exposes[]` too.

---

## 5. Error Handling

Always wrap API calls in try/catch:

```javascript
try {
  const value = await api.storage.kv.get('key');
  // Use value
} catch (err) {
  console.error('Storage error:', err.message);
  // Show user-friendly error
  await api.host.notifications.show({
    title: 'Error',
    body: 'Failed to load data',
    type: 'error'
  });
}
```

Common errors:

- **Capability not declared** — "Missing capability: storage.kv"
- **Storage limit exceeded** — "Storage quota exceeded"
- **File not found** — "ENOENT: no such file or directory"
- **Timeout** — "Operation timed out"

---

## 6. Async/Await Pattern

All API operations are async. Always use await:

```javascript
// Wrong - won't work
const value = api.storage.kv.get('key');
console.log(value); // Promise, not the actual value!

// Right
const value = await api.storage.kv.get('key');
console.log(value); // Actual value
```

Or use `.then()`:

```javascript
api.storage.kv.get('key')
  .then(value => console.log(value))
  .catch(err => console.error(err));
```

---

## 7. Host Events

Extension manifests are stored in `chaton.extension.json`.

The current implementation recognizes fields including:

- `id`
- `name`
- `version`
- `entrypoints`
- `capabilities`
- `hooks`
- `ui.menuItems[]`
- `ui.mainViews[]`
- `apis.exposes[]`
- `apis.consumes[]`
- `server.start`
- `llm.tools[]`
- compatibility metadata

Not every field is mandatory for every extension.

---

## 7. Host Events

Events you can subscribe to with `events.subscribe`:

| Event | Data | Use Case |
|-------|------|----------|
| `app.started` | `{ timestamp }` | Ext initialization |
| `conversation.created` | `{ conversation }` | New thread started |
| `conversation.updated` | `{ conversation }` | Thread properties changed |
| `conversation.message.received` | `{ conversation, message }` | New message |
| `conversation.agent.started` | `{ conversation }` | Model started thinking |
| `conversation.agent.ended` | `{ conversation }` | Model finished |
| `project.created` | `{ project }` | New project imported |
| `project.deleted` | `{ project }` | Project removed |
| `extension.installed` | `{ extension }` | Ext installed |
| `extension.enabled` | `{ extension }` | Ext toggled on |

Example:

```javascript
// Listen for new messages
await api.events.subscribe('conversation.message.received', (data) => {
  const { message, conversation } = data;
  console.log('New message:', message.content);
  
  // Store message for later
  const key = `messages:${conversation.id}`;
  const existing = await api.storage.kv.get(key) || '[]';
  const messages = JSON.parse(existing);
  messages.push(message);
  await api.storage.kv.set(key, JSON.stringify(messages));
});
```

---

## 8. Host IPC Surface (Advanced)

The renderer communicates with the extension host through IPC endpoints such as:

- `extensions:getManifest`
- `extensions:registerUi`
- `extensions:events:subscribe`
- `extensions:events:publish`
- `extensions:queue:enqueue`
- `extensions:queue:consume`
- `extensions:queue:ack`
- `extensions:queue:nack`
- `extensions:queue:deadLetter:list`
- `extensions:storage:kv:get`
- `extensions:storage:kv:set`
- `extensions:storage:kv:delete`
- `extensions:storage:kv:list`
- `extensions:storage:files:read`
- `extensions:storage:files:write`
- `extensions:hostCall`
- `extensions:call`
- `extensions:runtime:health`

These IPC names are useful when tracing behavior across the renderer, Electron main process, and extension runtime.

---

## 9. Capabilities Detail

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

If a requested API family does not match the extension's declared capabilities, the runtime rejects the operation.

---

## 9. Capabilities Detail

Capabilities gate access to host features. Declare what you need:

### UI Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `ui.mainView` | Create full-page views |
| `ui.menu` | Add sidebar menu items |

### Storage Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `storage.kv` | Key-value storage (JSON-backed) |
| `storage.files` | File-based storage (sandboxed) |

### Event Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `events.subscribe` | Listen to app events |
| `events.publish` | Emit custom events |

### Queue Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `queue.publish` | Create background jobs |
| `queue.consume` | Process jobs |

### LLM Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `llm.tools` | Expose tools to language model |

### Host Capabilities

| Capability | What It Allows |
|-----------|----------------|
| `host.notifications` | Show desktop notifications |
| `host.conversations.read` | Read conversation data |
| `host.conversations.write` | Modify conversations |
| `host.projects.read` | Read project data |

### Declaring Capabilities

```json
{
  "capabilities": [
    "ui.mainView",
    "storage.kv",
    "events.subscribe",
    "host.notifications"
  ]
}
```

**Important:** If you use an API without declaring its capability, the runtime rejects the operation.

---

## 10. Extension Storage

Namespaced key-value storage is backed by the SQLite table:

- `extension_kv`

This is the right place for:

- settings
- bridge mappings
- cursors
- small extension state

**Usage:**

```javascript
// Save
await api.storage.kv.set('key', 'value');

// Load
const value = await api.storage.kv.get('key');

// Delete
await api.storage.kv.delete('key');

// List all keys
const keys = await api.storage.kv.list();
```

**Limits:**
- Keys are strings (max ~256 chars)
- Values are strings (max ~1 MB)
- Storage is per-extension (namespaced)

### File storage

Extensions also get sandboxed file storage under:

- `~/.chaton/extensions/data/<extensionId>/`

Use that for:

- larger state files
- caches
- imported assets
- provider-specific local artifacts

**Usage:**

```javascript
// Write file
await api.storage.files.write('notes.txt', 'content');

// Read file
const content = await api.storage.files.read('notes.txt');

// List files
const files = await api.storage.files.list('/');

// Delete file
await api.storage.files.delete('notes.txt');

// Subdirectories (created automatically)
await api.storage.files.write('docs/readme.md', '# Docs');
```

---

## 11. Persistent Queue

The extension queue is backed by the SQLite table:

- `extension_queue`

Documented semantics today:

- at-least-once delivery
- retry with backoff
- dead-letter handling

Queue item states include:

- `queued`
- `processing`
- `done`
- `dead`

This makes the queue suitable for extension jobs where occasional retry is acceptable and idempotency can be managed at the extension layer.

The extension queue is backed by the SQLite table:

- `extension_queue`

Documented semantics today:

- at-least-once delivery
- retry with backoff
- dead-letter handling

Queue item states include:

- `queued`
- `processing`
- `done`
- `dead`

This makes the queue suitable for extension jobs where occasional retry is acceptable and idempotency can be managed at the extension layer.

**Usage:**

```javascript
// Publish job
await api.queue.publish('myqueue', { type: 'task', data: 'value' });

// Consume jobs
const job = await api.queue.consume('myqueue', 5000);
if (job) {
  try {
    // Process job
    await doWork(job.data);
    await api.queue.ack(job.id); // Mark done
  } catch (err) {
    await api.queue.nack(job.id); // Retry later
  }
}

// Check failed jobs
const dead = await api.queue.deadLetter.list('myqueue');
```

---

## 12. Cross-Extension APIs

Extensions can expose APIs for other extensions to call.

**In your manifest:**

```json
{
  "apis": {
    "exposes": [
      { "name": "my_feature.do_something", "version": "1.0.0" }
    ]
  }
}
```

**In your code:**

```javascript
// Handle calls from other extensions
api.apis.onCall('my_feature.do_something', async (params) => {
  return { result: 'success' };
});
```

**Other extensions call your API:**

```javascript
const result = await api.apis.call(
  '@yourname/chatons-my-ext',
  'my_feature.do_something',
  { param: 'value' }
);
```

---

## 13. LLM Tools

Chatons does not automatically translate extension labels or titles.

Manifest-provided text is rendered as-is.

That means localization is the extension author's responsibility.

Examples include:

- `ui.menuItems[].label`
- `ui.mainViews[].title`

---

## 9. Extension servers

An extension can declare a local server process to start automatically.

Manifest shape:

```json
{
  "server": {
    "start": {
      "command": "node",
      "args": ["index.js"],
      "cwd": ".",
      "env": { "MY_VAR": "value" },
      "readyUrl": "http://127.0.0.1:4317/health",
      "readyTimeoutMs": 12000,
      "expectExit": false
    }
  }
}
```

Current behavior:

- `command` is required
- `args` are optional
- `cwd` is resolved relative to the extension root and sandboxed to that directory
- if `readyUrl` is set, Chatons polls it until HTTP 200 or timeout
- `expectExit` can be used for one-shot scripts
- the UI can also register a server dynamically through `window.chaton.registerExtensionServerFromUi(...)`

The host may temporarily report that a server is not ready while it is still starting.

---

## 10. LLM-exposed tools

Extensions can expose tools that are injected into Pi thread sessions.

### Manifest contract

Example shape:

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

### Rules

- each LLM tool entry must map to an exposed API with the same name
- the extension must declare capability `llm.tools`
- tool results are returned as JSON text output
- execution is routed through the extension runtime bridge rather than by exposing arbitrary code directly to the model

### Name restrictions

Pi-facing tool names must match:

- `^[a-zA-Z0-9_-]+$`

If a manifest tool name contains characters such as `.`, `/`, or spaces, Chatons automatically normalizes the Pi-visible tool name and logs a normalization warning.

The original extension API name still remains the internal dispatch target.

### Current implementation note

Tool execution is currently synchronous through the extension runtime bridge.

---

## 14. Channel Extension Profile

Chatons documents a specialized extension profile for external messaging bridges.

Channel extensions are identified with:

- `kind: "channel"`

Current rules around that profile:

- inbound channel messages go to global threads only
- channel extensions must not target project conversations
- enabled channel extensions are shown through a dedicated `Channels` navigation entry instead of through separate sidebar items

Recommended channel APIs include:

- `channel.connect`
- `channel.disconnect`
- `channel.status`
- `channel.receive`
- `channel.send`

Current implementation note:

- `channel` is a documented contract layered on top of the standard extension platform
- it is not a completely separate low-level host subsystem
- the host does expose generic bridge-style methods such as `channels.upsertGlobalThread`, `channels.ingestMessage`, and `conversations.getMessages`
- provider-specific delivery logic still belongs to the extension

For the detailed profile, use `docs/EXTENSIONS_CHANNELS.md`.

---

## 15. Logging

Extension runtime logs are written under:

- `~/.chaton/extensions/logs/`

The filename is derived from the extension id using a filesystem-safe normalization step.

This is the first place to inspect when:

- a tool name was normalized
- a server did not become ready
- a runtime hook failed
- an extension API call behaves differently than expected

---

## 16. Stability and Compatibility

### What to Treat as Stable Today

These behaviors are clearly implemented and safe to rely on:

- Capability-gated host access
- Manifest-declared main views
- Namespaced KV and file storage
- Persistent queue with retry/dead-letter handling
- Runtime server startup with readiness polling
- LLM tool injection through manifest + API pairing
- Event subscriptions and publications

### What to Document Carefully

These are real, but should be described precisely:

- Channel extensions are a documented profile over the existing extension system
- Extension runtime changes still often require restart for full reliability
- LLM tool results are JSON-oriented and bridged, not arbitrary direct host execution
- Host-managed translation of extension labels does not exist

If platform behavior changes in those areas, update this file in the same change.

---

## 17. Common Patterns Reference

See `docs/EXTENSIONS_TUTORIAL.md` for:
- Complete working example with source code
- 6 common patterns with full implementations
- Debugging guide
- Performance optimization tips
- Security best practices
- Testing strategies

---

## 18. API Reference Quick Links

| Need | Documentation |
|------|---------------|
| **Tutorial** | `docs/EXTENSIONS_TUTORIAL.md` |
| **Complete example** | Section 2 of tutorial |
| **Common patterns** | Section 4 of tutorial |
| **Debugging** | Section 5 of tutorial |
| **Publishing** | `docs/EXTENSION_PUBLISHING.md` |
| **UI components** | `docs/EXTENSIONS_UI_LIBRARY.md` |
| **Channels** | `docs/EXTENSIONS_CHANNELS.md` |

---

## 11. Channel extension profile

Chatons documents a specialized extension profile for external messaging bridges.

Channel extensions are identified with:

- `kind: "channel"`

Current rules around that profile:

- inbound channel messages go to global threads only
- channel extensions must not target project conversations
- enabled channel extensions are shown through a dedicated `Channels` navigation entry instead of through separate sidebar items

Recommended channel APIs include:

- `channel.connect`
- `channel.disconnect`
- `channel.status`
- `channel.receive`
- `channel.send`

Current implementation note:

- `channel` is a documented contract layered on top of the standard extension platform
- it is not a completely separate low-level host subsystem
- the host does expose generic bridge-style methods such as `channels.upsertGlobalThread`, `channels.ingestMessage`, and `conversations.getMessages`
- provider-specific delivery logic still belongs to the extension

For the detailed profile, use `docs/EXTENSIONS_CHANNELS.md`.

---

## 12. Logging

Extension runtime logs are written under:

- `~/.chaton/extensions/logs/`

The filename is derived from the extension id using a filesystem-safe normalization step.

This is the first place to inspect when:

- a tool name was normalized
- a server did not become ready
- a runtime hook failed
- an extension API call behaves differently than expected

---

## 13. What to treat as stable today

These behaviors are clearly implemented and safe to rely on:

- capability-gated host access
- manifest-declared main views
- namespaced KV and file storage
- persistent queue with retry/dead-letter handling
- runtime server startup with readiness polling
- LLM tool injection through manifest + API pairing

---

## 14. What to document carefully

These are real, but should be described precisely:

- channel extensions are a documented profile over the existing extension system
- extension runtime changes still often require restart for full reliability
- LLM tool results are JSON-oriented and bridged, not arbitrary direct host execution
- host-managed translation of extension labels does not exist

If platform behavior changes in those areas, update this file in the same change.
