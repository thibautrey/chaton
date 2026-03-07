# Contributing to Chatons

Thank you for considering contributing to Chatons. This guide will help you understand the process and best practices.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Bug Fixes](#bug-fixes)
4. [Feature Proposals](#feature-proposals)
5. [Extension Development](#extension-development)
6. [Code Review Expectations](#code-review-expectations)
7. [Documentation Requirements](#documentation-requirements)
8. [Testing Standards](#testing-standards)
9. [Commit Message Convention](#commit-message-convention)
10. [Before You Submit](#before-you-submit)

---

## Code of Conduct

- Be respectful and inclusive
- Assume good intent
- Focus on the code, not the person
- Report code of conduct violations to the maintainers

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- A code editor (VS Code recommended)
- Familiarity with Electron, React, TypeScript, and Electron IPC

### Local Setup

1. **Fork and clone:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/chaton.git
   cd chaton
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build and run:**
   ```bash
   npm start
   ```

   This starts the development build. The app will open with hot-reload enabled.

4. **Run tests** (if present):
   ```bash
   npm test
   ```

### Development Tips

- **DevTools:** Press `F12` in the running app to open DevTools
- **Main process logs:** Check the terminal where you ran `npm start`
- **Renderer logs:** Check the DevTools console tab
- **Hot reload:** Most changes to React components reload automatically
- **Extension changes:** Require app restart (see `AGENTS.md` section 7)

---

## Bug Fixes

### Identifying a Bug

A bug is when Chatons behaves differently from its documented behavior or crashes unexpectedly.

**Before fixing, verify:**
- The issue is reproducible
- It's not a feature request disguised as a bug
- It's not already reported or fixed in main branch

### Bug Fix Workflow

1. **Search GitHub issues** — Is this already reported or fixed?

2. **Create an issue** (if not already present):
   - Title: "Bug: [component] [symptom]"
   - Description:
     - What you expected to happen
     - What actually happened
     - Steps to reproduce
     - Your system (OS, Chatons version)
     - Relevant logs or error messages

3. **Create a branch for the fix:**
   ```bash
   git checkout -b fix/issue-number-short-description
   # Example: fix/521-settings-lock-timeout
   ```

4. **Write minimal, focused code:**
   - Fix only the reported issue
   - Don't refactor unrelated code
   - Keep the change small and reviewable

5. **Add tests** (if applicable):
   - Unit tests for logic changes
   - Regression test if this bug reappeared before

6. **Update documentation:**
   - If the bug fix changes behavior, update the relevant guide
   - Add troubleshooting section if it's a known issue others will hit
   - Update `docs/DOCUMENTATION_AUDIT.md` with a note

7. **Commit with semantic message:**
   ```bash
   git commit -m "fix: resolve settings.json lock timeout (closes #521)"
   ```

8. **Push and open a PR:**
   ```bash
   git push origin fix/521-settings-lock-timeout
   ```

9. **Respond to review feedback:**
   - Address all comments
   - Re-request review after changes
   - Keep the PR focused (don't add new features)

### Example Bug Fix

**Issue:** "Settings lock timeout when opening app quickly after crash"

**Fix process:**
1. Reproduce: Kill app during settings write, restart immediately
2. Root cause: `settings.json.lock` not cleaned up
3. Solution: Add cleanup code for stale locks in `electron/ipc/workspace.ts`
4. Test: Manual verification + automated test for lock cleanup
5. Docs: Add to `AGENTS.md` section 13 (Troubleshooting)

---

## Feature Proposals

### When to Propose a Feature

- You have an idea for new functionality
- You see a limitation in current behavior
- You want community feedback before building

### Proposal Workflow

1. **Open a GitHub discussion or issue** with label `enhancement`:
   - Title: "Feature: [feature name]"
   - Describe the use case and benefits
   - Suggest implementation approach if you have one
   - Link to any related issues

2. **Gather feedback:**
   - Maintainers will provide initial guidance
   - Discussion happens in the issue/discussion
   - No need to code before feedback

3. **If approved:**
   - Create a branch: `git checkout -b feat/short-description`
   - Build the feature following the same process as bug fixes
   - Include tests and documentation from the start

4. **If not a priority right now:**
   - Don't build it yet
   - If you really want it, you can build it anyway and submit a PR
   - But be prepared that it might not be merged if priorities differ

### Feature Categories

#### High-Priority Features (More Likely to Be Merged)

- Bug fixes and performance improvements
- Quality of life (UX improvements, error messages)
- Documentation and testing
- Accessibility improvements

#### Lower-Priority Features (Discuss First)

- New major features (need broader design discussion)
- Breaking changes to APIs
- New UI elements (need design review)
- Major architecture changes

### Feature Proposal Template

```markdown
# Feature Proposal: [Name]

## Use Case
[Why do we need this?]

## Current Behavior
[How do users work around this today?]

## Proposed Behavior
[What would work better?]

## Implementation Notes
[Rough approach, if you have one]

## Affected Files
[Which areas of the codebase would change?]

## Breaking Changes
[Does this break existing behavior?]
```

---

## Extension Development

### When to Build an Extension vs. a Core Feature

**Build an extension if:**
- The feature is optional and can be disabled
- Multiple users want similar but different behavior
- The feature integrates with external services
- You want to keep it separate from core

**Build into core if:**
- All users need it (conversations, file editing, etc.)
- It requires deep integration with Chatons runtime
- Performance/reliability is critical

### Extension Development Quickstart

#### 1. Create Project Structure

```bash
mkdir -p ~/.chaton/extensions/my-extension
cd ~/.chaton/extensions/my-extension

# Create manifest
cat > chaton.extension.json << 'EOF'
{
  "id": "@username/chatons-my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "capabilities": ["ui.mainView"],
  "ui": {
    "mainViews": [{
      "viewId": "my.main",
      "title": "My View",
      "webviewUrl": "chaton-extension://@username/chatons-my-extension/index.html",
      "initialRoute": "/"
    }]
  }
}
EOF

# Create UI
cat > index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>My Extension</title></head>
<body><h1>Hello from my extension</h1></body>
</html>
EOF
```

#### 2. Add Capabilities

In your `chaton.extension.json`, declare what you need:

```json
{
  "capabilities": [
    "ui.mainView",
    "events.subscribe",
    "storage.kv",
    "llm.tools"
  ]
}
```

See `docs/EXTENSIONS_API.md` section 2 for full list.

#### 3. Build Your UI

Use the Chatons extension UI library:

```html
<script src="chaton-extension://chatons/sdk.js"></script>
<script>
  const { api } = window.chatonExtension;
  
  // Subscribe to events
  api.events.subscribe('conversation.created', (event) => {
    console.log('Conversation started:', event);
  });
  
  // Use storage
  api.storage.kv.set('key', 'value');
  const value = api.storage.kv.get('key');
</script>
```

See `docs/EXTENSIONS_UI_LIBRARY.md` for full API reference.

#### 4. Test Locally

1. Place extension in `~/.chaton/extensions/`
2. Restart Chatons
3. Go to `Extensions` panel
4. Your extension should appear as installed
5. Click to open the main view

#### 5. Add LLM Tools (Optional)

In your manifest:

```json
{
  "llm.tools": [{
    "name": "my_tool",
    "description": "What this tool does",
    "inputSchema": {
      "type": "object",
      "properties": {
        "param1": { "type": "string" }
      }
    }
  }]
}
```

In your extension code, handle tool calls:

```javascript
api.llm.tools.onCall('my_tool', async (params) => {
  return { result: "tool output" };
});
```

#### 6. Publish to npm (Optional)

See `docs/EXTENSION_PUBLISHING.md` for detailed instructions.

```bash
npm login
npm publish
```

Your extension will be available in the Chatons extension catalog.

### Extension Resources

- **API Reference:** `docs/EXTENSIONS_API.md`
- **UI Library:** `docs/EXTENSIONS_UI_LIBRARY.md`
- **Publishing:** `docs/EXTENSION_PUBLISHING.md`
- **Channels:** `docs/EXTENSIONS_CHANNELS.md` (if integrating messaging platforms)

---

## Code Review Expectations

### What Reviewers Look For

1. **Correctness**
   - Does it solve the stated problem?
   - Are there edge cases not handled?
   - Could this cause regressions?

2. **Code Quality**
   - Is the code readable and maintainable?
   - Does it follow project conventions?
   - Are types properly used (TypeScript)?

3. **Tests**
   - Are there tests? (Required for behavior changes)
   - Do they cover normal and edge cases?
   - Do they pass locally?

4. **Documentation**
   - Is the change documented?
   - Are user guides updated if needed?
   - Is behavior clearly explained?

5. **Performance**
   - Does this add unnecessary overhead?
   - Are there potential memory leaks?
   - Is UI responsiveness maintained?

### How to Get Faster Reviews

- **Smaller PRs are faster to review** — Keep changes focused
- **Write clear PR descriptions** — Explain what and why
- **Request specific reviewers** — Tag someone familiar with the code
- **Be responsive to feedback** — Quick replies speed up iteration
- **Run tests locally first** — Don't make reviewers wait for CI

### Responding to Review Comments

- Assume good intent — reviewers are helping
- Explain your reasoning if you disagree
- Update code and re-request review (don't start a new PR)
- Resolve conversations when addressed
- Add a comment when you've made changes

---

## Documentation Requirements

### The Rule

**Any change that affects user workflows, extension contracts, configuration, or architecture must include documentation updates in the same changeset.**

Documentation updates are **mandatory**, not optional.

### What to Document

| Change Type | Where to Document |
|------------|-----------------|
| User-facing UI change | `docs/CHATONS_USER_GUIDE.md` |
| Developer API change | `docs/CHATONS_DEVELOPER_GUIDE.md` |
| Extension system change | `docs/EXTENSIONS_API.md` or `docs/EXTENSIONS.md` |
| Pi integration change | `AGENTS.md` or `docs/PI_INTEGRATION.md` |
| New limitations discovered | `docs/DOCUMENTATION_AUDIT.md` (new entry) |
| Setting behavior change | `README.md` (FAQ or Settings section) |
| Configuration file format change | `AGENTS.md` section 3 (Configuration) |
| Automation system change | `docs/AUTOMATION_EXTENSION.md` |

### Documentation Checklist

Before submitting your PR, verify:

- [ ] Changed behavior is documented in the appropriate guide
- [ ] New limitations are explained (not hidden)
- [ ] Examples or screenshots are added if helpful
- [ ] Related documents are cross-linked
- [ ] `docs/DOCUMENTATION_AUDIT.md` has a new entry for this session
- [ ] No placeholder text ("TODO", "TBD") in docs
- [ ] Docs are factual and match actual code behavior

### Example: Documenting a Bug Fix

**You fix:** Settings lock timeout

**Documentation updates:**
1. Add troubleshooting step to `AGENTS.md` section 13
2. Add recovery procedure to `AGENTS.md` section 14
3. Update `docs/DOCUMENTATION_AUDIT.md` with new dated entry

```markdown
## March 8, 2026

### Fix: Settings lock timeout on rapid app restart

**What changed:**
- Added automatic cleanup of stale `settings.json.lock` files older than 5 minutes
- Prevents "EACCES" errors during session initialization

**Where documented:**
- `AGENTS.md` section 13 (Troubleshooting)
- `AGENTS.md` section 14 (Config Recovery)
```

---

## Testing Standards

### Unit Tests

- **Required for:** Business logic, utilities, state management
- **Tool:** Jest (or whatever the project uses)
- **Coverage:** Aim for >80% for critical paths
- **Location:** `src/__tests__/` or `electron/__tests__/`

Example:

```typescript
describe('Settings validation', () => {
  it('should reject invalid enabledModels', () => {
    const result = validateSettings({
      enabledModels: 'not-an-array' // Wrong type
    });
    expect(result.valid).toBe(false);
  });
});
```

### Integration Tests

- **Required for:** Feature changes affecting multiple components
- **Scope:** Test how components interact (UI + state + IPC)
- **Example:** Add provider → create conversation → model appears

### Manual Testing

- **Always required** before PR submission
- **Follow the checklist in `AGENTS.md` section 16** (if Pi-related)
- **Document what you tested** in the PR description

### Test Running

```bash
# Run all tests
npm test

# Run tests for a specific file
npm test -- Provider.test.ts

# Run with coverage
npm test -- --coverage
```

---

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat:** A new feature
- **fix:** A bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, missing semicolons)
- **refactor:** Code refactoring without feature change
- **perf:** Performance improvements
- **test:** Test additions or updates
- **chore:** Build, CI, dependency updates

### Scope

Optional. Examples: `pi`, `extensions`, `ui`, `settings`, `auth`

### Subject

- Imperative mood ("add" not "added")
- Lowercase
- No period
- <50 characters

### Body

- Explain **what** and **why**, not how
- Wrap at 72 characters
- Optional but recommended for non-trivial changes

### Footer

```
Closes #123
Fixes #456, #789
Breaking-change: describe what broke
```

### Examples

```
feat(ui): add keyboard shortcut for model picker

Allow users to quickly switch models with Cmd+M (macOS) or Ctrl+M (Windows/Linux).
Also shows available models in a popup before selection.

Closes #234

---

fix(pi): resolve settings lock timeout on rapid restart

Cleans up stale settings.json.lock files older than 5 minutes
during app startup to prevent "EACCES" errors.

Closes #521

---

docs: add troubleshooting section to AGENTS.md

Documented common Pi runtime issues and recovery procedures.
Added expected error patterns and debugging steps.

---

refactor(extensions): simplify extension registry loading

No behavior change. Reduces code complexity by consolidating
loading logic into a single function.
```

---

## Before You Submit

### Pre-Submission Checklist

- [ ] Branch is up to date with `main`
- [ ] Code follows project style (run linter/formatter)
- [ ] Tests pass locally (`npm test`)
- [ ] No console errors or warnings
- [ ] Manual testing completed (see relevant checklist)
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] PR description is clear and includes issue number
- [ ] No unrelated changes included
- [ ] No sensitive information (API keys, tokens) in code

### PR Description Template

```markdown
## Description
[What does this PR do?]

## Related Issues
Closes #[issue number]

## Changes Made
- [Change 1]
- [Change 2]

## Testing
- [How did you test this?]
- [What scenarios did you verify?]

## Documentation Updates
- [AGENTS.md] Added troubleshooting section
- [README.md] Updated FAQ

## Breaking Changes
None / [If any, describe]

## Screenshots (if UI change)
[Attach screenshots]
```

### Ready to Submit

1. Push your branch:
   ```bash
   git push origin feat/your-feature
   ```

2. Open PR on GitHub with the description template

3. Wait for CI checks to pass

4. Respond to review feedback

5. Once approved, a maintainer will merge

---

## Questions?

- **GitHub Issues:** Ask in the issue tracker
- **GitHub Discussions:** Start a discussion for broader questions
- **Code example:** Share minimal reproducible code

Thank you for contributing! 🎉
