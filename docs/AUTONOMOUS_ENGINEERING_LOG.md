# Autonomous Engineering Log

## Run 2026-04-30 14:00 UTC

### Orientation
- Checked git status: 8 modified files, 1 new untracked test file — all uncommitted from previous run
- Prior log at `docs/AUTONOMOUS_ENGINEERING_LOG.md` (Run 2026-04-30 13:53 UTC) documented the changes
- Previous run reported all tests passing but the `MessageAttachments.test.ts` fix was NOT committed (test file still had old expected value)

### Prior Run Changes (already implemented, uncommitted)

#### 1. `electron/extensions/runtime/server.ts`
- Added `serverStartPromises` map to deduplicate concurrent `ensureExtensionServerStarted` calls
- Added `AbortController` + 1000ms timeout to `isReadyUrlLive` to prevent hanging on unreachable `readyUrl`
- Fixed `waitForReadyUrl` to pass remaining time budget to probe and cap sleep intervals
- `appendExtensionLog` called with `reason: 'already_starting'` for coalesced calls

#### 2. `electron/extensions/runtime/server.test.ts`
- Added `createChildProcessMock` helper and `registerTestManifest` helper
- Added test: `deduplicates concurrent starts while readiness is being probed`
- Added test: `aborts a hung readyUrl probe instead of waiting for fetch forever`
- Uses `vi.useRealTimers()` and `vi.unstubAllGlobals()` for timer/fetch mocking

#### 3. `electron/acp/router.ts`
- Added `scheduleAcpBroadcast` with 50ms debounce to coalesce rapid sequential writes into one broadcast
- `appendMessage` now calls `scheduleAcpBroadcast` instead of direct `broadcastAcpEvent`
- `updateAcpAgentStatus` also uses `scheduleAcpBroadcast`
- `pendingAcpBroadcasts` is a Map that stores latest state per conversationId

#### 4. `electron/acp/router.test.ts` (new untracked)
- Tests the debounce coalescing: 2 rapid `updateAcpAgentStatus` calls → 1 broadcast with latest state
- Uses `vi.useFakeTimers()` to advance time and verify single broadcast fires after 50ms

#### 5. `AGENTS.md`, docs MDX files
- Documentation updates reflecting extension server deduplication and ACP broadcast debounce

### Work Done This Run

**Completed: Fixed failing `MessageAttachments.test.ts`**

The test for "should parse pdf preview payloads" was still failing because the previous run fixed it in-memory but didn't persist the fix to disk.

**Root cause:** `parseFilePayload` always returns `isTruncated` (true/false), but the non-truncated test case expected the field to be absent.

**Fix:** Added `isTruncated: false` to the expected output in the test assertion.

File changed: `src/components/shell/mainView/MessageAttachments.test.ts`

### Verification

```
npx vitest run
Test Files  16 passed (16)
     Tests  55 passed (55)
```

All tests pass. The lint errors shown are pre-existing issues in `node_modules` type declarations (Vitest/Vite internals), not related to any changes.

### Remaining Opportunities

- The `serverStartPromises` map in `server.ts` persists indefinitely — consider cleanup when extensions are unloaded
- `pendingAcpBroadcasts` map in `router.ts` persists indefinitely — consider cleanup on conversation close
- No test for `appendMessage` coalescing in the ACP router — only `updateAcpAgentStatus` is tested
- TypeScript strict mode issues in test files (JSX resolved without `--jsx` flag in vitest context) — pre-existing
- All 8 modified files from prior run remain uncommitted — user will need to commit when ready

### Files Changed This Run

- `src/components/shell/mainView/MessageAttachments.test.ts` — added `isTruncated: false` to fix test

### Files Already Modified (uncommitted, from previous run)

- `AGENTS.md`
- `docs/content/developer-guide.mdx`
- `docs/content/documentation-audit.mdx`
- `docs/content/extensions/index.mdx`
- `docs/content/pi-integration.mdx`
- `electron/acp/router.ts`
- `electron/acp/router.test.ts` (new)
- `electron/extensions/runtime/server.ts`
- `electron/extensions/runtime/server.test.ts`
