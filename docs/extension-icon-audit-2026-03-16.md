# Extension icon packaging audit - 2026-03-16

The marketplace sync extracts extension icons from the published npm tarball using the path declared in `chaton.extension.json` (`icon`) and then falls back to `icon.svg` / `icon.png`.

A package will miss its marketplace icon when the tarball does not actually include the icon file.

## Verified packages

| Package | Version | Manifest icon | Declared file present in tarball | `icon.svg` present | `icon.png` present | Result |
|---|---:|---|---|---|---|---|
| `@thibautrey/chatons-extension-linear` | 1.0.4 | `icon.svg` | yes | yes | no | OK |
| `@thibautrey/chatons-channel-bluebubbles` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-discord` | 1.1.0 | `icon.png` | no | no | no | missing |
| `@thibautrey/chatons-channel-imessage` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-line` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-msteams` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-signal` | 1.1.0 | `icon.png` | no | no | no | missing |
| `@thibautrey/chatons-channel-slack` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-synology-chat` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-telegram` | 2.2.1 | none | no | no | no | missing |
| `@thibautrey/chatons-channel-twitch` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-channel-whatsapp` | 1.1.0 | `icon.png` | no | no | no | missing |
| `@thibautrey/chatons-channel-zalo` | 1.1.0 | `icon.svg` | no | no | no | missing |
| `@thibautrey/chatons-extension-discord` | 1.0.0 | none | no | no | no | missing |

## Required package fix

Each affected extension should publish its icon file inside the npm tarball.

Recommended `package.json` pattern:

```json
{
  "files": [
    "index.js",
    "index.html",
    "handler.js",
    "chaton.extension.json",
    "icon.svg",
    "icon.png",
    "README.md"
  ]
}
```

Keep only the files that actually exist in the package.

## Verification before publish

Run:

```bash
npm pack --dry-run
```

Then verify the output includes the expected icon file.

## After republishing

1. Publish patched versions of the affected extensions.
2. Re-run the marketplace registry sync.
3. Confirm the API returns non-null `iconUrl` for those packages.
