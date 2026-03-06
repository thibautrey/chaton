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

### Landing page project
A standalone deployable landing page project now lives in `landing/`.

Implications:
- marketing site deployment is separated from the desktop app renderer
- Vercel can target `landing/` as its root directory
- landing-specific implementation and deployment details are documented in `landing/README.md`

Current limitation:
- download URLs assume stable GitHub release asset filenames and should be updated if release naming changes
