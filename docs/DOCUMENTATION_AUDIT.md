# Documentation Audit

## March 6, 2026

### Landing page project
A standalone deployable landing page project now lives in `landing/`.

Implications:
- marketing site deployment is separated from the desktop app renderer
- Vercel can target `landing/` as its root directory
- landing-specific implementation and deployment details are documented in `landing/README.md`

Current limitation:
- download URLs assume stable GitHub release asset filenames and should be updated if release naming changes
