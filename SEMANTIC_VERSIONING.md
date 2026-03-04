# Semantic Versioning System

This document explains the semantic versioning system implemented for Chatons Native releases.

## Overview

The project now uses **Semantic Versioning (SemVer)** instead of sequential build numbers. This means:

- **MAJOR.version.patch** for breaking changes
- **minor.VERSION.patch** for new features (backward compatible)
- **major.minor.PATCH** for bug fixes (backward compatible)

## How It Works

### 1. Version Determination

The `scripts/version.js` script analyzes Git commit messages since the last tag to determine the appropriate version bump:

- **Major bump (X.0.0)**: When commits contain `BREAKING CHANGE` or `!` suffix
- **Minor bump (0.X.0)**: When commits start with `feat:` (new features)
- **Patch bump (0.0.X)**: When commits start with `fix:` (bug fixes)
- **No bump**: For other commit types like `docs:`, `chore:`, `style:`, etc.

### 2. Commit Message Format

Follow **Conventional Commits** format:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

**Types:**
- `feat`: New feature (minor bump)
- `fix`: Bug fix (patch bump)
- `docs`: Documentation only
- `style`: Code formatting, missing semicolons, etc.
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding missing tests
- `chore`: Maintenance tasks

**Examples:**
```bash
# Minor bump (new feature)
git commit -m "feat: add dark mode support"

# Patch bump (bug fix)
git commit -m "fix: correct electron window sizing"

# Major bump (breaking change)
git commit -m "feat(api): remove deprecated endpoints!"
git commit -m "feat: new auth system\n\nBREAKING CHANGE: Old auth tokens no longer work"

# No version bump
git commit -m "docs: update README"
git commit -m "chore: update dependencies"
```

## CI/CD Integration

The GitHub Actions workflow (`build-all-platforms.yml`) now:

1. **Determines version**: Runs `scripts/version.js` to calculate the new version
2. **Updates package.json**: Commits the version change back to the repository
3. **Creates GitHub Release**: Uses semantic version tags (e.g., `v1.2.3`) instead of build numbers
4. **Builds artifacts**: All binaries include the correct version in filenames

## Release Process

### Automatic Releases

1. Push changes to `main` branch
2. CI detects commit types and determines version bump
3. New version is calculated and applied
4. GitHub Release is created with proper semantic version tag
5. All platform binaries are uploaded with correct version numbers

### Manual Version Management

To manually set a specific version:

```bash
# Set a specific version
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
pkg.version = '1.2.3';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Or use the version script with environment override
VERSION_OVERRIDE=1.2.3 node scripts/version.js
```

## Version Format in Artifacts

The version appears in:

- **package.json**: `"version": "1.2.3"`
- **GitHub Release Tag**: `v1.2.3`
- **macOS DMG**: `Chatons-1.2.3.dmg`
- **Windows EXE**: `Chatons-Setup-1.2.3.exe`
- **Linux AppImage**: `Chatons-1.2.3.AppImage`

## Troubleshooting

### Version not bumping as expected?

1. Check your commit messages follow conventional commits format
2. Verify Git tags exist: `git tag -l`
3. Check commit history: `git log --oneline`
4. Run version script manually: `node scripts/version.js`

### Need to force a version bump?

Add an empty commit with the appropriate type:
```bash
# Force minor bump
git commit --allow-empty -m "feat: trigger version bump"

# Force patch bump  
git commit --allow-empty -m "fix: trigger version bump"
```

## Migration from Build Numbers

Previous releases used GitHub run numbers (e.g., `v123`). The new system:

- Starts from the current package.json version
- Uses semantic versioning going forward
- Maintains backward compatibility with existing releases

## Best Practices

1. **Always use conventional commits** for consistent versioning
2. **Keep changes atomic** - one feature/fix per commit
3. **Use scope** when relevant: `feat(api):`, `fix(ui):`
4. **Document breaking changes** clearly in commit messages
5. **Test version script locally** before pushing major changes

## References

- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Electron Builder versioning](https://www.electron.build/configuration/configuration#build-version)
