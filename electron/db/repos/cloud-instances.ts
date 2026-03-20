import type Database from 'better-sqlite3'

export type DbCloudInstance = {
  id: string
  name: string
  base_url: string
  auth_mode: 'oauth'
  connection_status: 'connected' | 'connecting' | 'disconnected' | 'error'
  last_error: string | null
  oauth_state: string | null
  user_email: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
}

export function listCloudInstances(db: Database.Database): DbCloudInstance[] {
  return db.prepare('SELECT * FROM cloud_instances ORDER BY updated_at DESC').all() as DbCloudInstance[]
}

export function findCloudInstanceById(db: Database.Database, id: string): DbCloudInstance | undefined {
  return db.prepare('SELECT * FROM cloud_instances WHERE id = ?').get(id) as DbCloudInstance | undefined
}

export function findCloudInstanceByBaseUrl(db: Database.Database, baseUrl: string): DbCloudInstance | undefined {
  return db.prepare('SELECT * FROM cloud_instances WHERE base_url = ?').get(baseUrl) as DbCloudInstance | undefined
}

export function insertCloudInstance(
  db: Database.Database,
  params: {
    id: string
    name: string
    baseUrl: string
    authMode?: 'oauth'
    connectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'error'
    lastError?: string | null
    oauthState?: string | null
    userEmail?: string | null
    accessToken?: string | null
    refreshToken?: string | null
    tokenExpiresAt?: string | null
  },
): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO cloud_instances(
      id, name, base_url, auth_mode, connection_status, last_error, oauth_state, user_email,
      access_token, refresh_token, token_expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.name,
    params.baseUrl,
    params.authMode ?? 'oauth',
    params.connectionStatus ?? 'connected',
    params.lastError ?? null,
    params.oauthState ?? null,
    params.userEmail ?? null,
    params.accessToken ?? null,
    params.refreshToken ?? null,
    params.tokenExpiresAt ?? null,
    now,
    now,
  )
}

export function findCloudInstanceByOauthState(db: Database.Database, state: string): DbCloudInstance | undefined {
  return db.prepare('SELECT * FROM cloud_instances WHERE oauth_state = ?').get(state) as DbCloudInstance | undefined
}

export function updateCloudInstanceStatus(
  db: Database.Database,
  id: string,
  status: 'connected' | 'connecting' | 'disconnected' | 'error',
  lastError?: string | null,
): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE cloud_instances
       SET connection_status = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(status, lastError ?? null, now, id)
  return result.changes > 0
}

export function updateCloudInstanceAuthState(
  db: Database.Database,
  id: string,
  oauthState: string | null,
): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE cloud_instances
       SET oauth_state = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(oauthState, now, id)
  return result.changes > 0
}

export function saveCloudInstanceSession(
  db: Database.Database,
  id: string,
  session: {
    userEmail: string | null
    accessToken: string | null
    refreshToken: string | null
    tokenExpiresAt: string | null
    oauthState?: string | null
    connectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'error'
    lastError?: string | null
  },
): boolean {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `UPDATE cloud_instances
       SET
         user_email = ?,
         access_token = ?,
         refresh_token = ?,
         token_expires_at = ?,
         oauth_state = ?,
         connection_status = ?,
         last_error = ?,
         updated_at = ?
       WHERE id = ?`,
    )
    .run(
      session.userEmail,
      session.accessToken,
      session.refreshToken,
      session.tokenExpiresAt,
      session.oauthState ?? null,
      session.connectionStatus ?? 'connected',
      session.lastError ?? null,
      now,
      id,
    )
  return result.changes > 0
}
