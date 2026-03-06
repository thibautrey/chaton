# Documentation Audit

## March 6, 2026

### Extension display names
Extension UI now prefers the manifest `name` as the primary label instead of the npm package name.

Implications:
- extensions must declare a human-readable `name` in `chaton.extension.json`
- the package name / extension ID remains visible in metadata areas only

### Thread action suggestion badges
A new internal LLM-facing thread action suggestion mechanism now exists.

Implications:
- the runtime can emit up to 4 suggested thread actions through an internal UI event
- the renderer shows them as clickable badges above the conversation input
- suggestions are intentionally ephemeral and disappear on click or on any user send
- runtime prompt composition now includes English guidance blocks for thread actions and access-mode limitation handling
- Pi runtime now exposes an internal `get_access_mode` command/tool so the model can re-check the current live conversation mode instead of relying only on the session-start prompt snapshot

### Public website deployment split
The repository now contains two separately deployable public web apps:

- `docs/`: Next/Fumadocs site intended to be served at `https://chatons.ai`
- `landing/`: standalone Vite marketing site intended for separate deployment when needed

Implications:
- docs must work correctly from domain root, not under `/docs`
- internal docs links should use root-relative paths such as `/getting-started`
- landing-specific implementation and deployment details remain documented in `landing/README.md`

Current limitation:
- landing download URLs assume stable GitHub release asset filenames and should be updated if release naming changes

### Extension icons from assets
Extensions can now provide `icon` as a relative asset path in `chaton.extension.json`, and the UI renders the resolved image in Extensions and Channels lists.
- update checks are cached once per app load to reduce GitHub API usage

### Extension server auto-start
Extensions can now declare a local server process in `chaton.extension.json` (`server.start`) that Chatons launches automatically and waits on before opening extension UIs.

### Extension runtime modularization
`electron/extensions/runtime.ts` has been refactored into smaller concern-based modules under `electron/extensions/runtime/`.

Implications:
- the public runtime entrypoint remains `electron/extensions/runtime.ts`
- internal maintenance is now split across focused files for manifests, logging, server lifecycle, queue/storage, memory, automation, host calls, HTML rendering, and tool exposure
- no user-facing behavior is intended to change from this refactor

### Extension path resolution and manifest preservation
User extensions are now resolved canonically from `~/.chaton/extensions/<extension-id>` with legacy fallback support for `~/.chaton/extensions/extensions/<extension-id>`.

Implications:
- runtime path resolution for manifests, HTML assets, icons, and server-start uses the resolved extension root consistently
- normalized manifests preserve declared `server` metadata so `server.start` remains available after runtime manifest loading

### Telegram channel extension implemented in user extensions
A concrete Telegram channel extension is now installed as a user extension under `~/.chaton/extensions/@thibautrey/chatons-channel-telegram`.

Implications:
- Chatons now has a working reference channel integration for Telegram using the documented `kind: "channel"` contract
- setup is BotFather-based and uses Telegram long polling from the extension UI, so no public webhook server is required for the basic integration
- inbound Telegram messages are normalized and injected into Chatons global threads through `channels.upsertGlobalThread` and `channels.ingestMessage`
- outbound reply mirroring reads Chatons conversation messages through `conversations.getMessages` and sends assistant replies back to Telegram
- Telegram media messages are preserved as attachment metadata and downloadable Telegram file URLs for images, documents, audio, voice notes, and video
- Telegram provider behavior is no longer hardcoded in the host runtime; the extension now relies only on generic host APIs plus direct Telegram Bot API calls from the extension UI
