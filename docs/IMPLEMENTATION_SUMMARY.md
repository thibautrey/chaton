# Documentation and Implementation Summary

This file is now kept as a plain summary of what is currently true about the Chatons desktop application and its major subsystems.

It replaces an older summary that described implementation plans and file layouts that no longer match the current repository.

---

## 1. Current product summary

Chatons is an Electron desktop application with:

- a React renderer
- a Pi-based AI runtime
- SQLite persistence
- project and conversation management
- extension support
- built-in automation and memory extensions

It is designed as an AI workspace rather than as a single chat window.

Core user-facing areas currently implemented include:

- onboarding
- provider and model setup
- threaded conversations
- project-linked conversations
- per-thread access mode
- project terminal runs
- optional worktree mode
- skills management through Pi
- extension and channel management
- memory and automation features

---

## 2. Current architecture summary

Important implementation entry points:

- `electron/main.ts`
- `electron/ipc/workspace.ts`
- `electron/pi-sdk-runtime.ts`
- `electron/extensions/runtime.ts`
- `src/features/workspace/store/provider.tsx`
- `src/App.tsx`

High-level layers:

1. Electron main process for host integrations and IPC
2. React renderer for UI
3. Pi runtime bridge for per-conversation sessions
4. SQLite database for persistence
5. Extension runtime for built-in and user-installed extensions

---

## 3. Pi integration summary

Chatons uses an internal Pi-managed runtime.

Important facts:

- the active Pi directory is under `<userData>/.pi/agent`
- CLI-style commands prefer the bundled Pi CLI and otherwise use Chatons-managed fallback paths
- the app forces `PI_CODING_AGENT_DIR` to its managed Pi directory for runtime command execution
- model scope is driven by `settings.json > enabledModels`

This means the app is not treating a user-global shell Pi install as the primary source of truth for normal app behavior.

---

## 4. Conversation runtime summary

Chatons creates a Pi runtime per conversation.

Current behavior includes:

- conversation-specific runtime state
- project-aware working directory selection
- `secure` and `open` access modes
- runtime event forwarding into the renderer
- suggested thread actions emitted by the model and rendered as badges in the composer

The tool cwd differs by access mode:

- `secure`: conversation working directory
- `open`: filesystem root

---

## 5. Extension platform summary

Chatons ships with a real extension platform.

Current capabilities include:

- manifest loading
- registry management
- built-in and user-installed extensions
- extension main views
- quick actions
- queue and storage APIs
- extension servers
- LLM-callable extension tools

Built-in extensions currently include:

- `@chaton/automation`
- `@chaton/memory`

User extension location:

- `~/.chaton/extensions/<extension-id>`

Legacy fallback still recognized:

- `~/.chaton/extensions/extensions/<extension-id>`

---

## 6. Channel summary

Chatons groups channel-style integrations into a dedicated Channels page.

Current facts:

- channel extensions are identified by `kind: "channel"`
- the sidebar shows a single `Channels` entry when at least one enabled channel extension exists
- inbound channel traffic is intended for global threads only

---

## 7. Memory summary

The built-in memory system stores data in SQLite and exposes both UI and model-callable APIs.

Current behavior includes:

- `global` and `project` scopes
- CRUD operations
- lightweight local semantic search
- no dependency on an external embedding service

The current search implementation uses a local hashed trigram vector strategy.

---

## 8. Project terminal summary

The project terminal feature is implemented as a managed command runner.

Current behavior:

- heuristic command detection based on project files
- custom command execution
- live streamed output in a popup
- multiple runs with tabs

Important limitation:

- it is not a full PTY-style interactive terminal

---

## 9. Worktree summary

Worktree support exists but remains a feature that should be documented carefully.

Current facts:

- disabled by default
- enabled explicitly per project conversation
- supports commit, merge, and related actions
- some metadata and push paths remain partial or environment-limited

---

## 10. Documentation rule

For this repository, documentation is part of the product.

Any change that affects:

- user workflows
- extension contracts
- configuration semantics
- architecture
- technical limitations visible to users or developers

should update the corresponding documentation in the same change.
