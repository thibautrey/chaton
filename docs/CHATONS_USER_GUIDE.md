# Chatons User Guide

## Audience and Scope
This guide is for everyday Chatons users.

It explains what you can do in the app today, in practical terms, without internal implementation details.

Scope baseline: current behavior observed in the codebase on **March 5, 2026**.

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
- API key (optional for local providers when detected locally)

Provider preset cards use a transparent surface (no dark card fill) to keep labels and logos easier to read on onboarding backgrounds.
The Mistral card displays a gold star badge to indicate it as a preferred preset.
Clicking a provider card automatically scrolls to the provider form/API key area so you can continue setup immediately.

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

- thread search
- thread/project organization options
- update and changelog cards (outside dev mode)

### Main panel
Shows either:

- conversation timeline
- settings panel
- skills panel
- extensions panel
- an extension main view (for example Automation)

### Composer (bottom)
Used to send prompts, attach files/images, pick model, pick thinking level, and choose agent access mode.

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

### Thinking level
If the selected model supports reasoning levels, a thinking-level chip appears.

### Agent access mode
You can switch per conversation:

- `secure`: constrained behavior
- `open`: broader file/command access behavior

If you change mode on an existing thread, Chatons restarts that conversation runtime.

### Sending while AI is busy
If the agent is already processing, pressing send queues your message instead of dropping it.

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
When a conversation has activity and changes are detected, Chatons shows a modifications panel above the composer with:

- changed files count
- added/removed lines
- inline per-file diffs
- change-to-change navigation

This gives you a continuous view of what changed during the thread.

## 8. Worktree Tools
For project threads with a worktree, `Manage worktree` is available in the topbar.

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

## 10. Skills (User View)
The `Skills` panel supports:

- listing installed skills
- searching/filtering skills
- installing skills from catalog
- uninstalling installed skills

## 11. Extensions (User View)
The `Extensions` panel supports:

- listing installed extensions
- browsing extension catalog
- install / enable / disable / remove actions
- health check action
- viewing extension logs
- opening the extensions folder from the app
- restarting the app when needed

## 12. Settings (User View)
Settings sections currently available:

- `General`: app-level Pi settings fields (theme etc.)
- `Behaviors`: default behavior prompt automatically prepended
- `Sidebar`: sidebar display options
- `Language`: French / English
- `Providers & Models`: provider config and model scoping
- `Sessions`: open sessions folder
- `Pi`: command output panel
- `Diagnostics`: runtime checks and paths

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

For technical details and extension authoring, use the developer guide.
