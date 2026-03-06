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

### Extension path resolution and manifest preservation
User extensions are now resolved canonically from `~/.chaton/extensions/<extension-id>` with legacy fallback support for `~/.chaton/extensions/extensions/<extension-id>`.

Implications:
- runtime path resolution for manifests, HTML assets, icons, and server-start uses the resolved extension root consistently
- normalized manifests preserve declared `server` metadata so `server.start` remains available after runtime manifest loading
