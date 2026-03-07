# Documentation Audit

This file records documentation drift that mattered enough to require explicit cleanup, clarification, or rewrites.

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
