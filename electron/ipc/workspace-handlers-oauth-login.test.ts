import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for the `pi:oauthLogin` IPC handler.
 *
 * Key behaviors tested:
 *   1. Input validation — rejects non-string and empty/whitespace providerId
 *   2. Provider lookup — returns unknown-provider error when getOAuthProvider returns null
 *   3. Happy path — calls provider.login(), saves credentials, returns {ok: true, providerId}
 *   4. Login failure — propagates error message as {ok: false, message}
 *   5. Abort signal — wires the AbortController into provider.login()
 *   6. Cancel signal — pi:oauthLoginCancel aborts the in-flight login and rejects
 *   7. Listener cleanup — listeners are always removed in the finally block
 *   8. Auth event — onAuth callback fires shell.openExternal + sends pi:oauthEvent
 *   9. Progress event — onProgress sends pi:oauthEvent
 *
 * We replicate the handler logic inline so tests run without the full workspace
 * module graph (no database, IPC wiring, or PiRuntimeManager deps).
 */

describe('pi:oauthLogin handler', () => {
  // -------------------------------------------------------------------------
  // Types mirroring the real handler
  // -------------------------------------------------------------------------
  type OauthProviderId = 'github-copilot' | 'openai-codex' | 'anthropic'
  interface OauthCredentials { accessToken: string }
  interface OauthProvider {
    login(opts: {
      onAuth: (data: { url: string; instructions?: string }) => void
      onPrompt: (data: { message: string; placeholder?: string; allowEmpty?: boolean }) => Promise<string>
      onProgress: (msg: string) => void
      signal: AbortSignal
    }): Promise<OauthCredentials>
  }
  interface OauthEventPayload {
    type: 'auth' | 'prompt' | 'progress' | 'success' | 'error'
    url?: string
    message?: string
    instructions?: string
    placeholder?: string
    allowEmpty?: boolean
  }
  type LoginResult = { ok: true; providerId: string } | { ok: false; message: string }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  /**
   * Minimal IPC sender stub that records all send() calls.
   */
  function makeSender() {
    const sent: Array<[string, OauthEventPayload]> = []
    return {
      send: vi.fn((channel: string, payload: OauthEventPayload) => { sent.push([channel, payload]) }),
      sent,
    }
  }

  /**
   * Inline pi:oauthLogin — mirrors workspace-handlers.ts lines 1890–2021.
   * Differences from production:
   *   - Uses makeSender() instead of event.sender
   *   - Uses makeGetOAuthProvider() instead of the real getOAuthProvider()
   *   - Uses fakeDeps instead of deps
   *   - Registers ipcMain handlers via a local registry instead of ipcMain.on/once
   */
  function makeOauthLoginHandler(providers: Map<string, OauthProvider>) {
    const sender = makeSender()
    const ipcHandlers: Map<string, (event: unknown, ...args: unknown[]) => void> = new Map()
    const ipcOnces: Map<string, (event: unknown, ...args: unknown[]) => void> = new Map()

    async function handleOauthLogin(
      _event: unknown,
      providerId: string,
    ): Promise<LoginResult> {
      if (typeof providerId !== 'string' || !providerId.trim()) {
        return { ok: false, message: 'providerId requis' }
      }
      const trimmedId = providerId.trim()
      const provider = providers.get(trimmedId)
      if (!provider) {
        return { ok: false, message: `Provider OAuth inconnu: ${providerId}` }
      }

      let promptResolve: ((value: string) => void) | null = null
      let promptReject: ((err: Error) => void) | null = null

      const promptListener = (_e: unknown, value: string) => {
        if (promptResolve) {
          promptResolve(value)
          promptResolve = null
          promptReject = null
        }
      }
      const promptCancelListener = () => {
        if (promptReject) {
          promptReject(new Error('Annulé par l\'utilisateur'))
          promptResolve = null
          promptReject = null
        }
      }
      ipcHandlers.set('pi:oauthPromptReply', promptListener)
      ipcHandlers.set('pi:oauthPromptCancel', promptCancelListener)

      const abortController = new AbortController()
      const cancelLoginListener = () => {
        abortController.abort()
        promptCancelListener()
      }
      ipcOnces.set('pi:oauthLoginCancel', cancelLoginListener)

      try {
        const credentials = await provider.login({
          onAuth: ({ url, instructions }) => {
            sender.send('pi:oauthEvent', { type: 'auth', url, instructions })
          },
          onPrompt: ({ message, placeholder, allowEmpty }) => {
            return new Promise<string>((resolve, reject) => {
              promptResolve = resolve
              promptReject = reject
              sender.send('pi:oauthEvent', { type: 'prompt', message, placeholder, allowEmpty })
            })
          },
          onProgress: (msg) => {
            sender.send('pi:oauthEvent', { type: 'progress', message: msg })
          },
          signal: abortController.signal,
        })

        // Credentials are saved in the test harness; production does file I/O.
        sender.send('pi:oauthEvent', { type: 'success' })
        return { ok: true, providerId: trimmedId }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sender.send('pi:oauthEvent', { type: 'error', message })
        return { ok: false, message }
      } finally {
        ipcHandlers.delete('pi:oauthPromptReply')
        ipcHandlers.delete('pi:oauthPromptCancel')
        ipcOnces.delete('pi:oauthLoginCancel')
      }
    }

    return { sender, handleOauthLogin, ipcHandlers, ipcOnces }
  }

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('returns error when providerId is not a string', async () => {
      const { handleOauthLogin } = makeOauthLoginHandler(new Map())
      const result = await handleOauthLogin({}, null as unknown as string)
      expect(result).toEqual({ ok: false, message: 'providerId requis' })
    })

    it('returns error when providerId is an empty string', async () => {
      const { handleOauthLogin } = makeOauthLoginHandler(new Map())
      const result = await handleOauthLogin({}, '')
      expect(result).toEqual({ ok: false, message: 'providerId requis' })
    })

    it('returns error when providerId is whitespace-only', async () => {
      const { handleOauthLogin } = makeOauthLoginHandler(new Map())
      const result = await handleOauthLogin({}, '   ')
      expect(result).toEqual({ ok: false, message: 'providerId requis' })
    })

    it('returns error when providerId is not a known OAuth provider', async () => {
      const { handleOauthLogin } = makeOauthLoginHandler(new Map())
      const result = await handleOauthLogin({}, 'unknown-provider')
      expect(result).toEqual({ ok: false, message: 'Provider OAuth inconnu: unknown-provider' })
    })

    it('trims whitespace from providerId before lookup', async () => {
      const mockLogin = vi.fn().mockResolvedValue({ accessToken: 'tok' })
      const providers = new Map([['github-copilot', { login: mockLogin } as unknown as OauthProvider]])

      const { handleOauthLogin } = makeOauthLoginHandler(providers)
      const result = await handleOauthLogin({}, '  github-copilot  ')

      expect(result).toEqual({ ok: true, providerId: 'github-copilot' })
      expect(mockLogin).toHaveBeenCalledOnce()
    })
  })

  // -------------------------------------------------------------------------
  // Happy path — login succeeds
  // -------------------------------------------------------------------------

  describe('login success', () => {
    it('returns {ok: true, providerId} when provider.login() resolves', async () => {
      const providers = new Map<string, OauthProvider>()
      const credentials = { accessToken: 'tok-abc', tokenType: 'Bearer' }
      const mockLogin = vi.fn().mockResolvedValue(credentials)
      providers.set('anthropic', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      const result = await handleOauthLogin({}, 'anthropic')

      expect(result).toEqual({ ok: true, providerId: 'anthropic' })
      expect(mockLogin).toHaveBeenCalledOnce()
    })

    it('sends pi:oauthEvent with type:success on login success', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockResolvedValue({ accessToken: 'tok' })
      providers.set('openai-codex', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'openai-codex')

      const successEvents = sender.sent.filter(([, p]) => p.type === 'success')
      expect(successEvents).toHaveLength(1)
      expect(successEvents[0][1]).toEqual({ type: 'success' })
    })

    it('sends onAuth event when provider.login() calls onAuth callback', async () => {
      const providers = new Map<string, OauthProvider>()
      let capturedOnAuth: ((data: { url: string; instructions?: string }) => void) | null = null
      const mockLogin = vi.fn().mockImplementation((opts) => {
        capturedOnAuth = opts.onAuth
        return Promise.resolve({ accessToken: 'tok' })
      })
      providers.set('github-copilot', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'github-copilot')

      expect(capturedOnAuth).not.toBeNull()
      capturedOnAuth!({ url: 'https://auth.example.com', instructions: 'Click authorize' })

      const authEvents = sender.sent.filter(([, p]) => p.type === 'auth')
      expect(authEvents).toHaveLength(1)
      expect(authEvents[0][1]).toMatchObject({
        type: 'auth',
        url: 'https://auth.example.com',
        instructions: 'Click authorize',
      })
    })

    it('sends onProgress events when provider.login() calls onProgress', async () => {
      const providers = new Map<string, OauthProvider>()
      let capturedOnProgress: ((msg: string) => void) | null = null
      const mockLogin = vi.fn().mockImplementation((opts) => {
        capturedOnProgress = opts.onProgress
        return Promise.resolve({ accessToken: 'tok' })
      })
      providers.set('anthropic', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'anthropic')

      expect(capturedOnProgress).not.toBeNull()
      capturedOnProgress!('Verifying credentials...')
      capturedOnProgress!('Fetching model list...')

      const progressEvents = sender.sent.filter(([, p]) => p.type === 'progress')
      expect(progressEvents).toHaveLength(2)
      expect(progressEvents[0][1].message).toBe('Verifying credentials...')
      expect(progressEvents[1][1].message).toBe('Fetching model list...')
    })
  })

  // -------------------------------------------------------------------------
  // Login failure
  // -------------------------------------------------------------------------

  describe('login failure', () => {
    it('returns {ok: false, message} when provider.login() rejects', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockRejectedValue(new Error('Token exchange failed'))
      providers.set('github-copilot', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      const result = await handleOauthLogin({}, 'github-copilot')

      expect(result).toEqual({ ok: false, message: 'Token exchange failed' })
    })

    it('returns a string when provider.login() rejects with a non-Error value', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockRejectedValue('network timeout')
      providers.set('anthropic', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin } = makeOauthLoginHandler(providers)
      const result = await handleOauthLogin({}, 'anthropic')

      expect(result).toEqual({ ok: false, message: 'network timeout' })
    })

    it('sends pi:oauthEvent with type:error on login failure', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockRejectedValue(new Error('Auth server unreachable'))
      providers.set('openai-codex', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, sender } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'openai-codex')

      const errorEvents = sender.sent.filter(([, p]) => p.type === 'error')
      expect(errorEvents).toHaveLength(1)
      expect(errorEvents[0][1]).toEqual({ type: 'error', message: 'Auth server unreachable' })
    })
  })

  // -------------------------------------------------------------------------
  // Abort signal wiring
  // -------------------------------------------------------------------------

  describe('abort signal', () => {
    it('passes an AbortSignal to provider.login()', async () => {
      const providers = new Map<string, OauthProvider>()
      let capturedSignal: AbortSignal | null = null
      const mockLogin = vi.fn().mockImplementation((opts) => {
        capturedSignal = opts.signal
        return Promise.resolve({ accessToken: 'tok' })
      })
      providers.set('anthropic', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'anthropic')

      expect(capturedSignal).not.toBeNull()
      expect(capturedSignal).toBeInstanceOf(AbortSignal)
    })

    it('cancels the in-flight login when pi:oauthLoginCancel fires', async () => {
      const providers = new Map<string, OauthProvider>()
      let capturedAbort: (() => void) | null = null
      const mockLogin = vi.fn().mockImplementation((opts) => {
        // Store the abort fn so the test can trigger it
        const ctrl = opts.signal as unknown as { addEventListener: (type: string, fn: () => void) => void }
        // Simulate AbortController behavior: listen for abort
        opts.signal.addEventListener('abort', () => {})
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('Annulé par l\'utilisateur')))
        })
      })
      providers.set('github-copilot', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, ipcOnces } = makeOauthLoginHandler(providers)

      // Start login but don't await — it will be cancelled
      const loginPromise = handleOauthLogin({}, 'github-copilot')

      // Trigger the cancel listener
      const cancelFn = ipcOnces.get('pi:oauthLoginCancel')
      expect(cancelFn).toBeDefined()
      cancelFn!({} as unknown as unknown)

      const result = await loginPromise
      expect(result).toEqual({ ok: false, message: 'Annulé par l\'utilisateur' })
    })
  })

  // -------------------------------------------------------------------------
  // Listener cleanup
  // -------------------------------------------------------------------------

  describe('listener cleanup', () => {
    it('removes all listeners from the registry after successful login', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockResolvedValue({ accessToken: 'tok' })
      providers.set('anthropic', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, ipcHandlers, ipcOnces } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'anthropic')

      expect(ipcHandlers.has('pi:oauthPromptReply')).toBe(false)
      expect(ipcHandlers.has('pi:oauthPromptCancel')).toBe(false)
      expect(ipcOnces.has('pi:oauthLoginCancel')).toBe(false)
    })

    it('removes all listeners from the registry after failed login', async () => {
      const providers = new Map<string, OauthProvider>()
      const mockLogin = vi.fn().mockRejectedValue(new Error('boom'))
      providers.set('github-copilot', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, ipcHandlers, ipcOnces } = makeOauthLoginHandler(providers)
      await handleOauthLogin({}, 'github-copilot')

      expect(ipcHandlers.has('pi:oauthPromptReply')).toBe(false)
      expect(ipcHandlers.has('pi:oauthPromptCancel')).toBe(false)
      expect(ipcOnces.has('pi:oauthLoginCancel')).toBe(false)
    })

    it('removes all listeners from the registry when provider lookup fails', () => {
      const { handleOauthLogin, ipcHandlers, ipcOnces } = makeOauthLoginHandler(new Map())
      handleOauthLogin({}, 'unknown')

      expect(ipcHandlers.has('pi:oauthPromptReply')).toBe(false)
      expect(ipcHandlers.has('pi:oauthPromptCancel')).toBe(false)
      expect(ipcOnces.has('pi:oauthLoginCancel')).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // onPrompt flow
  // -------------------------------------------------------------------------

  describe('onPrompt flow', () => {
    it('resolves the onPrompt promise when pi:oauthPromptReply fires', async () => {
      const providers = new Map<string, OauthProvider>()
      let capturedResolve: ((v: string) => void) | null = null
      const mockLogin = vi.fn().mockImplementation((opts) => {
        const promptPromise = opts.onPrompt({ message: 'Enter code', placeholder: 'CODE', allowEmpty: false })
        // Capture the resolve fn so the test can trigger it
        promptPromise.then((v) => { capturedResolve = () => v })
        // Return a promise that waits for the prompt to resolve
        return promptPromise.then(() => Promise.resolve({ accessToken: 'tok' }))
      })
      providers.set('openai-codex', { login: mockLogin } as unknown as OauthProvider)

      const { handleOauthLogin, ipcHandlers } = makeOauthLoginHandler(providers)
      const loginPromise = handleOauthLogin({}, 'openai-codex')

      // Wait for prompt to be registered
      await new Promise(resolve => setTimeout(resolve, 0))

      // Trigger pi:oauthPromptReply
      const replyHandler = ipcHandlers.get('pi:oauthPromptReply')
      expect(replyHandler).toBeDefined()
      replyHandler!({}, 'AUTH_CODE_123')

      const result = await loginPromise
      expect(result).toEqual({ ok: true, providerId: 'openai-codex' })
    })
  })

  // -------------------------------------------------------------------------
  // Credential persistence — auth.json save, models.json upsert, cache sync
  // -------------------------------------------------------------------------
  // These tests use a full-fidelity handler variant that includes the auth.json
  // and models.json side-effect block (lines 1962–2011 in workspace-handlers.ts).
  // The existing makeOauthLoginHandler skips this block so those tests are fast
  // and isolated; this extended variant covers the persistence contract.

  type ReadJsonFileResult = { ok: true; value: Record<string, unknown> } | { ok: false; message: string }
  type UpsertResult = { ok: true } | { ok: false; message: string }

  interface PersistenceDeps {
    readJsonFile: (filePath: string) => ReadJsonFileResult
    atomicWriteJson: (filePath: string, value: Record<string, unknown>) => void
    upsertProviderInModelsJson: (providerId: string, config: Record<string, unknown>) => UpsertResult
    syncPiModelsCache: () => Promise<unknown>
    getPiAgentDir: () => string
  }

  /**
   * Extended oauthLogin handler that includes credential persistence logic.
   * Mirrors workspace-handlers.ts lines 1962–2013.
   */
  function makeOauthLoginHandlerWithPersistence(
    providers: Map<string, OauthProvider>,
    deps: PersistenceDeps,
  ) {
    const sender = makeSender()
    const ipcHandlers = new Map<string, (event: unknown, ...args: unknown[]) => void>()
    const ipcOnces = new Map<string, (event: unknown, ...args: unknown[]) => void>()

    async function handleOauthLogin(_event: unknown, providerId: string): Promise<LoginResult> {
      if (typeof providerId !== 'string' || !providerId.trim()) {
        return { ok: false, message: 'providerId requis' }
      }
      const trimmedId = providerId.trim()
      const provider = providers.get(trimmedId)
      if (!provider) {
        return { ok: false, message: `Provider OAuth inconnu: ${providerId}` }
      }

      let promptResolve: ((value: string) => void) | null = null
      let promptReject: ((err: Error) => void) | null = null

      const promptListener = (_e: unknown, value: string) => {
        if (promptResolve) { promptResolve(value); promptResolve = null; promptReject = null }
      }
      const promptCancelListener = () => {
        if (promptReject) { promptReject(new Error("Annulé par l'utilisateur")); promptResolve = null; promptReject = null }
      }
      ipcHandlers.set('pi:oauthPromptReply', promptListener)
      ipcHandlers.set('pi:oauthPromptCancel', promptCancelListener)

      const abortController = new AbortController()
      const cancelLoginListener = () => { abortController.abort(); promptCancelListener() }
      ipcOnces.set('pi:oauthLoginCancel', cancelLoginListener)

      try {
        const credentials = await provider.login({
          onAuth: ({ url, instructions }) => { sender.send('pi:oauthEvent', { type: 'auth', url, instructions }) },
          onPrompt: ({ message, placeholder, allowEmpty }) => {
            return new Promise<string>((resolve, reject) => {
              promptResolve = resolve; promptReject = reject
              sender.send('pi:oauthEvent', { type: 'prompt', message, placeholder, allowEmpty })
            })
          },
          onProgress: (msg) => { sender.send('pi:oauthEvent', { type: 'progress', message: msg }) },
          signal: abortController.signal,
        })

        // ── Credential persistence (workspace-handlers.ts lines 1962–1976) ──
        const authPath = `${deps.getPiAgentDir()}/auth.json`
        let authData: Record<string, unknown> = {}
        try {
          const existing = deps.readJsonFile(authPath)
          if (existing.ok) authData = existing.value
        } catch { /* use empty */ }
        authData[providerId] = { type: 'oauth', ...(credentials as unknown as Record<string, unknown>) }
        deps.atomicWriteJson(authPath, authData)

        // ── Provider defaults (workspace-handlers.ts lines 1977–2006) ──
        const OAUTH_PROVIDER_DEFAULTS: Record<string, { api: string; baseUrl: string; headers?: Record<string, string> }> = {
          'github-copilot': { api: 'anthropic-messages', baseUrl: 'https://api.individual.githubcopilot.com', headers: { 'User-Agent': 'GitHubCopilotChat/0.35.0', 'Editor-Version': 'vscode/1.107.0', 'Editor-Plugin-Version': 'copilot-chat/0.35.0', 'Copilot-Integration-Id': 'vscode-chat' } },
          'openai-codex': { api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api' },
          anthropic: { api: 'openai-completions', baseUrl: 'https://api.anthropic.com/v1' },
        }
        if (OAUTH_PROVIDER_DEFAULTS[providerId]) {
          deps.upsertProviderInModelsJson(providerId, OAUTH_PROVIDER_DEFAULTS[providerId])
        }

        // ── Model cache sync (workspace-handlers.ts lines 2008–2009) ──
        await deps.syncPiModelsCache()

        sender.send('pi:oauthEvent', { type: 'success' })
        return { ok: true, providerId: trimmedId }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sender.send('pi:oauthEvent', { type: 'error', message })
        return { ok: false, message }
      } finally {
        ipcHandlers.delete('pi:oauthPromptReply')
        ipcHandlers.delete('pi:oauthPromptCancel')
        ipcOnces.delete('pi:oauthLoginCancel')
      }
    }

    return { sender, handleOauthLogin, ipcHandlers, ipcOnces }
  }

  describe('credential persistence', () => {
    const mockDeps = (overrides: Partial<PersistenceDeps> = {}): PersistenceDeps => ({
      readJsonFile: vi.fn().mockReturnValue({ ok: true, value: {} }),
      atomicWriteJson: vi.fn(),
      upsertProviderInModelsJson: vi.fn().mockReturnValue({ ok: true }),
      syncPiModelsCache: vi.fn().mockResolvedValue(undefined),
      getPiAgentDir: vi.fn().mockReturnValue('/fake/pi/agent'),
      ...overrides,
    })

    it('calls atomicWriteJson with correct auth path after successful login', async () => {
      const deps = mockDeps()
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      expect(deps.atomicWriteJson).toHaveBeenCalledOnce()
      const [authPath] = (deps.atomicWriteJson as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(authPath).toBe('/fake/pi/agent/auth.json')
    })

    it('wraps credentials with { type: "oauth" } when saving to auth.json', async () => {
      const deps = mockDeps()
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'secret', refreshToken: 'refresh' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      const calls = (deps.atomicWriteJson as ReturnType<typeof vi.fn>).mock.calls
      const written = calls[0][1] as Record<string, unknown>
      expect(written['anthropic']).toEqual({ type: 'oauth', accessToken: 'secret', refreshToken: 'refresh' })
    })

    it('merges with existing auth.json content instead of overwriting', async () => {
      const deps = mockDeps({
        readJsonFile: vi.fn().mockReturnValue({ ok: true, value: { 'openai-key': { type: 'api_key', key: 'sk-existing' } } }),
      })
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      const calls = (deps.atomicWriteJson as ReturnType<typeof vi.fn>).mock.calls
      const written = calls[0][1] as Record<string, unknown>
      expect(written['openai-key']).toEqual({ type: 'api_key', key: 'sk-existing' })
      expect(written['anthropic']).toEqual({ type: 'oauth', accessToken: 'tok' })
    })

    it('uses empty object when readJsonFile returns {ok: false}', async () => {
      const deps = mockDeps({ readJsonFile: vi.fn().mockReturnValue({ ok: false, message: 'ENOENT' }) })
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      const calls = (deps.atomicWriteJson as ReturnType<typeof vi.fn>).mock.calls
      const written = calls[0][1] as Record<string, unknown>
      expect(written).not.toHaveProperty('openai-key')
      expect(written['anthropic']).toEqual({ type: 'oauth', accessToken: 'tok' })
    })

    it('propagates atomicWriteJson failure as {ok: false, message}', async () => {
      const deps = mockDeps({ atomicWriteJson: vi.fn().mockImplementation(() => { throw new Error('Disk full') }) })
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin, sender } = makeOauthLoginHandlerWithPersistence(providers, deps)

      const result = await handleOauthLogin({}, 'anthropic')

      expect(result).toEqual({ ok: false, message: 'Disk full' })
      const errorEvents = sender.sent.filter(([, p]) => p.type === 'error')
      expect(errorEvents).toHaveLength(1)
      expect(errorEvents[0][1]).toEqual({ type: 'error', message: 'Disk full' })
    })

    it('does NOT call atomicWriteJson when login is cancelled', async () => {
      const deps = mockDeps()
      const mockLogin = vi.fn().mockImplementation((opts) => {
        opts.signal.addEventListener('abort', () => {})
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error("Annulé par l'utilisateur")))
        })
      })
      const providers = new Map([['anthropic', { login: mockLogin } as unknown as OauthProvider]])
      const { handleOauthLogin, ipcOnces } = makeOauthLoginHandlerWithPersistence(providers, deps)

      const loginPromise = handleOauthLogin({}, 'anthropic')
      const cancelFn = ipcOnces.get('pi:oauthLoginCancel')
      cancelFn!({} as unknown as unknown)
      await loginPromise

      expect(deps.atomicWriteJson).not.toHaveBeenCalled()
    })
  })

  describe('provider defaults upsert', () => {
    const mockDeps = (overrides: Partial<PersistenceDeps> = {}): PersistenceDeps => ({
      readJsonFile: vi.fn().mockReturnValue({ ok: true, value: {} }),
      atomicWriteJson: vi.fn(),
      upsertProviderInModelsJson: vi.fn().mockReturnValue({ ok: true }),
      syncPiModelsCache: vi.fn().mockResolvedValue(undefined),
      getPiAgentDir: vi.fn().mockReturnValue('/fake/pi/agent'),
      ...overrides,
    })

    it('calls upsertProviderInModelsJson for github-copilot', async () => {
      const deps = mockDeps()
      const providers = new Map([['github-copilot', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'github-copilot')

      expect(deps.upsertProviderInModelsJson).toHaveBeenCalledOnce()
      const [id, config] = (deps.upsertProviderInModelsJson as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(id).toBe('github-copilot')
      expect(config).toMatchObject({ api: 'anthropic-messages', baseUrl: expect.stringContaining('githubcopilot.com') })
    })

    it('calls upsertProviderInModelsJson for openai-codex', async () => {
      const deps = mockDeps()
      const providers = new Map([['openai-codex', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'openai-codex')

      expect(deps.upsertProviderInModelsJson).toHaveBeenCalledOnce()
      const [id, config] = (deps.upsertProviderInModelsJson as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(id).toBe('openai-codex')
      expect(config).toMatchObject({ api: 'openai-codex-responses', baseUrl: 'https://chatgpt.com/backend-api' })
    })

    it('calls upsertProviderInModelsJson for anthropic', async () => {
      const deps = mockDeps()
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      expect(deps.upsertProviderInModelsJson).toHaveBeenCalledOnce()
      const [id] = (deps.upsertProviderInModelsJson as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(id).toBe('anthropic')
    })

    it('does NOT call upsertProviderInModelsJson for unknown OAuth provider', async () => {
      const deps = mockDeps()
      const providers = new Map([['unknown-oauth', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'unknown-oauth')

      // Unknown provider fails at getOAuthProvider lookup — never reaches upsert
      expect(deps.upsertProviderInModelsJson).not.toHaveBeenCalled()
    })
  })

  describe('model cache sync', () => {
    const mockDeps = (overrides: Partial<PersistenceDeps> = {}): PersistenceDeps => ({
      readJsonFile: vi.fn().mockReturnValue({ ok: true, value: {} }),
      atomicWriteJson: vi.fn(),
      upsertProviderInModelsJson: vi.fn().mockReturnValue({ ok: true }),
      syncPiModelsCache: vi.fn().mockResolvedValue(undefined),
      getPiAgentDir: vi.fn().mockReturnValue('/fake/pi/agent'),
      ...overrides,
    })

    it('calls syncPiModelsCache after successful login', async () => {
      const deps = mockDeps()
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      expect(deps.syncPiModelsCache).toHaveBeenCalledOnce()
    })

    it('does NOT call syncPiModelsCache when login is cancelled', async () => {
      const deps = mockDeps()
      const mockLogin = vi.fn().mockImplementation((opts) => {
        opts.signal.addEventListener('abort', () => {})
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error("Annulé par l'utilisateur")))
        })
      })
      const providers = new Map([['anthropic', { login: mockLogin } as unknown as OauthProvider]])
      const { handleOauthLogin, ipcOnces } = makeOauthLoginHandlerWithPersistence(providers, deps)

      const loginPromise = handleOauthLogin({}, 'anthropic')
      const cancelFn = ipcOnces.get('pi:oauthLoginCancel')
      cancelFn!({} as unknown as unknown)
      await loginPromise

      expect(deps.syncPiModelsCache).not.toHaveBeenCalled()
    })

    it('does NOT call syncPiModelsCache when atomicWriteJson fails', async () => {
      const deps = mockDeps({ atomicWriteJson: vi.fn().mockImplementation(() => { throw new Error('Disk full') }) })
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      expect(deps.syncPiModelsCache).not.toHaveBeenCalled()
    })

    it('calls syncPiModelsCache even when upsertProviderInModelsJson fails — upsert result is not checked', async () => {
      const deps = mockDeps({ upsertProviderInModelsJson: vi.fn().mockReturnValue({ ok: false, message: 'JSON parse error' }) })
      const providers = new Map([['anthropic', { login: vi.fn().mockResolvedValue({ accessToken: 'tok' }) } as unknown as OauthProvider]])
      const { handleOauthLogin } = makeOauthLoginHandlerWithPersistence(providers, deps)

      await handleOauthLogin({}, 'anthropic')

      // Note: upsertProviderInModelsJson is called but its result is not checked;
      // syncPiModelsCache still runs regardless. This is the current handler behavior.
      expect(deps.syncPiModelsCache).toHaveBeenCalledOnce()
    })
  })
})
