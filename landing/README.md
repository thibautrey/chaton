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

## Deployment
For Vercel:
- Root Directory: `landing`
- Build Command: `npm run build`
- Output Directory: `dist`

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
