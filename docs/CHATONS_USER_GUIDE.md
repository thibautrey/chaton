# Chatons User Guide

This guide explains how Chatons works today for people who use the app day to day.

It is based on the current implementation in this repository. When a feature is partial, limited, or environment-dependent, that is called out clearly.

---

## 1. What Chatons is

Chatons is a desktop AI workspace.

At its core, it combines:

- threaded conversations
- optional project-linked conversations
- model and provider selection
- file and command oriented AI assistance through Pi
- extension points for features such as automations, memory, channels, and custom integrations

You can use it as a general-purpose assistant, but the app is also built for more technical workflows such as reading files, editing code, running commands, and managing project context.

---

## 2. What you see when the app starts

### Loading screen

Before the workspace finishes loading, Chatons shows a full-window loading screen instead of a blank window.

What is on that screen:

- the Chatons mascot video
- rotating loading messages
- the same animated text style used by onboarding

### First launch: onboarding

If onboarding has not been completed yet, Chatons opens onboarding instead of the normal app.

You can also force it open later with:

- `Cmd + Shift + O` on macOS
- `Ctrl + Shift + O` on Windows and Linux

Onboarding has two parts:

1. a short intro carousel
2. a 3-step setup flow

The intro has:

- slide navigation dots
- `Skip intro`
- `Next` / `Start setup`
- the mascot video displayed throughout

The setup flow then guides you through:

1. choosing a provider
2. selecting which models should be in scope
3. running a basic validation check

---

## 3. Setting up providers and models

### Step 1: add a provider

In onboarding, and later in Settings, you can configure an AI provider.

The provider form supports preset providers and a custom provider mode.

Current provider details that matter in practice:

- provider name and base URL are required to continue
- API key is optional for `ollama`, `lmstudio`, and `custom`
- API key is stored in Chatons' Pi configuration
- when you choose a preset card during onboarding, the UI scrolls to the form automatically
- when you choose `Custom`, typing the provider name does not kick you out of custom mode

### Base URL handling

When provider settings are saved, Chatons tries to normalize common OpenAI-compatible base URL variants.

In practice, if you enter a URL such as:

- `http://host:port`
- `http://host:port/`
- `http://host:port/v1`
- `http://host:port/v1/`

Chatons probes likely variants and stores the first one that responds successfully.

### Step 2: choose model scope

After a provider is saved, Chatons loads models and asks which ones should be part of your normal model picker.

This matters because Chatons distinguishes between:

- all detected models
- scoped models

Scoped models are the ones shown by default in the main picker.

### Step 3: validation

The onboarding test does a simple configuration check. It verifies that:

- Pi configuration is present
- models can be loaded
- at least one model exists
- at least one model is scoped

Only after that can you finish onboarding and enter the main app.

---

## 4. Main layout

The app is organized into three main areas.

### Left sidebar

The sidebar is where you navigate.

Depending on what is installed and enabled, you can see entries such as:

- `New thread`
- `Automations`
- `Skills`
- `Extensions`
- `Channels`
- `Settings`

The sidebar also handles:

- project and thread organization
- thread search visibility
- update and changelog surfaces outside development mode

The sidebar width is resizable.

### Main panel

The main panel changes based on what you selected.

It can show:

- a conversation timeline
- settings
- the skills library
- the extensions library
- the channels page
- an extension main view

Important behavior:

- extension main views use the full available main-panel space
- they are not constrained to the narrower conversation column

### Composer

At the bottom of a conversation, the composer lets you:

- type a message
- attach files
- choose a model
- choose a thinking level when supported
- switch access mode between `secure` and `open`

The composer is only shown when a conversation is selected.

---

## 5. Everyday conversation workflows

### Create a global thread

Use `New thread` in the sidebar or the top-bar `+` action.

A global thread is not attached to a project.

### Import a project

Use the project import action in the sidebar.

If the selected folder is not already a Git repository, Chatons initializes one automatically.

### Create a project thread

Once a project exists, you can create a conversation inside that project.

Project threads are useful when you want the assistant to work from a specific repository context.

### Delete threads and projects

Deletion uses a two-step confirmation pattern to reduce accidental removal.

---

## 6. The conversation experience

### Model picker

The model picker in the composer works like this:

- scoped models are shown first
- a `more` action reveals all models
- the star button adds or removes a model from scope

This same scoped-model behavior is reused in onboarding and in provider/model settings, so you are working with the same concept throughout the app.

### Thinking level

If the selected model supports it, a thinking-level control appears.

If the model does not support thinking levels, that control is hidden.

### Access mode: secure vs open

Each conversation has its own access mode.

The two modes are:

- `secure`
- `open`

What changes:

- in `secure` mode, the assistant is constrained to the conversation context
- in `open` mode, the assistant can work with broader filesystem access

If you change access mode on an existing thread, Chatons restarts that conversation runtime.

The UI also shows a short explanatory popup near the toggle so the difference is easier to understand.

### When the assistant is busy

If the assistant is already starting up or processing, pressing send does not discard your message.

Instead, Chatons queues it.

In that state:

- the send button changes to a queue-style icon
- queued items appear above the composer
- you can edit or remove queued items before they are sent

### Stop execution

While the assistant is running, a stop button is shown.

Chatons asks for confirmation before stopping, because in-progress work may be lost.

---

## 7. Attachments

You can attach files by:

- clicking the `+` button
- dragging files onto the composer

Current attachment behavior:

- images are sent as image payloads
- smaller text-like files are included as readable text
- other files are converted into a preview form instead of being treated as directly readable source text

You can remove attachments before sending.

---

## 8. Quick actions and suggested actions

### Empty-thread quick actions

When a thread is truly empty, Chatons shows quick action cards above the composer area.

Examples include built-in shortcuts such as:

- create an extension
- create a skill
- add a project

Extensions can also contribute their own quick actions.

These cards are hidden once the thread has real activity.

### Suggested action badges from the assistant

The assistant can also suggest a small set of follow-up actions above the composer.

Current behavior:

- up to 4 badges
- clicking one fills the composer with the suggested message
- badges disappear after use or after sending a message

These are meant to help with quick confirmations and common next steps.

---

## 9. Tracking file changes during a thread

When a conversation is associated with code or file changes, Chatons can show a modifications panel above the composer.

It includes:

- number of changed files
- added and removed line totals
- per-file entries
- inline diffs
- navigation between changes inside a diff

Important detail: these changes are thread-scoped.

That means Chatons is trying to show what changed during the current conversation, not the entire repository history.

Chatons also inserts compact file-change summaries directly into the conversation timeline after relevant tool activity.

Each summary row can be expanded to reveal an inline diff.

Current limitation worth knowing:

- these timeline summaries are intentionally conservative
- they are mainly emitted when Chatons associates a change with a recent `edit` tool action in the same conversation
- this reduces noise from unrelated repository activity

---

## 10. Project terminal

Project conversations have a terminal button in the top bar.

This opens a project terminal popup.

What it does today:

- detects likely project type from repository files
- proposes common commands for that project type
- lets you run one of those commands or type a custom command
- displays live output inside the popup
- supports multiple runs with tabs
- lets you stop a run or close a tab

Examples of files used for detection include:

- `package.json`
- `pyproject.toml`
- `Cargo.toml`
- `go.mod`
- `Makefile`
- `CMakeLists.txt`

Important limitation:

- this is not a fully interactive terminal
- it is a live output runner
- there is no full PTY-style shell interaction yet

Another important detail:

- project terminal commands run from the host machine environment
- they are not routed through Chatons' internal Pi command runtime

---

## 11. Worktrees

For project threads, worktree support exists but is off by default.

You enable it from the branch icon in the top bar for the current thread.

When enabled:

- the icon changes state
- Chatons creates a worktree for that conversation
- worktree management actions become available

From the worktree dialog you can currently:

- inspect worktree-related status
- ask Chatons to suggest a commit message
- commit
- merge into the base branch
- attempt push
- open the worktree in VS Code if VS Code is detected

Important limitations:

- worktrees are created only when you explicitly enable them
- some Git metadata in the UI is approximate rather than full Git parity
- push is currently not fully available in self-contained mode
- some worktree operations are still partially implemented

So the feature is usable, but you should not assume every Git status field is final-grade yet.

---

## 12. Automations

The `Automations` area opens a dedicated screen.

From there you can:

- view automation rules
- create a rule in a modal
- define trigger, cooldown, and request text
- inspect recent runs
- delete a rule

Chatons also includes automation tooling that can be used from a conversation when the relevant tools are available.

Built-in automation triggers currently include:

- `conversation.created`
- `conversation.message.received`
- `project.created`
- `conversation.agent.ended`

---

## 13. Skills

The `Skills` panel is separate from the extension system.

It lets you:

- list installed skills
- search the available skills
- install a skill
- uninstall a skill
- browse catalog entries and highlighted entries

Under the hood, this panel works through Pi commands, but as a user you can think of it as the place where you manage reusable Pi skill packages.

---

## 14. Extensions

The `Extensions` panel is where you manage Chatons extensions.

You can:

- list installed extensions
- browse the extension catalog
- install extensions
- enable or disable them
- remove user-installed extensions
- inspect logs
- run a health check
- open the user extensions folder
- restart the app when required

### Where extensions live

User-installed extensions are stored under:

- `~/.chaton/extensions/<package-name>`

Chatons also still recognizes an older fallback layout:

- `~/.chaton/extensions/extensions/<package-name>`

If a valid extension is already present on disk in one of those locations, Chatons can discover it automatically at startup.

### Built-in extensions

Some extensions are bundled with the app.

Current built-in extensions include:

- `@chaton/automation`
- `@chaton/memory`

These do not live in the user extensions folder.

### Install progress

When an extension install is running, the UI shows progress and allows cancellation.

Important limitation:

- after installing or changing extension files, restarting Chatons is still the safest way to guarantee the runtime reloads the manifest set

---

## 15. Channels

If at least one enabled extension is marked as a channel integration, Chatons shows a dedicated `Channels` entry in the sidebar.

Channel integrations are for external messaging platforms such as Telegram.

From the Channels screen, you can:

- see installed and enabled channel integrations
- open each integration's configuration view

Current product rule:

- inbound channel messages are meant for global threads only
- they are not supposed to be attached to project conversations

The host groups channels into one dedicated page rather than giving each channel extension its own sidebar item.

---

## 16. Memory

Chatons includes a built-in memory extension.

It stores memory locally in Chatons' SQLite database.

There are two scopes:

- `global`: personal preferences, long-lived facts, general user context
- `project`: project-specific decisions, conventions, and context

What this means in practice:

- Chatons can remember preferences across conversations
- it can also keep project-specific memory separate from your global profile

Search is local and embedded in the app.

Important limitation:

- the semantic search is intentionally lightweight
- it works offline and does not depend on an external embedding service
- it is practical, but it is not the same thing as a large neural embedding system

---

## 17. Settings

Chatons has several settings sections.

### General

Currently this section exposes theme selection in Pi settings:

- `system`
- `light`
- `dark`

### Behaviors

This section lets you edit the default behavior prompt.

That prompt is automatically prepended at the start of each user message.

### Sidebar

This section currently includes:

- show assistant stats
- allow anonymous crash and error logs

Changing the telemetry toggle here also marks the consent question as answered.

### Language

You can switch the app language between French and English.

### Providers & Models

This is where you:

- add or remove providers
- edit provider settings
- manage model scope per provider

### Sessions

This section lets you open the Pi sessions folder.

### Commands

This section shows Pi command output history in a dedicated output panel.

### Diagnostics

This section displays:

- Pi path
- settings path
- models path
- runtime checks

---

## 18. Notifications

If the app window is not focused, Chatons can display a desktop notification when a conversation action completes.

If the window is focused, Chatons does not show that desktop notification.

---

## 19. Updates and changelog

Outside development mode, Chatons can:

- check GitHub releases for updates
- show update availability in the UI
- download update assets with progress
- display a changelog card for an unseen version

Current platform behavior:

- on macOS, applying an update opens the downloaded DMG in Finder so you can install it manually
- Windows and Linux update application paths are still more limited

Update checks are cached per app load so the app does not keep hitting GitHub on every repeated check.

---

## 20. macOS close vs quit

On macOS, closing the main window does not quit Chatons.

Current behavior:

- closing the window hides it
- `Cmd + Q`, the app menu quit action, or the tray/menu bar quit action exits the app

This is intentional.

---

## 21. What is important to keep in mind today

A few features are useful but still clearly in progress.

### Stable enough for normal use

These are central and actively used:

- conversations
n- provider and model setup
- scoped model selection
- skills and extension management
- channels page and extension main views
- project terminal output runner
- local memory

### Features with visible implementation limits

Treat these with more caution:

- advanced worktree flows
- push from worktree mode
- some Git-derived worktree metadata
- fully interactive terminal behavior
- same-process hot reload for extension runtime changes

If you need exact technical behavior for any of those areas, the developer guide is the right reference.
