# Chatons User Guide

## Audience and Scope
This guide is for everyday Chatons users.

It explains what you can do in the app today, in practical terms, without internal implementation details.

Scope baseline: current behavior observed in the codebase on **March 5, 2026**.

## 1.1 Startup Loading Screen
During app boot (before workspace/settings hydration completes), Chatons shows a full-window loading screen instead of a white/blank screen.

It includes:

- centered Chatons mascot video (`chaton-hero.webm`)
- a funny cat-themed loading message
- the same fade-in/fade-out message transition style used by onboarding intro copy

## 1. What Chatons Does
Chatons is a desktop AI workspace that combines:

- threaded conversations
- project-linked conversations
- model selection and provider setup
- automations, skills, and extensions
- code-oriented workflows (diffs, worktrees, commit/merge helpers)

## 2. First Launch (Onboarding)
On first launch, Chatons now starts with a short full-window intro screen, then opens a separate 3-step setup flow.

### Intro step (new)
Before provider setup, Chatons shows a dedicated intro screen (not mixed with setup steps) with:

- smooth transitions between slides
- persistent Chatons mascot video (`chaton-hero.webm`) visible throughout
- progress indicator + dots navigation
- `Skip intro` and `Next` controls

The intro is designed to stay short (well under a minute) and move quickly to setup.

### Force-open onboarding shortcut
You can force-open onboarding at any time with:

- `Cmd + Shift + O` (macOS)
- `Ctrl + Shift + O` (Windows/Linux)

### Step 1: Provider setup
You choose a provider preset (for example OpenAI, Mistral, Ollama, LM Studio, etc.), then set:

- API type
- Base URL
- API key (optional for local providers when detected locally, and optional for `Custom`)

Provider preset cards use a transparent surface (no dark card fill) to keep labels and logos easier to read on onboarding backgrounds.
The Mistral card displays a gold star badge to indicate it as a preferred preset.
Clicking a provider card automatically scrolls to the provider form/API key area so you can continue setup immediately.
When selecting `Custom`, the form stays in custom mode while you type the provider name (typing no longer exits/hides the custom fields).
When saving provider settings, Chatons now auto-corrects common base URL variants in the background for OpenAI-compatible endpoints (for example `http://host:port`, `http://host:port/`, `http://host:port/v1`, `http://host:port/v1/`) and stores the first reachable one.

### Step 2: Model scope
Chatons loads models and asks which ones should be available in your everyday model picker.

### Step 3: Quick validation
Chatons runs a basic setup check before enabling the main app.

## 3. Main Interface Overview
The app has three main areas.

### Left sidebar
Main navigation:

- `New thread`
- `Automations`
- `Skills`
- `Extensions`
- `Settings`

You also get:

- a search toggle button next to the `+` action to show/hide thread search
- thread/project organization options
- update and changelog cards (outside dev mode)

### Main panel
Shows either:

- conversation timeline
- settings panel
- skills panel
- extensions panel
- an extension main view (for example Automation)
- extension main views use the full available content width and height of the main panel rather than the narrower conversation/settings column and viewport-estimated height
- on empty-thread states, quick action cards are aligned to the conversation column width and centered within that column (not the full window), while still staying visually above the composer area
- quick actions and the "Start the conversation" empty-state banner are shown only for truly empty threads; once a first exchange exists, they are hidden

### Composer (bottom)
Used to send prompts, attach files/images, pick model, pick thinking level, and choose agent access mode.
The composer bar and inner composer surface use translucent backgrounds with blur so conversation content remains subtly visible behind them.

## 4. Core Daily Workflows

### Create a global thread
Use `New thread` in the sidebar (or the topbar `+` button).

### Import a project
Use `Add project` in the sidebar.

If the folder is not already a Git repository, Chatons initializes it automatically.

### Create a project thread
Inside a project group, click the compose icon to create a new thread linked to that project.

### Delete threads and projects
Deletion uses a two-click confirmation pattern for safety.

## 5. Conversation Experience

### Model picker
The model chip in the composer lets you:

- use scoped models by default
- click `more` to show all models
- star/unstar models to add/remove them from scoped models

The same scoped-model picker behavior is now reused in onboarding and provider/model settings, so model scope toggling is consistent across setup and daily usage.

### Thinking level
If the selected model supports reasoning levels, a thinking-level chip appears.

### Agent access mode
You can switch per conversation:

- `secure`: constrained behavior
- `open`: broader file/command access behavior
- a friendly comparison popup is shown above the `secure` / `open` buttons in the composer, with short non-technical guidance for when to use each mode

If you change mode on an existing thread, Chatons restarts that conversation runtime.

### Sending while AI is busy
If the agent is already processing or still starting up, pressing send queues your message instead of dropping it.
This also applies while Chatons is still tracking pending runtime commands for that conversation.
In that state, the send button shows a queue icon (instead of text) to keep the composer compact.

### Stop current execution
A stop button appears while the agent is processing.

## 6. Attachments in Composer
You can add files using `+` or drag-and-drop.

Current behavior:

- images: sent as image payloads
- small text-like files: included as readable text
- other/binary files: included as base64 preview text

Attachments can be removed before sending.

## 7. Live Change Tracking (Code Workflows)
When a conversation has activity and thread-scoped changes are detected, Chatons shows a modifications panel above the composer with:

- changed files count
- added/removed lines
- inline per-file diffs
- change-to-change navigation

This gives you a continuous view of what changed during the thread.

Chatons also records compact file-change summaries directly in the conversation timeline after tool executions. Each row shows:

- `Modifié <path> +<added> -<removed>`

Click a timeline row to expand the inline diff for that file directly in the thread.

These timeline rows are thread-scoped deltas (changes relative to thread start baseline), so they track what changed during the current conversation rather than whole-repository totals.
Timeline summaries are incremental: each row shows only files that changed since the previous tool execution snapshot. Pure Git state transitions that do not introduce new content changes (for example stage/commit cleanup effects) are not surfaced as new "Modifié" rows. To reduce false positives from concurrent work in other threads, Chatons only surfaces these timeline file-change rows when the change is associated with a recent `edit` tool execution in the same thread.

## 8. Worktree Tools
For project threads, worktree is **disabled by default**.

Project threads also include a topbar terminal icon.
Clicking it opens a popup that:

- auto-detects the project type (for example Node, Python, Rust, Go, C/Make-style)
- proposes common runnable commands based on detected project files and common conventions
- lets you choose a command from a dropdown and start it
- shows command output directly inside the popup
- supports multiple concurrent terminal runs with tabs
- lets you stop a running command or close a tab (closing a running tab stops that command first)

Current note:
- command detection is heuristic and based on common project files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Makefile`, `CMakeLists.txt`, etc.)
- output is shown as a live log view inside the popup, not a fully interactive shell
- project terminal commands are a special case: they are launched from the host machine environment, not through Chatons internal command runtime
- in packaged builds, Chatons reconstructs a usable host `PATH` for these project commands (notably Node/npm), which avoids common `spawn ... ENOENT` failures caused by reduced app `PATH` values

Use the topbar worktree icon (`branch` icon) to toggle it for the current thread.

When enabled, the icon changes color (green) to indicate active worktree mode.
Click the icon again to disable worktree for that thread.

After activation, `Manage worktree` actions are available.

From this dialog you can:

- inspect worktree status fields
- generate a commit message suggestion
- commit
- merge to main
- push

You can also open the worktree in VS Code if VS Code is detected.

## 9. Automations (User View)
The `Automations` sidebar entry opens a dedicated automation screen.

You can:

- list automation rules
- create a new rule in a modal
- set trigger, action type, cooldown, and request text
- view recent execution history
- delete a rule by double-clicking it
- ask the model in a thread to program an automation task when the Automation extension tools are available in that thread
- use the Automation screen in both light and dark app themes with matching surfaces, cards, and modal styling

## 10. Skills (User View)
The `Skills` panel supports:

- listing installed skills
- searching/filtering skills
- installing skills from catalog
- uninstalling installed skills
- a redesigned premium library UI with hero summary cards, richer catalog cards, and clearer install/discovery sections aligned with the rest of Chatons visual language

## 11. Extensions (User View)
The `Extensions` panel supports:

- listing installed extensions
- browsing extension catalog
- install / enable / disable / remove actions
- npm-backed install for published user extensions into the Chatons user extensions directory (`~/.chaton/extensions/<package-name>`)
- install progress feedback with a spinner banner while installation is running
- cancelling an in-progress install from the UI via a square stop button
- health check action
- viewing extension logs
- opening the user extensions folder from the app
- builtin extensions such as `@chaton/automation` are bundled with the application and do not appear in that user folder
- the old builtin example and Qwen helper extensions are no longer part of the bundled codebase
- restarting the app when needed
- a redesigned premium management UI with summary stats, elevated cards, clearer status pills, and a more polished discovery/install flow consistent with the rest of the app

### Channel extensions
Some extensions can act as external messaging bridges, for example Telegram or WhatsApp-style integrations.

Their role is to import messages received outside Chatons into Chatons conversations.
Current product rule: these imported messages are handled as **global threads** only, not project threads.

If at least one Channel extension is installed and enabled, Chatons shows a dedicated `Channels` entry in the sidebar, below `Extensions`.
This screen lists your installed channel integrations and lets you open each integration's configuration view.

A Telegram Channel extension can be installed as a user extension and configured from this screen.
It currently supports bot configuration, model selection through the Chatons model selector, status inspection, polling diagnostics, and test sends.

Channel extensions do not appear individually as their own sidebar entries.

Depending on the extension, a Channel integration can also mirror Chatons replies back to the external platform.
For example, the Telegram Channel extension can now create or reuse a Chatons global thread, apply the selected model to that thread, import inbound messages, and send Chatons replies back to Telegram.
Connection, authentication, and sync status are extension-specific and usually exposed in the extension's own screen.

## 11.1 Memory extension
Chatons now includes a built-in `Memory` extension.

What it does:

- stores memories internally in Chatons local SQLite database
- supports two memory scopes:
  - `global`: personal facts, preferences, and long-lived user context
  - `project`: project-specific context, decisions, conventions, and useful facts
- exposes internal tools so the model can store, retrieve, update, and delete memories during normal conversations
- includes a lightweight local semantic search engine embedded directly in Chatons, so no external embedding service is required

Practical use cases:

- remember user language/tone preferences globally
- remember personal profile/context that helps personalize replies
- remember project conventions, architecture decisions, or recurring instructions per project

Current note:

- the current local semantic search is intentionally lightweight and fully offline; it is designed to be small and functional rather than state-of-the-art

## 12. Settings (User View)
Settings sections currently available:

- `General`: app-level Pi settings fields (theme etc.)
- `Behaviors`: default behavior prompt automatically prepended
- `Sidebar`: sidebar display options
- `Sidebar`: also includes `Allow anonymous crash/error details` toggle (can be changed anytime)
- `Language`: French / English
- `Providers & Models`: provider config and model scoping
- `Sessions`: open sessions folder
- `Pi`: command output panel
- `Diagnostics`: runtime checks and paths

## 12.1 Crash/Log Consent Card
After onboarding, Chatons can show a small bottom-right consent card asking whether you authorize anonymous crash/error details to improve Chatons.

- `Allow`: enables anonymous telemetry
- `No thanks`: keeps telemetry disabled

## 13. macOS Window Close vs Quit
On macOS, closing the Chatons window does not quit the app. The app keeps running in the background (menu bar/tray behavior).

- Close window (`red dot`): hides the window, app stays running
- `Quitter` (menu bar/tray) or `Cmd + Q`: actually quits the app

This prompt is shown once per user choice, and the setting remains editable later in `Settings > Sidebar`.

## 13. Updates and Changelog
Outside development mode:

- update availability is shown in sidebar
- download progress is displayed
- changelog card appears for unseen version
- if local changelog files are unavailable (or Electron bridge is unavailable), a built-in fallback changelog is shown
- if no downloaded installer exists yet, update apply shows an actionable message instead of crashing

## 14. Notifications
If the app window is not focused, Chatons can show a desktop notification when a conversation action completes.

## 15. Current Product Notes
Important practical notes for users today:

- Some advanced worktree actions are still evolving and may show partial/limited behavior depending on environment.
- Extensions in the catalog can require restart and/or extra setup to become fully usable.
- Model/skills/settings Pi commands use Chatons internal Pi runtime and config directory under Chatons data. They do not require a user-global `~/.pi` Node setup.
- Provider model lists are refreshed from the internal Pi `--list-models` command and synced into Chatons `models.json` when model sync runs.
- On API authorization failures (for example `401`), Chatons logs a safe auth diagnostic trail (provider + masked key fingerprint) in runtime error details to help troubleshooting without exposing raw API keys.
- The log console now includes Pi runtime events (`source = pi`) such as runtime status changes and runtime errors, in addition to Electron/frontend logs.
- When a message send fails (for example model request returning `401`), Chatons now shows an in-app notice in the composer area so the failure is visible immediately; auth failures explicitly ask you to verify provider API keys.

For technical details and extension authoring, use the developer guide.
