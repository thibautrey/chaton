# Chatons

An Electron desktop AI workspace for technical conversations, code assistance, and project-oriented workflows.

---

## What Chatons Is

Chatons combines:

- **Threaded conversations** — Organize discussions by topic or project
- **Multi-provider AI access** — Connect OpenAI, Anthropic, Ollama, or custom providers
- **Model selection and scoping** — Choose which models appear in your picker
- **File and command tools** — Read, edit, and execute code with AI assistance
- **Project linking** — Attach conversations to Git repositories
- **Extensions** — Add custom features, automations, and integrations
- **Local memory** — Store facts, preferences, and project context

Chatons is built for developers, researchers, and technical workflows, though it works as a general-purpose assistant.

---

## Key Features

### Conversations and Organization

- Create global threads or project-specific conversations
- Project threads have access to repository context and can create worktrees
- Thread search and sidebar navigation
- Optional worktrees for isolated branch work per conversation

### Model and Provider Management

- Support for OpenAI, Anthropic, Ollama, LMStudio, and custom compatible APIs
- OAuth authentication for supported providers (OpenAI, Anthropic, GitHub Copilot)
- API key authentication for other providers
- Model scoping: pin frequently-used models to your picker
- Per-conversation model selection

### Code and Command Execution

- Read files and inspect repository structure
- Edit files with precise changes
- Execute bash commands in project context
- Secure mode (conversation-scoped) and open mode (filesystem-scoped)
- Project terminal for running common commands

### Project Features

- Import Git repositories as projects
- Auto-initialize new Git repositories
- Project terminal with command detection (Node, Python, Rust, Go, etc.)
- Optional worktree mode for conversation-scoped branches
- Git-aware context and status

### Automations and Memory

- Define automation rules triggered by app events
- Local memory with global and project scopes
- Lightweight semantic search for stored facts
- Built-in automation and memory extensions

### Extensions

- Install user extensions or use built-in ones
- Create custom sidebar entries and main views
- Extend LLM tool availability
- Queue-based integrations
- Health checks and extension logs

### Skills

- Access Pi skills marketplace
- Install and manage reusable skill packages
- Distinct from extensions (skills are model-focused, extensions are host-integrated)

### Channels

- Integrate messaging platforms (e.g., Telegram, Slack)
- Route inbound messages to global threads
- Extension-based integration model

---

## Getting Started

### Download

Get the latest installer from [Releases](https://github.com/thibautrey/chaton/releases):

- **macOS**: `.dmg` installer (Intel and Apple Silicon)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` or platform-specific package

### First Launch

1. Download and install Chatons
2. Open the app — onboarding will start automatically
3. Choose an AI provider (OpenAI, Anthropic, Ollama, custom, etc.)
4. Add your API key or authenticate via OAuth
5. Select which models you want available in your picker
6. Run a validation test
7. Start a conversation

### Basic Workflow

1. Create a new thread from the sidebar
2. Select a model from the composer
3. Type a message and press send
4. For code tasks, use the file/command tools
5. For projects, import a Git repo and create project threads
6. Organize related conversations by project

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Supported | 11+ (Intel and Apple Silicon) |
| **Windows** | ✅ Supported | 10+ (x64) |
| **Linux** | ✅ Supported | Various distributions, `.AppImage` format |

---

## Requirements

- **OS:** macOS 11+, Windows 10+, or recent Linux distribution
- **Disk space:** ~500 MB (includes bundled AI runtime)
- **Internet:** Required for API-based providers; optional for local providers (Ollama, LMStudio)
- **API keys:** Depends on your chosen providers (free tier available for some)

---

## Quick Start Workflows

### Code Review Setup

1. Import your repository as a project
2. Create a new conversation in that project
3. Use secure mode (enabled by default)
4. Ask the assistant to review specific files or functions
5. Reference code directly with file paths — the assistant has repository context

### Debugging a Problem

1. Create a conversation in your project
2. Describe the issue you're facing
3. Ask the assistant to examine specific files
4. Use the file reading tools to inspect logs, configs, or error traces
5. The assistant can suggest fixes and you can review them before applying

### Writing Documentation

1. Create a global thread or project thread
2. Ask the assistant to generate docs from code comments, docstrings, or README requirements
3. Review the drafts in the conversation
4. Use suggested edits and refinements
5. Copy finalized sections to your actual documentation files

### Learning a New Framework

1. Create a global thread
2. If the model supports thinking levels, enable high thinking
3. Ask step-by-step questions about concepts
4. Request code examples and explanations
5. Keep the conversation around until you've mastered the topic

---

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| New thread | `Cmd + N` | `Ctrl + N` |
| Open onboarding | `Cmd + Shift + O` | `Ctrl + Shift + O` |
| Next/previous thread | `Cmd + ]` / `Cmd + [` | `Ctrl + ]` / `Ctrl + [` |
| Toggle sidebar | `Cmd + B` | `Ctrl + B` |
| Search threads | `Cmd + F` | `Ctrl + F` |
| Send message | `Enter` (or Shift+Enter for new line) | `Enter` (or Shift+Enter for new line) |
| Quit app | `Cmd + Q` | `Alt + F4` or `Ctrl + Q` |

---

## Troubleshooting Setup

### Provider Won't Authenticate

**Symptom:** "Invalid API key" error during provider setup

**Try:**
1. Copy your API key again from the provider's website
2. Paste it carefully (watch for hidden spaces)
3. For OAuth providers (OpenAI, Anthropic), click the OAuth button instead of pasting a key
4. Check that the API key has not expired or been revoked

**Still failing?**
- Check your network connection (some providers block certain regions)
- Try adding the provider from `Settings > Providers & Models` instead of onboarding
- If OAuth callback fails, see if your firewall is blocking localhost:1455

### Model List Won't Load

**Symptom:** Stuck on "Loading models..." or blank model list

**Try:**
1. Check your internet connection
2. Verify the provider is accessible (try visiting their website)
3. Go to `Settings > Diagnostics` and check the Pi path is correct
4. From `Settings > Sessions`, open the sessions folder and inspect recent logs
5. Restart Chatons

**If persists:**
- The provider API may be temporarily down
- Your API key may lack the correct permissions
- Try a different provider to verify the app itself works

### OAuth Callback Won't Complete

**Symptom:** Browser opens but callback doesn't return to Chatons

**Try:**
1. Check if your firewall is blocking `localhost:1455` (the callback port)
2. If on a corporate network, you may need to allowlist this port
3. Close all other instances of Chatons and try again
4. Try using a different browser
5. If the popup hangs, manually copy the code if prompted and paste it into Chatons

### No Models Appear After Adding Provider

**Symptom:** Provider added but model picker is empty

**Try:**
1. Go to `Settings > Providers & Models`
2. Check the provider is listed
3. Click it to expand and see available models
4. Star at least one model to add it to your scope
5. Return to the conversation and refresh the model picker

---

## Performance & System Requirements

### Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **RAM** | 4 GB | 8 GB |
| **Disk** | 2 GB (app + runtime) | 10 GB (room for models/cache) |
| **CPU** | 2 cores | 4+ cores |
| **Network** | Varies by provider | 10 Mbps+ for smooth streaming |
| **OS** | macOS 11+, Windows 10+, Linux | Latest stable version |

### Storage Estimates

- **Chatons app:** ~500 MB
- **Per conversation:** ~100 KB - 5 MB (depending on message volume and attachments)
- **Models (if local):** 5-30 GB per model (Ollama, LMStudio)
- **Cache:** ~1-2 GB for typical usage

### Performance Tips

- **Faster responses:** Use a model on a local provider (Ollama, LMStudio) for near-instant latency
- **Reduce latency:** Ensure low network ping to your provider's servers
- **Project context:** Larger repositories may take longer to index; use secure mode to limit tool scope
- **Worktrees:** Creating worktrees has minor overhead; only enable when needed

### Known Limitations

- Opening very large files (>10 MB) may slow down the UI
- Project terminal is command-based, not a full PTY (some interactive tools won't work)
- Session startup takes 1-3 seconds depending on model and provider
- Switching between many models rapidly may cause brief UI delays

---

## Data Location & Backups

### Where Your Data Lives

All Chatons data is stored locally in your user directory:

```
~/.chaton/
├── conversations/        # SQLite database with all conversations
├── extensions/           # User-installed extensions
├── .pi/agent/            # Pi configuration and credentials
│   ├── settings.json     # Model scope and preferences
│   ├── models.json       # Provider and model definitions
│   ├── auth.json         # API keys and OAuth tokens
│   └── sessions/         # Pi session state
└── workspace/
    └── global/           # Global workspace directory
```

### Backing Up Your Data

**Automatic:** None. Chatons does not auto-backup to cloud.

**Manual backup:**
1. Close Chatons
2. Copy `~/.chaton/` to a backup location
3. Restore by replacing the directory

**Backing up only conversations:**
```bash
cp ~/.chaton/conversations ~/.backup-conversations
```

**Backing up credentials:**
```bash
cp ~/.chaton/.pi/agent/auth.json ~/.backup-auth.json
```

### Migrating to a New Computer

1. On the old computer: `cp ~/.chaton/ /path/to/external/drive/chaton-backup/`
2. Install Chatons on the new computer
3. Close Chatons
4. Replace the new `~/.chaton/` with your backup: `rm -rf ~/.chaton && cp /path/to/backup/chaton-backup ~/.chaton`
5. Restart Chatons

**Important:** Do not copy over `~/.chaton/.pi/agent/sessions/` if the app version differs significantly.

---

## FAQ

### General Questions

**Q: Can I use multiple providers at the same time?**
A: Yes. Add multiple providers in `Settings > Providers & Models`. You can switch between them in the composer per conversation.

**Q: Is Chatons available on mobile?**
A: No, only desktop (macOS, Windows, Linux). There are no plans for mobile at this time.

**Q: Can I use Chatons without an internet connection?**
A: Yes, if you use a local provider (Ollama or LMStudio). API-based providers (OpenAI, Anthropic) require internet.

**Q: How do I export my conversations?**
A: Currently, export is not built in. Conversations are stored in SQLite at `~/.chaton/conversations/`. You can query or copy this database. A proper export feature is planned.

**Q: Can I sync conversations across multiple computers?**
A: Not automatically. You must manually backup and restore `~/.chaton/` between machines. Cloud sync is a potential future feature.

### Data & Privacy

**Q: Where is my data stored?**
A: All data lives locally on your machine in `~/.chaton/`. Nothing is sent to Chatons infrastructure.

**Q: What happens to my API keys?**
A: API keys are stored locally in `~/.chaton/.pi/agent/auth.json`. Only your chosen AI provider sees the key during API calls.

**Q: Can I opt out of telemetry?**
A: Yes. `Settings > Sidebar > Allow anonymous crash and error logs` — toggle off. Default is off.

**Q: How is OAuth handled?**
A: OAuth tokens are stored locally in `auth.json`. The OAuth flow is handled by your provider (e.g., you authenticate directly with OpenAI, not Chatons).

### Features

**Q: Can I use Chatons with a local LLM (Ollama, LMStudio)?**
A: Yes. Add Ollama or LMStudio as a custom provider with the appropriate base URL and no API key required.

**Q: What's the difference between secure and open mode?**
A: **Secure mode** — Tools can only access the conversation's project or workspace directory. **Open mode** — Tools can access any file on your computer. Use secure mode by default, open mode only when you need broad file access.

**Q: Can I create automations that run on a schedule?**
A: Yes, via the `Automations` section. Define a rule with a trigger (e.g., `conversation.created`) and optional cooldown.

**Q: What's the difference between Skills and Extensions?**
A: **Skills** are reusable Pi packages (model-focused, managed through the Skills panel). **Extensions** are Chatons-specific features that add UI, integrations, or APIs (managed in the Extensions panel).

**Q: How do I create an extension?**
A: See `docs/EXTENSIONS.md` and `docs/EXTENSIONS_UI_LIBRARY.md`. Start with a minimal manifest in `~/.chaton/extensions/<your-id>/chaton.extension.json` and an HTML/JS UI.

**Q: Can I use thinking levels (o1, o3)?**
A: Yes, if your provider supports them (e.g., OpenAI's o1, o3 models). A thinking-level slider appears in the composer when available.

### Troubleshooting Advanced

**Q: How do I debug why a conversation is slow?**
A: Check `Settings > Commands` for recent Pi command output. Open `Settings > Sessions` to access detailed logs.

**Q: Can I run interactive commands (e.g., `npm install` with prompts)?**
A: Not fully. The project terminal is command-based, not a full PTY. Use simple, non-interactive commands. For complex workflows, use your system terminal.

**Q: How do I recover if my `settings.json` is corrupted?**
A: Delete `~/.chaton/.pi/agent/settings.json` and restart Chatons. It will be regenerated with defaults.

**Q: Can I use Chatons in offline mode?**
A: Yes, only if using a local provider (Ollama or LMStudio). API-based providers require internet.

**Q: How do I report a bug?**
A: Open an issue on [GitHub](https://github.com/thibautrey/chaton/issues) with your reproduction steps and Chatons version.

---

## Supported Providers

| Provider | Auth Method | Local? | Notes |
|----------|------------|--------|-------|
| **OpenAI** | OAuth or API key | No | ChatGPT models, Codex |
| **Anthropic** | OAuth or API key | No | Claude models |
| **Ollama** | None (local) | Yes | Run local models on your machine |
| **LMStudio** | None (local) | Yes | Desktop app for local inference |
| **Custom (OpenAI-compatible)** | API key | Optional | Any OpenAI-compatible API |

---

## Conversation Features

### Access Modes

- **Secure mode** — Tools operate within conversation context and project directories
- **Open mode** — Tools can access the entire filesystem

Switch between modes per conversation via the composer toggle.

### Composer

- Type messages with full markdown support
- Attach files (images are inlined, text is included, other files are previewed)
- Select model and access mode
- Queue messages while the assistant is busy
- Suggested actions from the AI (up to 4 badges)

### Conversation Timeline

- Message history with clear speaker attribution
- Inline file-change summaries (when conversation makes edits)
- Expandable diffs for modified files
- Copy and regenerate options on assistant messages

### Thinking Level

If your selected model supports it (e.g., o1, o3), a thinking-level control appears in the composer.

---

## Project Features

### Creating Projects

- Import existing Git repositories
- Auto-initialize new folders as Git repositories
- Project threads are scoped to that repository

### Project Terminal

- Detects project type from `package.json`, `Cargo.toml`, `pyproject.toml`, etc.
- Proposes common commands for the detected type
- Supports custom commands
- Live output display with tabs
- Note: This is not a full interactive PTY; it's a command runner

### Worktrees

- Optionally enable per-conversation worktrees from the branch icon
- Chatons can suggest commit messages
- Commit, merge, and push operations available
- Note: Some Git metadata is approximate; push is limited in self-contained mode

---

## Settings

### General

- **Theme:** System, Light, Dark

### Behaviors

- **Default behavior prompt:** Automatically prepended to all your messages

### Sidebar

- **Assistant stats:** Show model and token usage
- **Telemetry:** Allow anonymous error reports (opt-in)

### Language

- English and French

### Providers & Models

- Add/edit/remove providers
- Manage model scope per provider
- View OAuth connection status

### Sessions

- Open the Pi sessions folder (for debugging)

### Commands

- View Pi command history and output

### Diagnostics

- Pi binary path
- Settings file path
- Models file path
- Runtime validation checks

---

## Architecture and Tech Stack

**Desktop shell:** Electron  
**UI framework:** React + TypeScript  
**Database:** SQLite (via `better-sqlite3`)  
**AI runtime:** [Pi Coding Agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)  
**Git support:** Git CLI + native tooling  
**Localization:** i18next

For detailed architecture, see `docs/CHATONS_DEVELOPER_GUIDE.md`.

---

## Limitations and Known Issues

### Stable Features

These are production-ready and actively used:

- Conversations and message history
- Provider setup and model management
- File reading and editing
- Bash command execution
- Skills management
- Local memory
- Extensions and channels

### In-Progress Features

These work but have visible limitations:

- **Worktrees:** Some Git metadata is approximate; push functionality is limited in self-contained mode
- **Project terminal:** Not a full interactive PTY; command-based output only
- **Extension hot reload:** After installing extensions, restart Chatons for safety
- **OAuth token refresh:** Expired tokens require manual re-authentication

---

## Documentation

- **User Guide:** `docs/CHATONS_USER_GUIDE.md` — Feature walkthrough and everyday workflows
- **Developer Guide:** `docs/CHATONS_DEVELOPER_GUIDE.md` — Architecture, setup, and contribution guide
- **Pi Integration:** `AGENTS.md` — Pi runtime and session management (maintainers)
- **Extensions:** `docs/EXTENSIONS.md` — Building custom extensions
- **Automation:** `docs/AUTOMATION_EXTENSION.md` — Creating automations
- **Memory:** Built-in; see User Guide section 16

---

## Contributing

Contributions are welcome. Please see `docs/CHATONS_DEVELOPER_GUIDE.md` for setup instructions.

When making changes that affect:

- User workflows or UI behavior
- Extension contracts
- Configuration files
- Architecture

Update the corresponding documentation in the same change.

---

## Privacy

- **Local configuration:** All settings, credentials, and session state stored locally in `~/.chaton/`
- **Credentials:** API keys and OAuth tokens are stored in your app's managed Pi directory, not shared with Chatons infrastructure
- **No telemetry by default:** Error reporting is opt-in via Settings
- **Data sent to providers:** Only what you explicitly send to your chosen AI providers

---

## License

MIT © Thibaut Rey

---

## Support

- **Issues and feedback:** [GitHub Issues](https://github.com/thibautrey/chaton/issues)
- **Documentation:** See `docs/` directory in this repository
- **Pi documentation:** https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
