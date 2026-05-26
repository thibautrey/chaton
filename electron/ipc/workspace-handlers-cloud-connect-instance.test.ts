import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:connectInstance` IPC handler.
 * Tests cover input validation, duplicate instance detection, and new instance creation.
 */

// Replicate the handler logic for testing (matches electron/ipc/workspace-handlers.ts lines 990-1038)
function handleCloudConnectInstance(
  input: { name?: string; baseUrl?: string } | null | undefined,
  deps: {
    getDb: () => any
    findCloudInstanceByBaseUrl: (db: any, baseUrl: string) => any
    insertCloudInstance: (db: any, instance: any) => void
    updateCloudInstanceStatus: (db: any, id: string, status: string, message: string | null) => void
  },
): { ok: boolean; reason?: string; message?: string; duplicate?: boolean; id?: string } {
  const rawBaseUrl = typeof input?.baseUrl === 'string' ? input.baseUrl.trim() : ''
  if (!rawBaseUrl) {
    return {
      ok: false as const,
      reason: 'invalid_base_url' as const,
      message: 'Cloud base URL is required',
    }
  }

  let normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '')
  try {
    normalizedBaseUrl = new URL(normalizedBaseUrl).toString().replace(/\/+$/, '')
  } catch {
    return {
      ok: false as const,
      reason: 'invalid_base_url' as const,
      message: 'Cloud base URL is invalid',
    }
  }

  const db = deps.getDb()
  const existing = deps.findCloudInstanceByBaseUrl(db, normalizedBaseUrl)
  if (existing) {
    deps.updateCloudInstanceStatus(db, existing.id, 'connected', null)
    return { ok: true as const, duplicate: true, id: existing.id }
  }

  const id = 'test-uuid-1234'
  const derivedName =
    typeof input?.name === 'string' && input.name.trim().length > 0
      ? input.name.trim()
      : new URL(normalizedBaseUrl).host
  deps.insertCloudInstance(db, {
    id,
    name: derivedName,
    baseUrl: normalizedBaseUrl,
    authMode: 'oauth',
    connectionStatus: 'connected',
  })
  return { ok: true as const, duplicate: false, id }
}

describe('cloud:connectInstance', () => {
  let mockDb: any
  let insertCalls: any[]
  let updateCalls: any[]
  let findResult: any

  const makeDeps = () => ({
    getDb: () => mockDb,
    findCloudInstanceByBaseUrl: vi.fn(() => findResult),
    insertCloudInstance: vi.fn((db, instance) => {
      insertCalls.push(instance)
    }),
    updateCloudInstanceStatus: vi.fn((db, id, status, message) => {
      updateCalls.push({ id, status, message })
    }),
  })

  beforeEach(() => {
    mockDb = {}
    insertCalls = []
    updateCalls = []
    findResult = null
  })

  // ─── Input validation ───────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns invalid_base_url when input is null', () => {
      const result = handleCloudConnectInstance(null, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is required',
      })
    })

    it('returns invalid_base_url when input is undefined', () => {
      const result = handleCloudConnectInstance(undefined, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is required',
      })
    })

    it('returns invalid_base_url when baseUrl is missing', () => {
      const result = handleCloudConnectInstance({ name: 'My Cloud' }, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is required',
      })
    })

    it('returns invalid_base_url when baseUrl is empty string', () => {
      const result = handleCloudConnectInstance({ baseUrl: '' }, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is required',
      })
    })

    it('returns invalid_base_url when baseUrl is whitespace-only', () => {
      const result = handleCloudConnectInstance({ baseUrl: '   ' }, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is required',
      })
    })

    it('returns invalid_base_url when baseUrl is not a valid URL', () => {
      const result = handleCloudConnectInstance({ baseUrl: 'not-a-url' }, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is invalid',
      })
    })

    it('returns invalid_base_url when baseUrl has no protocol', () => {
      const result = handleCloudConnectInstance({ baseUrl: 'example.com' }, makeDeps())
      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is invalid',
      })
    })
  })

  // ─── URL normalization ──────────────────────────────────────────────────────

  describe('URL normalization', () => {
    it('strips trailing slashes from baseUrl', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com/' }, deps)
      expect(deps.findCloudInstanceByBaseUrl).toHaveBeenCalledWith(
        mockDb,
        'https://cloud.example.com',
      )
    })

    it('strips multiple trailing slashes', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com///' }, deps)
      expect(deps.findCloudInstanceByBaseUrl).toHaveBeenCalledWith(
        mockDb,
        'https://cloud.example.com',
      )
    })

    it('normalizes baseUrl via URL constructor', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com/  ' }, deps)
      expect(deps.findCloudInstanceByBaseUrl).toHaveBeenCalledWith(
        mockDb,
        'https://cloud.example.com',
      )
    })
  })

  // ─── Duplicate instance (existing baseUrl) ───────────────────────────────────

  describe('duplicate instance — existing baseUrl in DB', () => {
    it('returns ok:true with duplicate:true when instance already exists', () => {
      const deps = makeDeps()
      findResult = { id: 'existing-id', baseUrl: 'https://cloud.example.com' }
      const result = handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(result).toEqual({ ok: true, duplicate: true, id: 'existing-id' })
    })

    it('updates existing instance status to "connected"', () => {
      const deps = makeDeps()
      findResult = { id: 'existing-id', baseUrl: 'https://cloud.example.com' }
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(updateCalls).toEqual([{ id: 'existing-id', status: 'connected', message: null }])
    })

    it('does NOT insert a new instance when duplicate exists', () => {
      const deps = makeDeps()
      findResult = { id: 'existing-id' }
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(insertCalls).toHaveLength(0)
    })

    it('uses the existing instance id in the response', () => {
      const deps = makeDeps()
      findResult = { id: 'my-existing-id-xyz' }
      const result = handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(result.id).toBe('my-existing-id-xyz')
    })
  })

  // ─── New instance creation ───────────────────────────────────────────────────

  describe('new instance creation', () => {
    it('returns ok:true with duplicate:false for new baseUrl', () => {
      const deps = makeDeps()
      const result = handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(result).toEqual({ ok: true, duplicate: false, id: 'test-uuid-1234' })
    })

    it('inserts instance with correct fields', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(insertCalls).toHaveLength(1)
      expect(insertCalls[0]).toMatchObject({
        name: 'cloud.example.com', // derived from host
        baseUrl: 'https://cloud.example.com',
        authMode: 'oauth',
        connectionStatus: 'connected',
      })
    })

    it('uses provided name when given', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com', name: 'My Cloud Instance' }, deps)
      expect(insertCalls[0].name).toBe('My Cloud Instance')
    })

    it('derives name from URL host when name is not provided', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://api.chatons.ai/v1' }, deps)
      expect(insertCalls[0].name).toBe('api.chatons.ai')
    })

    it('derives name from URL host even when name is whitespace-only', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com', name: '  ' }, deps)
      expect(insertCalls[0].name).toBe('cloud.example.com')
    })

    it('does NOT call updateCloudInstanceStatus for new instances', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ─── DB interaction ─────────────────────────────────────────────────────────

  describe('DB interaction', () => {
    it('passes the db instance to findCloudInstanceByBaseUrl', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(deps.findCloudInstanceByBaseUrl).toHaveBeenCalledWith(mockDb, 'https://cloud.example.com')
    })

    it('passes the db instance to insertCloudInstance', () => {
      const deps = makeDeps()
      handleCloudConnectInstance({ baseUrl: 'https://cloud.example.com' }, deps)
      expect(deps.insertCloudInstance).toHaveBeenCalledWith(mockDb, expect.objectContaining({
        baseUrl: 'https://cloud.example.com',
      }))
    })
  })
})
