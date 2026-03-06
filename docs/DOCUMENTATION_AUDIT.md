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
- telemetry/crash monitoring consent flow (now Sentry + sidebar setting linkage)

## 3. Key Mismatches Found

### A. Extensions
Documented expectation:

- extension install + manifest workflow appears fully integrated end-to-end.
- extension tools callable by the LLM during thread execution must be documented as part of the extension contract.
- extension UI was previously mostly custom per extension.

Observed behavior:

- runtime only loads extension manifests present on disk (`chaton.extension.json` in extension directory)
- npm extension install currently creates minimal folder metadata, not a full runnable extension package layout by itself
- runtime manifest map is initialized at startup; restart is safest after extension changes
- extension menu items in manifest are not currently auto-rendered as full dynamic sidebar navigation entries
- extensions can now declare `llm.tools[]`; Chatons injects these as Pi `customTools` during thread runtime and bridges execution to same-name extension APIs via `extensions:call`
- Chatons now injects a small shared UI helper layer into extension `mainView` pages so extensions can reuse host-aligned components while staying free to implement fully custom UI
- the built-in Automation extension has been migrated to this shared UI layer and acts as the reference implementation
- Channel extensions are now documented as a dedicated extension profile for external messaging bridges; they are identified with manifest field `kind: "channel"`, are hidden from direct sidebar menu-item exposure, and imported messages are specified to target global threads only

### B. Quick actions for extensions
Documented expectation:

- manifest quick actions appear as first-class user cards.

Observed behavior:

- user quick-action cards are read from extension registry config (`config.quickActions`) in the frontend card system
- manifest quick actions are available in runtime manifest data, but not the sole source used by the main quick-card rail
- in empty-thread hero states, quick action cards are constrained to the conversation column width and centered relative to that column, with vertical placement still informed by measured composer overlay height

### C. Worktree and Git actions
Documented expectation:

- full commit/merge/push worktree lifecycle with robust Git parity.

Observed behavior:

- worktree creation is opt-in per project conversation (topbar icon), disabled by default
- push currently returns unavailable in self-contained mode
- merge path uses custom copy-based logic in current implementation
- some ahead/behind and merge-state helpers are currently stubbed/approximate

### D. Updater maturity
Documented expectation:

- full platform-native apply path implied.

Observed behavior:

- update check + download are implemented
- apply phase contains placeholder/platform-limited handling in several branches
- runtime guards now prevent hard crashes when updater/changelog local artifacts are missing (`window.electron` bridge absent in renderer, missing `<userData>/updates` directory in apply path)

### E. Pi integration docs
Documented expectation:

- some paths and module structure are historical

Observed behavior:

- current orchestration is centered around workspace IPC + Pi SDK runtime + React workspace store
- actual user-facing flow includes onboarding, scoped model control, queueing behavior, attachment preprocessing, and access-mode switching
- Pi command execution (list models / skills / config helpers) now runs with Electron Node against bundled Pi CLI and `PI_CODING_AGENT_DIR` forced to Chatons internal `<userData>/.pi/agent` (no dependency on user-global `~/.pi/agent/bin/pi` shell setup)
- Model sync now imports provider models from internal `pi --list-models` output into Chatons `models.json`; onboarding no longer writes hardcoded provider model IDs.
- `auth.json` is now bootstrapped proactively during app startup (not only lazily) and models/auth key sync runs at bootstrap + IPC/runtime entry points
- macOS app lifecycle clarified and aligned with implementation: window close hides app (keeps background alive), explicit quit (`Cmd+Q` / tray `Quitter`) now exits correctly via `before-quit` + `isQuitting` guard in close handler
- macOS status bar icon loading hardened: dedicated `statusbar.png` is now preferred, with `chaton.png` then `icon.png` fallbacks; menu-bar-size normalization added; template rendering no longer forced for non-template assets
- macOS CI notarization validation clarified: DMG stapling remains best effort and DMG container signature probing is non-blocking; blocking trust/notarization checks are enforced on a writable copy of the enclosed `.app` (`codesign --deep --strict`, `spctl -t exec`, `xcrun stapler staple|validate` on copied app)
- provider base URL writes now include background auto-correction for common OpenAI-compatible variants (origin, trailing slash, `/v1`) in workspace IPC before `models.json` persistence
- auth failures (`401`/`unauthorized`) now include safe debug context in runtime error strings: provider, source hint, masked key preview, short fingerprint; raw key material is not logged
- message send failures (`prompt` / `follow_up` / `steer`) now propagate to a user-facing composer notice in frontend store; `401`/auth-like errors are mapped to explicit API-key/auth guidance

### F. Telemetry consent and monitoring
Documented expectation:

- no explicit user-facing consent flow and no Sentry-backed monitoring path.

Observed behavior:

- monitoring now targets Sentry ingestion by default (embedded DSN), with optional `SENTRY_DSN` override
- telemetry emission is opt-in and controlled by persisted sidebar setting (`allowAnonymousTelemetry`)
- telemetry emission to Sentry is filtered to error/crash events only (no info/warn/debug forwarding)
- bottom-right consent card appears once after onboarding and writes persisted decision (`telemetryConsentAnswered`)
- setting remains editable in `Settings > Sidebar`

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
