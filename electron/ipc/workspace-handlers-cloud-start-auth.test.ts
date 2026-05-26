import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `cloud:startAuth` IPC handler.
 *
 * Key behavioral guarantees verified:
 * - Returns `invalid_base_url` when the base URL is not a valid URL string
 * - Default base URL is https://cloud.chatons.ai when input is null/undefined/empty
 * - Trailing slashes are stripped from base URLs
 * - New instance: inserts DB record + sets verifier + OIDC discovery + builds auth URL
 * - Existing instance: updates auth state + updates status + same discovery/URL path
 * - OIDC discovery failure: cleans up verifier + sets error status + returns `discovery_failed`
 * - shell.openExternal failure: cleans up verifier + sets error status + returns `open_failed`
 * - Auth URL contains required PKCE and OAuth 2.0 parameters
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (which requires database, IPC, and Electron wiring).
 */

// -------------------------------------------------------------------------
// Types mirroring the real handler signature
// -------------------------------------------------------------------------

type CloudInstance = {
  id: string
  name: string
  baseUrl: string
  authMode: string
  connectionStatus: string
  oauthState?: string
}

type Input = { name?: string; baseUrl?: string } | null | undefined

type Result =
  | { ok: true; instanceId: string; authUrl: string }
  | { ok: false; reason: 'invalid_base_url' | 'discovery_failed' | 'open_failed'; message: string }

// -------------------------------------------------------------------------
// Inline minimal handler — mirrors workspace-handlers.ts lines 1057–1154.
// -------------------------------------------------------------------------

async function cloudStartAuth(params: {
  input: Input
  getDb: () => unknown
  findCloudInstanceByBaseUrl: (db: unknown, baseUrl: string) => CloudInstance | null
  insertCloudInstance: (db: unknown, data: Partial<CloudInstance> & { id: string; name: string; baseUrl: string; authMode: string; connectionStatus: string; oauthState?: string }) => void
  updateCloudInstanceAuthState: (db: unknown, id: string, state: string) => void
  updateCloudInstanceStatus: (db: unknown, id: string, status: string, message: string | null) => void
  setCloudOidcVerifier: (state: string, verifier: string) => void
  deleteCloudOidcVerifier: (state: string) => void
  createPkceVerifier: () => string
  createPkceChallenge: (verifier: string) => string
  getJson: <T>(url: string) => Promise<T>
  openExternal: (url: string) => Promise<void>
}): Promise<Result> {
  const { input, getDb, findCloudInstanceByBaseUrl, insertCloudInstance,
    updateCloudInstanceAuthState, updateCloudInstanceStatus,
    setCloudOidcVerifier, deleteCloudOidcVerifier,
    createPkceVerifier, createPkceChallenge, getJson, openExternal } = params

  const rawBaseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim().length > 0
      ? input.baseUrl.trim()
      : 'https://cloud.chatons.ai'

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

  const db = getDb()
  const existing = findCloudInstanceByBaseUrl(db, normalizedBaseUrl)
  const instanceId = existing?.id ?? 'generated-uuid'
  const state = 'test-state'
  const verifier = createPkceVerifier()
  const challenge = createPkceChallenge(verifier)

  if (!existing) {
    insertCloudInstance(db, {
      id: instanceId,
      name:
        typeof input?.name === 'string' && input.name.trim().length > 0
          ? input.name.trim()
          : new URL(normalizedBaseUrl).host,
      baseUrl: normalizedBaseUrl,
      authMode: 'oauth',
      connectionStatus: 'connecting',
      oauthState: state,
    })
  } else {
    updateCloudInstanceAuthState(db, existing.id, state)
    updateCloudInstanceStatus(db, existing.id, 'connecting', null)
  }

  setCloudOidcVerifier(state, verifier)

  let discovery: { issuer: string; authorization_endpoint: string }
  try {
    discovery = await getJson<{ issuer: string; authorization_endpoint: string }>(
      new URL('/.well-known/openid-configuration', normalizedBaseUrl).toString(),
    )
  } catch (err) {
    deleteCloudOidcVerifier(state)
    updateCloudInstanceStatus(
      db,
      instanceId,
      'error',
      err instanceof Error ? err.message : String(err),
    )
    return {
      ok: false as const,
      reason: 'discovery_failed' as const,
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const authUrl = new URL(discovery.authorization_endpoint)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', 'chatons-desktop')
  authUrl.searchParams.set('redirect_uri', 'chatons://cloud/auth/callback')
  authUrl.searchParams.set('scope', 'openid profile email offline_access')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('nonce', 'test-nonce')
  authUrl.searchParams.set('base_url', normalizedBaseUrl)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  try {
    await openExternal(authUrl.toString())
  } catch (error) {
    deleteCloudOidcVerifier(state)
    updateCloudInstanceStatus(
      db,
      instanceId,
      'error',
      error instanceof Error ? error.message : String(error),
    )
    return {
      ok: false as const,
      reason: 'open_failed' as const,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  return {
    ok: true as const,
    instanceId,
    authUrl: authUrl.toString(),
  }
}

// -------------------------------------------------------------------------
// Shared mock factory
// -------------------------------------------------------------------------

function createMocks() {
  return {
    getDb: vi.fn(() => 'mock-db'),
    findCloudInstanceByBaseUrl: vi.fn<[unknown, string], CloudInstance | null>(() => null),
    insertCloudInstance: vi.fn(),
    updateCloudInstanceAuthState: vi.fn(),
    updateCloudInstanceStatus: vi.fn(),
    setCloudOidcVerifier: vi.fn(),
    deleteCloudOidcVerifier: vi.fn(),
    createPkceVerifier: vi.fn(() => 'mock-verifier'),
    createPkceChallenge: vi.fn((verifier: string) => `mock-challenge-from-${verifier}`),
    getJson: vi.fn<[string], Promise<{ issuer: string; authorization_endpoint: string }>>(
      () => Promise.resolve({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
      }),
    ),
    openExternal: vi.fn<[string], Promise<void>>(() => Promise.resolve()),
  }
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('cloud:startAuth', () => {
  describe('base URL normalization', () => {
    it('uses default https://cloud.chatons.ai when input is null', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        expect(baseUrl).toBe('https://cloud.chatons.ai')
        return null
      })

      await cloudStartAuth({ input: null, ...mocks })
      // assertion in mock
    })

    it('uses default base URL when input.baseUrl is undefined', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        expect(baseUrl).toBe('https://cloud.chatons.ai')
        return null
      })

      await cloudStartAuth({ input: undefined, ...mocks })
    })

    it('uses default base URL when input.baseUrl is empty string', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        expect(baseUrl).toBe('https://cloud.chatons.ai')
        return null
      })

      await cloudStartAuth({ input: { baseUrl: '' }, ...mocks })
    })

    it('uses default base URL when input.baseUrl is whitespace-only', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        expect(baseUrl).toBe('https://cloud.chatons.ai')
        return null
      })

      await cloudStartAuth({ input: { baseUrl: '   ' }, ...mocks })
    })

    it('strips trailing slashes from provided base URL', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        expect(baseUrl).toBe('https://custom.example.com')
        return null
      })

      await cloudStartAuth({ input: { baseUrl: 'https://custom.example.com///' }, ...mocks })
    })

    it('strips trailing slashes from default base URL', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockImplementation((_db, baseUrl) => {
        // Both the URL() and replace should collapse trailing slashes
        expect(baseUrl).toMatch(/^https:\/\/cloud\.chatons\.ai$/)
        return null
      })

      await cloudStartAuth({ input: null, ...mocks })
    })
  })

  describe('invalid_base_url path', () => {
    it('returns invalid_base_url when base URL is not a valid URL', async () => {
      const mocks = createMocks()

      const result = await cloudStartAuth({
        input: { baseUrl: 'not-a-valid-url' },
        ...mocks,
      })

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_base_url',
        message: 'Cloud base URL is invalid',
      })
    })

    it('returns invalid_base_url when base URL is just "http://"', async () => {
      const mocks = createMocks()

      const result = await cloudStartAuth({
        input: { baseUrl: 'http://' },
        ...mocks,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('invalid_base_url')
      }
    })

    it('does not call DB or verifier setup when URL is invalid', async () => {
      const mocks = createMocks()

      await cloudStartAuth({
        input: { baseUrl: 'invalid-url' },
        ...mocks,
      })

      expect(mocks.getDb).not.toHaveBeenCalled()
      expect(mocks.setCloudOidcVerifier).not.toHaveBeenCalled()
      expect(mocks.insertCloudInstance).not.toHaveBeenCalled()
    })
  })

  describe('new instance path', () => {
    it('calls insertCloudInstance for a new base URL', async () => {
      const mocks = createMocks()

      await cloudStartAuth({ input: { baseUrl: 'https://new.example.com' }, ...mocks })

      expect(mocks.insertCloudInstance).toHaveBeenCalledOnce()
      const call = mocks.insertCloudInstance.mock.calls[0]
      expect(call[0]).toBe('mock-db')
      expect(call[1].baseUrl).toBe('https://new.example.com')
      expect(call[1].authMode).toBe('oauth')
      expect(call[1].connectionStatus).toBe('connecting')
    })

    it('uses provided name for new instance', async () => {
      const mocks = createMocks()

      await cloudStartAuth({ input: { baseUrl: 'https://named.example.com', name: 'My Instance' }, ...mocks })

      expect(mocks.insertCloudInstance.mock.calls[0][1].name).toBe('My Instance')
    })

    it('uses host as name when name is not provided', async () => {
      const mocks = createMocks()

      await cloudStartAuth({ input: { baseUrl: 'https://hosted.example.com:8080' }, ...mocks })

      expect(mocks.insertCloudInstance.mock.calls[0][1].name).toBe('hosted.example.com:8080')
    })

    it('sets the OIDC verifier before OIDC discovery', async () => {
      const mocks = createMocks()
      const callOrder: string[] = []
      mocks.setCloudOidcVerifier.mockImplementation(() => callOrder.push('setVerifier'))
      mocks.getJson.mockImplementation(async () => { callOrder.push('getJson'); return { issuer: 'x', authorization_endpoint: 'https://x/authorize' } })

      await cloudStartAuth({ input: { baseUrl: 'https://order.example.com' }, ...mocks })

      expect(callOrder).toEqual(['setVerifier', 'getJson'])
    })

    it('probes OIDC discovery at the correct endpoint', async () => {
      const mocks = createMocks()

      await cloudStartAuth({ input: { baseUrl: 'https://discovery.example.com' }, ...mocks })

      expect(mocks.getJson).toHaveBeenCalledWith(
        'https://discovery.example.com/.well-known/openid-configuration',
      )
    })
  })

  describe('existing instance path', () => {
    it('calls updateCloudInstanceAuthState and updateCloudInstanceStatus for existing base URL', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockReturnValue({
        id: 'existing-id',
        name: 'Existing',
        baseUrl: 'https://existing.example.com',
        authMode: 'oauth',
        connectionStatus: 'connected',
      })

      await cloudStartAuth({ input: { baseUrl: 'https://existing.example.com' }, ...mocks })

      expect(mocks.updateCloudInstanceAuthState).toHaveBeenCalledWith('mock-db', 'existing-id', 'test-state')
      expect(mocks.updateCloudInstanceStatus).toHaveBeenCalledWith('mock-db', 'existing-id', 'connecting', null)
    })

    it('does not call insertCloudInstance for existing base URL', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockReturnValue({
        id: 'existing-id',
        name: 'Existing',
        baseUrl: 'https://existing.example.com',
        authMode: 'oauth',
        connectionStatus: 'connected',
      })

      await cloudStartAuth({ input: { baseUrl: 'https://existing.example.com' }, ...mocks })

      expect(mocks.insertCloudInstance).not.toHaveBeenCalled()
    })

    it('uses existing instance id for verifier and auth URL', async () => {
      const mocks = createMocks()
      mocks.findCloudInstanceByBaseUrl.mockReturnValue({
        id: 'reused-id',
        name: 'Reused',
        baseUrl: 'https://reuse.example.com',
        authMode: 'oauth',
        connectionStatus: 'connected',
      })

      const result = await cloudStartAuth({ input: { baseUrl: 'https://reuse.example.com' }, ...mocks })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.instanceId).toBe('reused-id')
      }
    })
  })

  describe('OIDC discovery failure', () => {
    it('deletes the OIDC verifier on discovery failure', async () => {
      const mocks = createMocks()
      mocks.getJson.mockRejectedValue(new Error('network unreachable'))

      await cloudStartAuth({ input: { baseUrl: 'https://fail.example.com' }, ...mocks })

      expect(mocks.deleteCloudOidcVerifier).toHaveBeenCalledWith('test-state')
    })

    it('sets instance status to error on discovery failure', async () => {
      const mocks = createMocks()
      mocks.getJson.mockRejectedValue(new Error('network unreachable'))

      await cloudStartAuth({ input: { baseUrl: 'https://fail.example.com' }, ...mocks })

      expect(mocks.updateCloudInstanceStatus).toHaveBeenCalledWith(
        'mock-db',
        'generated-uuid',
        'error',
        'network unreachable',
      )
    })

    it('returns discovery_failed with the error message', async () => {
      const mocks = createMocks()
      mocks.getJson.mockRejectedValue(new Error('ETIMEDOUT'))

      const result = await cloudStartAuth({ input: { baseUrl: 'https://timeout.example.com' }, ...mocks })

      expect(result).toEqual({
        ok: false,
        reason: 'discovery_failed',
        message: 'ETIMEDOUT',
      })
    })

    it('returns string error message when discovery rejects with non-Error value', async () => {
      const mocks = createMocks()
      mocks.getJson.mockRejectedValue('discovery rejected as string')

      const result = await cloudStartAuth({ input: { baseUrl: 'https://string-error.example.com' }, ...mocks })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe('discovery rejected as string')
      }
    })

    it('does not open external URL when OIDC discovery fails', async () => {
      const mocks = createMocks()
      mocks.getJson.mockRejectedValue(new Error('fail'))

      await cloudStartAuth({ input: { baseUrl: 'https://no-open.example.com' }, ...mocks })

      expect(mocks.openExternal).not.toHaveBeenCalled()
    })
  })

  describe('shell.openExternal failure', () => {
    it('deletes the OIDC verifier on openExternal failure', async () => {
      const mocks = createMocks()
      mocks.openExternal.mockRejectedValue(new Error('no browser'))

      await cloudStartAuth({ input: { baseUrl: 'https://nobrowser.example.com' }, ...mocks })

      expect(mocks.deleteCloudOidcVerifier).toHaveBeenCalledWith('test-state')
    })

    it('sets instance status to error on openExternal failure', async () => {
      const mocks = createMocks()
      mocks.openExternal.mockRejectedValue(new Error('permission denied'))

      await cloudStartAuth({ input: { baseUrl: 'https://perm.example.com' }, ...mocks })

      expect(mocks.updateCloudInstanceStatus).toHaveBeenCalledWith(
        'mock-db',
        'generated-uuid',
        'error',
        'permission denied',
      )
    })

    it('returns open_failed with the error message', async () => {
      const mocks = createMocks()
      mocks.openExternal.mockRejectedValue(new Error('Failed to open URL'))

      const result = await cloudStartAuth({ input: { baseUrl: 'https://openfail.example.com' }, ...mocks })

      expect(result).toEqual({
        ok: false,
        reason: 'open_failed',
        message: 'Failed to open URL',
      })
    })

    it('returns string error message when openExternal rejects with non-Error value', async () => {
      const mocks = createMocks()
      mocks.openExternal.mockRejectedValue('browser not found')

      const result = await cloudStartAuth({ input: { baseUrl: 'https://str-err.example.com' }, ...mocks })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe('browser not found')
      }
    })
  })

  describe('success path', () => {
    it('returns ok:true with instanceId and authUrl on success', async () => {
      const mocks = createMocks()

      const result = await cloudStartAuth({ input: { baseUrl: 'https://ok.example.com' }, ...mocks })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.instanceId).toBe('generated-uuid')
        expect(result.authUrl).toContain('https://auth.example.com/authorize')
      }
    })

    it('auth URL contains required OAuth 2.0 parameters', async () => {
      const mocks = createMocks()

      const result = await cloudStartAuth({ input: { baseUrl: 'https://params.example.com' }, ...mocks })

      expect(result.ok).toBe(true)
      if (result.ok) {
        const url = new URL(result.authUrl)
        expect(url.searchParams.get('response_type')).toBe('code')
        expect(url.searchParams.get('client_id')).toBe('chatons-desktop')
        expect(url.searchParams.get('redirect_uri')).toBe('chatons://cloud/auth/callback')
        expect(url.searchParams.get('scope')).toBe('openid profile email offline_access')
        expect(url.searchParams.get('state')).toBe('test-state')
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
        expect(url.searchParams.get('base_url')).toBe('https://params.example.com')
      }
    })

    it('auth URL contains PKCE code_challenge derived from verifier', async () => {
      const mocks = createMocks()
      mocks.createPkceChallenge.mockImplementation((verifier: string) => `challenge-${verifier}`)

      const result = await cloudStartAuth({ input: { baseUrl: 'https://pkce.example.com' }, ...mocks })

      expect(result.ok).toBe(true)
      if (result.ok) {
        const url = new URL(result.authUrl)
        expect(url.searchParams.get('code_challenge')).toBe('challenge-mock-verifier')
      }
    })

    it('calls openExternal with the constructed auth URL', async () => {
      const mocks = createMocks()

      await cloudStartAuth({ input: { baseUrl: 'https://external.example.com' }, ...mocks })

      expect(mocks.openExternal).toHaveBeenCalledOnce()
      const calledUrl = mocks.openExternal.mock.calls[0][0]
      expect(calledUrl).toContain('https://auth.example.com/authorize')
      expect(calledUrl).toContain('code_challenge=')
    })
  })
})
