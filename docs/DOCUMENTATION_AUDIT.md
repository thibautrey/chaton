# Documentation Audit: Docs vs Implemented Reality

## 1. Objective
This audit compares existing documentation with the current implementation and identifies where docs drifted from shipped behavior.

Audit baseline: source state inspected on **March 5, 2026**.

## 2. Executive Summary
The previous documentation set contained useful intent, but several files describe behavior that is now incomplete, partially implemented, or implemented differently.

The biggest drift areas are:

- extension loading and install behavior
- worktree Git lifecycle capabilities
- update/apply behavior maturity
- Pi integration path details and current UI flows

## 3. Key Mismatches Found

### A. Extensions
Documented expectation:

- extension install + manifest workflow appears fully integrated end-to-end.

Observed behavior:

- runtime only loads extension manifests present on disk (`chaton.extension.json` in extension directory)
- npm extension install currently creates minimal folder metadata, not a full runnable extension package layout by itself
- runtime manifest map is initialized at startup; restart is safest after extension changes
- extension menu items in manifest are not currently auto-rendered as full dynamic sidebar navigation entries

### B. Quick actions for extensions
Documented expectation:

- manifest quick actions appear as first-class user cards.

Observed behavior:

- user quick-action cards are read from extension registry config (`config.quickActions`) in the frontend card system
- manifest quick actions are available in runtime manifest data, but not the sole source used by the main quick-card rail

### C. Worktree and Git actions
Documented expectation:

- full commit/merge/push worktree lifecycle with robust Git parity.

Observed behavior:

- push currently returns unavailable in self-contained mode
- merge path uses custom copy-based logic in current implementation
- some ahead/behind and merge-state helpers are currently stubbed/approximate

### D. Updater maturity
Documented expectation:

- full platform-native apply path implied.

Observed behavior:

- update check + download are implemented
- apply phase contains placeholder/platform-limited handling in several branches

### E. Pi integration docs
Documented expectation:

- some paths and module structure are historical

Observed behavior:

- current orchestration is centered around workspace IPC + Pi SDK runtime + React workspace store
- actual user-facing flow includes onboarding, scoped model control, queueing behavior, attachment preprocessing, and access-mode switching

## 4. New Canonical Documentation
To replace drifted guidance, the following docs are now the canonical references:

- `docs/CHATONS_USER_GUIDE.md`
- `docs/CHATONS_DEVELOPER_GUIDE.md`

## 5. Legacy Docs Status
Existing historical docs remain useful for context but should be treated as legacy unless aligned to current behavior.

## 6. Maintenance Rule Going Forward
To prevent future drift:

1. every behavior change PR should include doc updates in the same PR
2. docs must include explicit “current limitations” for partial features
3. shipped behavior and planned behavior must be clearly separated
4. user and developer docs must remain distinct
