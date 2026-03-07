# Documentation Audit

This file records documentation drift that mattered enough to require explicit cleanup, clarification, or rewrites.

---

## March 7, 2026 (Session 4)

### Comprehensive extension documentation expansion

Critical focus on extension development with new detailed tutorial and expanded API reference:

- `docs/EXTENSIONS_TUTORIAL.md` — New file (complete working example + 6 patterns)
- `docs/EXTENSIONS.md` — Updated to cross-link tutorial
- `docs/EXTENSIONS_API.md` — Massively expanded with copy-paste examples
- All changes recorded below

**EXTENSIONS_TUTORIAL.md (new file, 21 KB, ~850 lines):**

- **Before You Start** section with prerequisites and key concepts
- **Complete Working Example** (5 files worth of code)
  - Directory structure
  - Full manifest.json
  - Complete HTML with styling
  - Full JavaScript implementation
  - Step-by-step instructions
  - Test the result immediately
- **Step-by-Step Walkthrough** explaining every concept
  - Understanding the example (what happens when you run it)
  - Key concepts explained (ID, manifest, capabilities, SDK, storage)
- **Common Patterns** (6 real patterns with full code)
  1. Subscribe to conversation events
  2. Create custom LLM tools
  3. Show notifications
  4. Read conversation context
  5. Store per-conversation data
  6. Queue processing (background work)
  7. File storage
- **Debugging Extensions** with:
  - How to enable DevTools (F12)
  - 4 common issues with checklists
  - Debug checklist to diagnose problems
- **Testing Your Extension** with:
  - Manual testing checklist
  - Automated testing example
- **Performance Best Practices** (5 areas)
  - Lazy-load data (don't block on startup)
  - Debounce frequent updates
  - Cache local data
  - Limit event listeners (delegation)
  - Monitor bundle size
- **Security Considerations** (5 areas)
  - Never store secrets
  - Validate user input (XSS prevention)
  - Sanitize AI output
  - Limit permissions (only declare what you use)
  - Clear data on uninstall
- **Publishing Your Extension** (5 steps)
  - Prepare for publication
  - Create package.json
  - npm publish
  - Users install from catalog
  - Updates
- **Real-World Extension Ideas** (8 examples)
  - Code snippet manager
  - Bookmark manager
  - AI cost tracker
  - Quick research tool
  - Habit tracker
  - Telegram/Slack integration
  - Custom LLM tools
  - Data export
- **Troubleshooting Table** (8 problems with solutions)
- **Getting Help** section with links

**EXTENSIONS_API.md (expanded with practical examples):**

- **Quick API Reference** section (copy-paste ready, 150+ lines of examples)
  - Storage: Save and load data
  - Events: React to Chatons events
  - Notifications: Show messages
  - Read conversations
  - File storage
  - Queue: Background jobs
  - LLM tools: Let model call your code
- **Manifest Overview** expanded with examples
- **Capability Model** table with all 13 capabilities explained
- **Manifest Field Reference** with examples for each field
  - `id`, `name`, `version`
  - `ui.mainViews[]`
  - `ui.menuItems[]`
  - `ui.quickActions[]`
  - `llm.tools[]`
- **Error Handling** section with try/catch patterns
- **Async/Await Pattern** explanation
- **Host Events** table with all events + use cases + example code
- **Capabilities Detail** table (UI, storage, events, queue, LLM, host)
- **Extension Storage** with usage examples
- **Persistent Queue** with usage examples
- **Cross-Extension APIs** with call example
- **LLM Tools** detailed with define/handle/rules
- **Extension Servers** configuration example
- **Localization** practical advice
- **Stability and Compatibility** section
- **Common Patterns Reference** linking to tutorial
- **API Reference Quick Links** table

**EXTENSIONS.md (updated):**

- Added introductory note pointing to tutorial
- Cross-links to all related docs
- Still serves as overview for experienced developers

**Depth of Content:**

- ~850 lines of tutorial (21 KB)
- ~600 lines of API reference (15 KB)
- 150+ lines of copy-paste-ready code examples
- 8 real-world extension ideas
- Complete working note-taking extension example
- 6 common design patterns with full code
- Troubleshooting flowchart reference
- Security and performance guidelines

**Why This Matters:**

1. **Zero-to-working:** Developer can follow tutorial and have a working extension in <30 minutes
2. **Copy-paste examples:** All common operations have ready-to-use code
3. **Real patterns:** Not just API reference, but actual design patterns
4. **Debugging guide:** When things break, developers have concrete steps
5. **Security first:** Security considerations documented upfront
6. **Publishing path:** Clear steps from local dev to npm catalog
7. **Ideas:** Concrete extension ideas to inspire projects

**For Extension Developers:**

- Start at `docs/EXTENSIONS_TUTORIAL.md` section "Complete Working Example"
- Copy all 4 files (manifest, HTML, CSS, JS)
- Test immediately (restart Chatons, goes to Extensions panel)
- Works out of the box without any npm dependencies
- From there, modify the example to add your features
- Reference `docs/EXTENSIONS_API.md` when you need specific APIs
- Use common patterns section for design guidance

---

## March 7, 2026 (Session 3)

### Comprehensive documentation expansion across all files

Five documentation files were expanded with substantial practical content:

- `README.md` — Added 8 new sections with user-focused guidance
- `AGENTS.md` — Added 8 new sections with maintainer/developer guidance
- `CONTRIBUTING.md` — New file created with complete contribution workflow
- All changes recorded in `docs/DOCUMENTATION_AUDIT.md` (this file)

**README.md expansions:**

- **Quick Start Workflows** (4 practical examples): Code review, debugging, documentation writing, learning
- **Keyboard Shortcuts** (reference table): Common shortcuts for all platforms
- **Troubleshooting Setup** (5 scenarios): Provider auth, model loading, OAuth, no models, corrupted settings
- **Performance & System Requirements** (3 tables + tips): Min/recommended specs, storage estimates, performance tips, known limitations
- **Data Location & Backups** (4 subsections): Where data lives, how to backup, how to restore, migration guide
- **FAQ** (18 questions across 3 categories): General use, data & privacy, features & advanced

**Total FAQ coverage:**
- General: Can I use multiple providers, mobile support, offline use, export, cloud sync
- Privacy: Data storage, API key handling, telemetry opt-out, OAuth security
- Features: Local LLMs, secure vs open mode, automations, thinking levels, extensions, debugging, worktrees, error recovery

**AGENTS.md expansions:**

- **Troubleshooting Pi Runtime Issues** (7 common scenarios)
  - Settings lock timeout (with lock file cleanup explanation)
  - Model registry corruption (with JSON validation steps)
  - Provider base URL probe failure (debugging with curl)
  - OAuth token expiry (current limitation documented)
  - Session creation failures (multi-step debugging)
  - Too many open file handles (with prevention)

- **Config Recovery Guide** (3 levels of recovery)
  - Level 1: Regenerate single file (settings, models, or auth)
  - Level 2: Restore from backup
  - Level 3: Full reset from scratch
  - Common corruption patterns with fixes
  - Prevention strategies

- **Common Mistakes When Modifying Pi Integration** (8 mistakes)
  - Treating `enabledModels` as read-only
  - Assuming access mode works automatically
  - Not validating credential sync
  - Modifying settings.json directly (wrong approach)
  - Not cleaning up stale sessions
  - Assuming model scope persists without writes
  - Mixing Pi session state with app state
  - Ignoring access mode in tool implementations
  - Each includes explanation and right approach

- **Testing Checklist for Pi Changes** (4 categories, 30+ checkpoints)
  - Unit tests (settings parsing, model loading, access mode, URL normalization)
  - Manual verification (startup, onboarding, settings, conversation, tools, cleanup)
  - Integration tests (provider → conversation → tool workflow)
  - Regression and performance tests

- **Performance Considerations** (6 areas)
  - Session creation latency (1-3 sec baseline + factors)
  - Model loading slowness (debugging, mitigation)
  - Provider probe timeout (30 sec limit, causes)
  - Settings lock contention (prevention)
  - Memory usage (typical footprint, fixes)
  - Disk I/O (when slow, solutions)

- **Updated "When to Update This File"** (section 18)
  - Clear guidance on when docs need updating
  - Links to update DOCUMENTATION_AUDIT.md

**CONTRIBUTING.md (new file):**

Complete contribution guide with 10 sections:
1. Code of Conduct (values)
2. Getting Started (local setup with npm commands)
3. Bug Fixes (workflow from issue to merge)
4. Feature Proposals (when to propose, template, categories)
5. Extension Development (quickstart with code examples)
6. Code Review Expectations (what reviewers look for, how to get faster reviews)
7. Documentation Requirements (the rule, what to document, checklist)
8. Testing Standards (unit, integration, manual, commands)
9. Commit Message Convention (semantic commits with examples)
10. Before You Submit (pre-submission checklist, PR template)

**Key additions in CONTRIBUTING.md:**
- Step-by-step bug fix workflow with git commands
- Feature proposal template with use cases
- Extension development quickstart with manifest examples
- Code review checklist (correctness, quality, tests, docs, performance)
- Full commit convention with 6 types and 3 examples
- Pre-submission checklist (15 items)
- PR description template

**What was verified:**

All new content was written based on:
- Existing code patterns in `electron/ipc/workspace.ts`, `electron/pi-sdk-runtime.ts`
- Actual error patterns that users could encounter
- Current limitations documented in `docs/DOCUMENTATION_AUDIT.md` (Session 1)
- Real workflow patterns from Git history
- Documented conventions from existing code

**Why these additions matter:**

1. **Users have concrete answers** to most common questions (FAQ reduces support burden)
2. **Contributors have clear processes** (CONTRIBUTING.md reduces friction)
3. **Maintainers have debugging tools** (troubleshooting + testing checklist catches issues early)
4. **Data safety is documented** (backup/recovery guide protects users from losing conversations)
5. **Performance expectations are set** (requirements table + tips prevent frustration)

**Scope of changes:**

- README.md: ~4,500 words added (FAQ: 1,200w, Workflows: 600w, Troubleshooting: 800w, Requirements: 600w, Backups: 700w, Shortcuts: 200w)
- AGENTS.md: ~7,000 words added (Troubleshooting: 1,500w, Recovery: 1,200w, Mistakes: 2,000w, Testing: 1,300w, Performance: 1,000w)
- CONTRIBUTING.md: ~8,000 words created (complete new file)

**Total documentation added:** ~19,500 words across 3 files

---

## March 7, 2026 (Session 2)

### Rewrite of maintainer and project-level documentation

Three critical files were rewritten:

- `AGENTS.md` — Maintainer/contributor reference for Pi integration
- `README.md` — Project overview and getting-started guide
- `docs/DOCUMENTATION_AUDIT.md` — This file (added entry)

**AGENTS.md rewrite reason:**

- Previous version mixed vague UI references ("Expected Integration in This Dashboard") with technical details without sufficient context
- Used placeholder model names (`gpt-5.3-codex`) that are hardcoded fallbacks, not actual released models
- Vague instruction patterns ("Use Chatons Settings/Diagnostics actions") without specifics
- Lacked clear purpose statement and audience
- Tonal mismatch between architecture sections and policy enforcement at the end

**What changed:**

- Clear audience statement at the top (maintainers, contributors)
- Explicit purpose: document how Chatons uses Pi and where source of truth lives
- Structured for learning: why → how → what → limitations → debugging
- Practical debugging section with concrete steps
- All technical claims verified against `electron/ipc/workspace.ts` and `electron/pi-sdk-runtime.ts`
- Separated maintenance rule into its own section with clear enforcement policy
- Linked to related documents at the end

**README.md rewrite reason:**

- Marketing language mixed with actual documentation (e.g., "Recommended: Mistral Devstral models" repeated 3 times)
- Outdated roadmap ("Coming Soon: Windows and Linux support" when both are already supported)
- Broken relative links and vague guidance
- No clear technical information about what the app actually does

**What changed:**

- Removed all promotional language and vendor recommendations
- Rewrote feature list to be factual and organized by function
- Clear platform support table with accurate status
- Removed outdated roadmap section
- Added accurate requirements, provider support table, and platform support matrix
- Separated "stable" from "in-progress" features with honest assessment
- Removed vague marketing ("beautiful," "distraction-free") in favor of concrete capability descriptions

**Facts revalidated for AGENTS.md:**

- Pi directory location and managed bootstrap process
- Configuration files: `settings.json`, `models.json`, `auth.json`
- Model scope sourced from `enabledModels` in `settings.json`
- CLI resolution path (bundled vs fallback)
- `PI_CODING_AGENT_DIR` environment variable forcing
- Per-conversation runtime creation and cwd selection
- Access mode effects on tool execution
- OAuth token storage and limitations
- Settings lock cleanup for stale locks
- Debugging commands and diagnostics surfaces

---

## March 7, 2026 (Session 1)

### Full rewrite of the main guides

The two primary guides were rewritten:

- `docs/CHATONS_USER_GUIDE.md`
- `docs/CHATONS_DEVELOPER_GUIDE.md`

Reason for the rewrite:

- the previous versions mixed accurate implementation details with presentation that read like generated release notes
- important facts were present, but the structure made it hard to find answers quickly
- some sections were too broad, some too specific, and the overall hierarchy did not consistently move from overview to implementation detail

What changed in the documentation approach:

- both guides now start with a clear mental model before moving into feature detail
- user-facing and developer-facing concerns are separated more cleanly
- implementation caveats are kept, but phrased as practical limits instead of feature-marketing copy
- factual statements were rechecked against the codebase before rewriting

### Facts revalidated during the rewrite

The rewrite rechecked these implementation points in the source:

- onboarding flow and forced onboarding shortcut
- loading splash behavior
- sidebar and main panel routing
- composer behavior, including queueing, access mode, attachments, and suggested action badges
- scoped model behavior and provider/model settings
- project terminal popup behavior and limitations
- worktree enablement model and current limitations
- skills management through Pi commands
- extension registry, install paths, auto-discovery, and built-in extensions
- channels page behavior and channel-extension classification
- built-in memory behavior and scope model
- settings sections that are actually rendered today
- update behavior and macOS close-vs-quit behavior

### Ongoing rule

Any future change that affects:

- user workflows
- extension contracts
- settings behavior
- architecture
- configuration file semantics

should update the relevant guide in the same change.

If the change is partial or still limited, the documentation should say so directly.
