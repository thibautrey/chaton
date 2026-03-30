/**
 * Database module for CLI - standalone version that doesn't depend on Electron
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let db: Database.Database | null = null;

export function getCliDbPath(): string {
  // Use XDG_CONFIG_HOME or ~/.chatons as the config directory
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const chatonsDir = path.join(configHome, 'chatons');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(chatonsDir)) {
    fs.mkdirSync(chatonsDir, { recursive: true });
  }
  
  return path.join(chatonsDir, 'chaton.sqlite');
}

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getCliDbPath();
  console.error(`Database path: ${dbPath}`);
  
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  
  // Run migrations from the electron/db/migrations directory
  const migrationsDir = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..', '..', '..', '..', 'electron', 'db', 'migrations'
  );
  
  // Also check relative to cwd (for compiled version)
  const cwdMigrationsDir = path.join(process.cwd(), '..', '..', 'electron', 'db', 'migrations');
  const finalMigrationsDir = fs.existsSync(migrationsDir) ? migrationsDir : cwdMigrationsDir;
  
  if (fs.existsSync(finalMigrationsDir)) {
    runMigrations(db, finalMigrationsDir);
  } else {
    console.error(`Warning: Migrations directory not found at ${finalMigrationsDir}`);
    console.error('Database schema may not be initialized.');
  }
  
  return db;
}

function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  
  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));
  
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO _migrations(name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    console.error(`Applied migration: ${file}`);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Types mirroring the electron/db/repos/conversations.ts
export type ConversationTitleSource = 'placeholder' | 'auto-deterministic' | 'auto-ai' | 'manual';

export type DbConversation = {
  id: string;
  project_id: string | null;
  title: string;
  title_source: ConversationTitleSource;
  status: 'active' | 'done' | 'archived';
  is_relevant: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  pi_session_file: string | null;
  model_provider: string | null;
  model_id: string | null;
  thinking_level: string | null;
  last_runtime_error: string | null;
  worktree_path: string | null;
  access_mode: 'secure' | 'open';
  channel_extension_id: string | null;
  hidden_from_sidebar: number;
  memory_injected: number;
  runtime_location: 'local' | 'cloud';
  cloud_runtime_session_id: string | null;
};

// Conversation CRUD operations
export function listConversations(db: Database.Database): DbConversation[] {
  return db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    .all() as DbConversation[];
}

export function findConversationById(db: Database.Database, id: string): DbConversation | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as DbConversation | undefined;
}

export function listConversationsByProjectId(db: Database.Database, projectId: string): DbConversation[] {
  return db
    .prepare('SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC')
    .all(projectId) as DbConversation[];
}

export function insertConversation(
  db: Database.Database,
  params: {
    id: string;
    projectId?: string | null;
    title: string;
    titleSource?: ConversationTitleSource;
    isRelevant?: boolean;
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: string | null;
    worktreePath?: string | null;
    accessMode?: 'secure' | 'open';
    channelExtensionId?: string | null;
    hiddenFromSidebar?: boolean;
    memoryInjected?: boolean;
    runtimeLocation?: 'local' | 'cloud';
    cloudRuntimeSessionId?: string | null;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations(
      id, project_id, title, title_source, status, is_relevant, created_at, updated_at, last_message_at,
      pi_session_file, model_provider, model_id, thinking_level, last_runtime_error, worktree_path, access_mode, channel_extension_id, hidden_from_sidebar, memory_injected, runtime_location, cloud_runtime_session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.id,
    params.projectId ?? null,
    params.title,
    params.titleSource ?? 'placeholder',
    'active',
    params.isRelevant === false ? 0 : 1,
    now,
    now,
    now,
    params.modelProvider ?? null,
    params.modelId ?? null,
    params.thinkingLevel ?? null,
    params.worktreePath ?? null,
    params.accessMode ?? 'secure',
    params.channelExtensionId ?? null,
    params.hiddenFromSidebar === true ? 1 : 0,
    params.memoryInjected === true ? 1 : 0,
    params.runtimeLocation ?? 'local',
    params.cloudRuntimeSessionId ?? null,
  );
}

export function deleteConversationById(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateConversationStatus(
  db: Database.Database,
  id: string,
  status: DbConversation['status'],
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE conversations
       SET status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(status, now, id);
  return result.changes > 0;
}

export function updateConversationTitle(
  db: Database.Database,
  id: string,
  title: string,
  titleSource?: ConversationTitleSource,
): boolean {
  const now = new Date().toISOString();
  const result = titleSource
    ? db
        .prepare(
          `UPDATE conversations
           SET title = ?, title_source = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(title, titleSource, now, id)
    : db
        .prepare(
          `UPDATE conversations
           SET title = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(title, now, id);
  return result.changes > 0;
}

// Project operations (simplified)
export type DbProject = {
  id: string;
  name: string;
  repo_path: string | null;
  created_at: string;
  updated_at: string;
};

export function listProjects(db: Database.Database): DbProject[] {
  return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as DbProject[];
}

export function findProjectById(db: Database.Database, id: string): DbProject | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as DbProject | undefined;
}
