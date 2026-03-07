# Documentation Audit

This file records documentation drift that mattered enough to require explicit cleanup, clarification, or rewrites.

---

## March 7, 2026

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
