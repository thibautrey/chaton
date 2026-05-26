import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:logout` IPC handler.
 *
 * Tests the branching outcomes:
 *   1. not_connected — no authenticated cloud instance in the DB
 *   2. success — session cleared and {ok: true} returned
 *
 * The handler is replicated inline so tests run without the full module graph.
 * Mirrors electron/ipc/workspace-handlers.ts lines 1327–1335.
 */

type DbCloudInstance = {
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
  endpoints_json: string | null
  created_at: string
  updated_at: string
}

// Inline handler — mirrors the production code at workspace-handlers.ts:1327
async function handleCloudLogout(
  getDb: () => { prepare: (sql: string) => { all: () => DbCloudInstance[]; run: (now: string, id: string) => { changes: number } } },
  listCloudInstances: (db: ReturnType<typeof getDb>) => DbCloudInstance[],
  clearCloudInstanceSession: (db: ReturnType<typeof getDb>, id: string) => boolean,
): Promise<{ ok: true } | { ok: false; reason: 'not_connected' }> {
  const db = getDb()
  const instance = listCloudInstances(db).find((entry) => Boolean(entry.access_token))
  if (!instance) {
    return { ok: false as const, reason: 'not_connected' as const }
  }
  clearCloudInstanceSession(db, instance.id)
  return { ok: true as const }
}

describe('cloud:logout', () => {
  let mockDb: ReturnType<typeof handleCloudLogout extends (db: infer D, ...rest: unknown[]) => unknown ? D : never>
  let listCloudInstancesMock: ReturnType<typeof vi.fn>
  let clearCloudInstanceSessionMock: ReturnType<typeof vi.fn>
  let getDbMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockDb = {} as ReturnType<typeof handleCloudLogout extends (db: infer D, ...rest: unknown[]) => unknown ? D : never>
    listCloudInstancesMock = vi.fn()
    clearCloudInstanceSessionMock = vi.fn()
    getDbMock = vi.fn(() => mockDb)
  })

  // --- not_connected path ---

  describe('not_connected', () => {
    it('returns {ok: false, reason: "not_connected"} when listCloudInstances returns empty array', async () => {
      listCloudInstancesMock.mockReturnValue([])
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: false, reason: 'not_connected' })
    })

    it('returns {ok: false, reason: "not_connected"} when all instances have null access_token', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: null, refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
        { id: 'i2', name: 'B', base_url: 'https://b.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: null, refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: false, reason: 'not_connected' })
    })

    it('returns {ok: false, reason: "not_connected"} when instance has empty string access_token', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: '', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: false, reason: 'not_connected' })
    })

    it('does not call clearCloudInstanceSession when no instance has access_token', async () => {
      listCloudInstancesMock.mockReturnValue([])
      await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(clearCloudInstanceSessionMock).not.toHaveBeenCalled()
    })

    it('calls getDb but skips clearCloudInstanceSession when no instance has access_token', async () => {
      listCloudInstancesMock.mockReturnValue([])
      await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(getDbMock).toHaveBeenCalledTimes(1)
      expect(clearCloudInstanceSessionMock).not.toHaveBeenCalled()
    })
  })

  // --- success path ---

  describe('success', () => {
    it('returns {ok: true} when instance with access_token is found', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: 'tok_abc123', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: true })
    })

    it('returns {ok: true} when first instance has access_token (finds first match)', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: 'a@a.com', access_token: 'tok_abc', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
        { id: 'i2', name: 'B', base_url: 'https://b.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: 'b@b.com', access_token: 'tok_xyz', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: true })
    })

    it('calls clearCloudInstanceSession with the matching instance id', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: null, refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
        { id: 'matched-id', name: 'B', base_url: 'https://b.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: 'tok_active', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
        { id: 'i3', name: 'C', base_url: 'https://c.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: null, refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(clearCloudInstanceSessionMock).toHaveBeenCalledTimes(1)
      expect(clearCloudInstanceSessionMock).toHaveBeenCalledWith(mockDb, 'matched-id')
    })

    it('ignores return value of clearCloudInstanceSession even when false (already disconnected)', async () => {
      listCloudInstancesMock.mockReturnValue([
        { id: 'i1', name: 'A', base_url: 'https://a.com', auth_mode: 'oauth', connection_status: 'connected' as const, last_error: null, oauth_state: null, user_email: null, access_token: 'tok', refresh_token: null, token_expires_at: null, endpoints_json: null, created_at: '', updated_at: '' },
      ])
      clearCloudInstanceSessionMock.mockReturnValue(false)
      const result = await handleCloudLogout(getDbMock, listCloudInstancesMock, clearCloudInstanceSessionMock)
      expect(result).toEqual({ ok: true })
    })
  })
})
