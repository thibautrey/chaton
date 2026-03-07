# Versioning and Releases

This document explains the versioning logic currently implemented for Chatons releases.

It replaces older wording that implied a cleaner semantic-release pipeline than the repository actually enforces today.

---

## 1. What exists today

The repository includes a version bump script:

- `scripts/version.js`

and a GitHub Actions workflow:

- `.github/workflows/build-all-platforms.yml`

Together, they implement a lightweight automated version bump and release flow based on Git history.

---

## 2. How version bumps are determined

`scripts/version.js` examines Git commit messages since the latest semver-style tag and decides whether to bump:

- major
- minor
- patch
- or not bump at all

It starts from the latest Git tag if one exists. If no semver tag is found, it falls back to `0.0.0` and then to `package.json` where appropriate.

---

## 3. Commit message rules currently implemented

The script looks for conventional-commit-like subjects.

Current recognized types are:

- `feat`
- `fix`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `chore`

### Bump rules currently implemented in code

- **major**: when the parsed commit subject contains `BREAKING CHANGE` or ends with `!`
- **minor**: when at least one parsed commit is `feat:`
- **patch**: when at least one parsed commit is `fix:`
- **none**: when no qualifying commit type is found

Important caveat:

- the implementation checks the parsed commit subject line, not a full multi-line conventional commit body/footer parser
- that means `BREAKING CHANGE` detection is simpler than a full conventional-commits implementation
- the `!` handling is also based on the parsed subject match logic in the current script, so do not document this as a fully standards-complete commit parser

---

## 4. What the script updates

When a bump is needed, the script updates:

- `package.json > version`

and prints the resulting version.

If no bump is needed, it returns the current version unchanged.

---

## 5. CI workflow behavior

The GitHub workflow currently does the following high-level steps:

1. checks out the repository with full history
2. runs `node scripts/version.js`
3. commits the updated `package.json` when it changed
4. builds release artifacts for supported platforms

The workflow also ignores pure documentation changes for push-triggered build jobs.

Examples from the workflow:

- `docs/**` is ignored for push and pull-request triggers
- Markdown-only changes are largely excluded from release builds

That means documentation edits alone do not normally trigger the full build-and-release pipeline.

---

## 6. What to expect from artifact naming

Do not assume version numbers appear in every artifact filename exactly as older docs described.

Current `package.json` Electron Builder configuration uses:

- DMG artifact name: `${productName}-latest-${arch}.${ext}`

So the default macOS DMG naming is architecture-based and `latest`-styled, not semver-in-filename by default.

If you change artifact naming, update this document and the signing docs in the same change.

---

## 7. How to use it locally

### Print or apply the current version logic

```bash
node scripts/version.js
```

### Run version tests

```bash
npm run version:test
```

The repository includes:

- `scripts/test-version.js`
- `scripts/test-version-logic.js`

Use those when changing version logic.

---

## 8. Manual override strategy

If you need a manual override, the current repository does not implement a dedicated release CLI for that.

The practical fallback is still editing `package.json` version directly, then committing the change intentionally.

---

## 9. What this system is and is not

### It is

- an automated version bump helper based on Git commit messages
- simple enough to understand and debug locally
- integrated into the GitHub build workflow

### It is not

- a full semantic-release implementation
- a complete parser for every nuance of Conventional Commits
- a guarantee that artifact filenames always embed semver numbers by default

That distinction matters because older documentation overstated the completeness of the release pipeline.
