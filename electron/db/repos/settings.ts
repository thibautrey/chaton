import type Database from 'better-sqlite3'
import type { Rectangle } from 'electron';

export type DbSidebarSettings = {
  organizeBy: 'project' | 'chronological'
  sortBy: 'created' | 'updated'
  show: 'all' | 'relevant'
  showAssistantStats: boolean
  searchQuery: string
  isSearchVisible: boolean
  collapsedProjectIds: string[]
  sidebarWidth: number
  defaultBehaviorPrompt: string
  hasCompletedOnboarding: boolean
  allowAnonymousTelemetry: boolean
  telemetryConsentAnswered: boolean
  anonymousInstallId: string | null
}

export type DbAppSettings = {
  launchAtStartup: boolean
  startMinimized: boolean
  shortcuts?: Array<{
    id: string
    scope: 'foreground' | 'global'
    accelerator: string
    actionId: string
    enabled: boolean
  }>
}

export type DbWindowBounds = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>

const DEFAULT_SETTINGS: DbSidebarSettings = {
  organizeBy: 'project',
  sortBy: 'updated',
  show: 'all',
  showAssistantStats: false,
  searchQuery: '',
  isSearchVisible: false,
  collapsedProjectIds: [],
  sidebarWidth: 320,
  hasCompletedOnboarding: false,
  allowAnonymousTelemetry: false,
  telemetryConsentAnswered: false,
  anonymousInstallId: null,
  defaultBehaviorPrompt: `When searching for text or files, prefer using \`rg\` or \`rg --files\` respectively because \`rg\` is much faster than alternatives like \`grep\`. (If the \`rg\` command is not found, then use alternatives.)
## Editing constraints
- Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.
- Add succinct code comments that explain what is going on if code is not self-explanatory. You should not add comments like "Assigns the value to the variable", but a brief comment might be useful ahead of a complex code block that the user would otherwise have to spend time parsing out. Usage of these comments should be rare.
- Try to use apply_patch for single file edits, but it is fine to explore other options to make the edit if it does not work well. Do not use apply_patch for changes that are auto-generated (i.e. generating package.json or running a lint or format command like gofmt) or when scripting is more efficient (such as search and replacing a string across a codebase).
- You may be in a dirty git worktree.
  * NEVER revert existing changes you did not make unless explicitly requested, since these changes were made by the user.
  * If asked to make a commit or code edits and there are unrelated changes to your work or changes that you didn't make in those files, don't revert those changes.
  * If the changes are in files you've touched recently, you should read carefully and understand how you can work with the changes rather than reverting them.
  * If the changes are in unrelated files, just ignore them and don't revert them.
- Do not amend a commit unless explicitly requested to do so.
- While you are working, you might notice unexpected changes that you didn't make. If this happens, STOP IMMEDIATELY and ask the user how they would like to proceed.
- **NEVER** use destructive commands like \`git reset --hard\` or \`git checkout --\` unless specifically requested or approved by the user.
## Special user requests
- If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as \`date\`), you should do so.
- If the user asks for a "review", default to a code review mindset: prioritise identifying bugs, risks, behavioural regressions, and missing tests. Findings must be the primary focus of the response - keep summaries or overviews brief and only after enumerating the issues. Present findings first (ordered by severity with file/line references), follow with open questions or assumptions, and offer a change-summary only as a secondary detail. If no findings are discovered, state that explicitly and mention any residual risks or testing gaps.
  * Each reference should have a stand alone path. Even if it's the same file.
  * Do not use URIs like file://, vscode://, or https://.
  * Do not provide range of lines
  * Examples: src/app.ts, src/app.ts:42, b/server/index.js#L10, C:\\repo\\project\\main.rs:12:5
<permissions instructions>
Approval policy is currently never. Do not provide the \`sandbox_permissions\` for any reason, commands will be rejected.`,
}

const DEFAULT_WINDOW_BOUNDS: DbWindowBounds = {
  x: 0,
  y: 0,
  width: 1500,
  height: 980,
}

export function getSidebarSettings(db: Database.Database): DbSidebarSettings {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('sidebar') as { value: string } | undefined
  if (!row) {
    // Persist default settings on first launch
    saveSidebarSettings(db, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }

  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<DbSidebarSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSidebarSettings(db: Database.Database, settings: DbSidebarSettings) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('sidebar', JSON.stringify(settings), now)
}

export function getWindowBounds(db: Database.Database): DbWindowBounds {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('window_bounds') as { value: string } | undefined
  if (!row) {
    return DEFAULT_WINDOW_BOUNDS
  }

  try {
    return { ...DEFAULT_WINDOW_BOUNDS, ...(JSON.parse(row.value) as Partial<DbWindowBounds>) }
  } catch {
    return DEFAULT_WINDOW_BOUNDS
  }
}

export function saveWindowBounds(db: Database.Database, bounds: DbWindowBounds) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('window_bounds', JSON.stringify(bounds), now)
}

export function getLanguagePreference(db: Database.Database): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('language') as { value: string } | undefined
  return row?.value ?? 'fr'
}

export function saveLanguagePreference(db: Database.Database, language: string) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('language', language, now)
}

const DEFAULT_APP_SETTINGS: DbAppSettings = {
  launchAtStartup: false,
  startMinimized: false,
}

export function getAppSettings(db: Database.Database): DbAppSettings {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('app_settings') as { value: string } | undefined
  if (!row) {
    // Persist default settings on first launch
    saveAppSettings(db, DEFAULT_APP_SETTINGS)
    return DEFAULT_APP_SETTINGS
  }

  try {
    return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(row.value) as Partial<DbAppSettings>) }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveAppSettings(db: Database.Database, settings: DbAppSettings) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run('app_settings', JSON.stringify(settings), now)
}
