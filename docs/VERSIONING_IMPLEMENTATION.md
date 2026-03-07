# Versioning Implementation Notes

---

## 1. Problem the current implementation addresses

The repository wanted version bumps tied more closely to the nature of changes instead of using only monotonically increasing build identifiers.

The current implementation addresses that with:

- `scripts/version.js`
- GitHub workflow integration in `.github/workflows/build-all-platforms.yml`

---

## 2. How the script works

`scripts/version.js`:

1. finds the latest semver-like Git tag
2. reads commit subjects since that tag
3. classifies the required bump as major, minor, patch, or none
4. updates `package.json`
5. prints the resulting version

Fallback behavior:

- if no semver tag is found, it starts effectively from `0.0.0`
- if version detection fails broadly, the script falls back conservatively and can default to a patch bump in error paths

---

## 3. Bump logic currently implemented

Current precedence:

1. major
2. minor
3. patch
4. none

Current detection rules in code:

- major: parsed commit subject contains `BREAKING CHANGE` or ends with `!`
- minor: at least one parsed `feat:` commit
- patch: at least one parsed `fix:` commit
- none: no matching change type

Important implementation detail:

- the parser is lightweight and commit-subject-oriented
- it is not a complete Conventional Commits parser for full message bodies and structured footers

So this should be documented as a practical commit-based bump script, not as a full semantic-release engine.

---

## 4. CI integration

The GitHub workflow uses the script in a `Determine and Set Version` job.

That job:

- checks out full history
- runs `node scripts/version.js`
- exposes the computed version as a workflow output
- commits `package.json` when it changed

Later jobs sync `package.json` to the computed version before platform builds.

---

## 5. Testing support

The repository includes versioning test scripts:

- `scripts/test-version.js`
- `scripts/test-version-logic.js`

Package script:

- `npm run version:test`

If you modify bump logic, these tests should be reviewed and kept aligned.

---

## 6. What the older documentation overstated

Older notes described a cleaner semver pipeline than what the code actually guarantees.

Important corrections:

- artifact filenames are not universally semver-based by default
- the bump parser is simpler than a full conventional-commit parser
- the release flow is a custom lightweight workflow, not a turnkey semantic-release setup

---

## 7. Practical maintenance rule

If you change any of the following, update this document and `docs/SEMANTIC_VERSIONING.md` together:

- bump rules
- commit parsing logic
- workflow release behavior
- artifact naming
- manual override expectations
