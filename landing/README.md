# Chatons Landing

Self-contained landing page project for Chatons.

## Purpose
This folder is intentionally deployable on its own, for example by pointing Vercel directly at `landing/`.

## Stack
- React
- Vite
- TypeScript
- Framer Motion
- Lucide React

## Development
From this folder:

```bash
npm install
npm run dev
```

## Build
```bash
npm install
npm run build
```

## Extension Marketplace

The extensions marketplace is automatically generated at build time. **No database required.**

### How it works

1. **`extensions-registry.json`** is the single source of truth. It lists:
   - **Builtin extensions** with paths to their local `chaton.extension.json` manifests
   - **npm extensions** as just their package names

2. **`scripts/fetch-extensions.js`** runs as the first step of `npm run build`. It:
   - Reads builtin manifests from the Electron source tree
   - Fetches each npm package's metadata from the npm registry
   - Downloads icons from npm tarballs (if not already cached locally)
   - Outputs `src/generated/extensions-catalog.json` with full metadata

3. **`src/extensions-data.ts`** imports the generated catalog and exports typed arrays consumed by the marketplace pages.

### Adding a new extension

Just add the npm package name to the `"npm"` array in `extensions-registry.json`:

```json
{
  "npm": [
    "@thibautrey/chatons-channel-telegram",
    "@yourscope/chatons-extension-new-thing"
  ]
}
```

Then rebuild. The script will fetch the manifest, extract the icon from the npm tarball, and generate all the catalog data automatically.

### Adding a new builtin extension

Add an entry to the `"builtin"` array in `extensions-registry.json` with the path to its `chaton.extension.json`:

```json
{
  "builtin": [
    {
      "id": "@chaton/new-builtin",
      "manifestPath": "../electron/extensions/builtin/new-builtin/chaton.extension.json",
      "description": "Description for the marketplace.",
      "keywords": ["relevant", "keywords"]
    }
  ]
}
```

### Running the fetch script standalone

```bash
npm run fetch-extensions
```

This regenerates `src/generated/extensions-catalog.json` and downloads any missing icons to `public/extension-icons/`.

## Deployment
For Vercel:
- Root Directory: `landing`
- Build Command: `npm run build`
- Output Directory: `dist`

The build command automatically fetches extension data from npm before building, so every deployment gets fresh extension metadata.

Current production split:
- `docs.chatons.ai` should point to the docs app in `docs/`
- the standalone landing site remains deployable from `landing/` on a separate Vercel project/domain if needed

## Notes
- The primary CTA points to GitHub releases:
  - `https://github.com/thibautrey/chaton`
- OS detection happens client-side to suggest the most likely binary.
- The binary filenames currently assume these latest-release artifact names:
  - `Chatons-latest-arm64.dmg`
  - `Chatons-latest-x64.dmg`
  - `ChatonsSetup-latest.exe`
  - `Chatons-latest.AppImage`

If actual release filenames differ, update `landing/src/LandingPage.tsx`.
