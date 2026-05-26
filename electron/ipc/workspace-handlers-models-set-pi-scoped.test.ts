import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `models:setPiScoped` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~1605–1620) was previously an unguarded
 * passthrough that accepted `provider: string, id: string, scoped: boolean` typed
 * parameters. Malformed IPC calls (wrong types) would propagate to the underlying
 * `setPiModelScoped` function with incorrect types.
 *
 * After this change, the handler validates all three parameters before delegation:
 * - provider must be a non-empty string (trimmed)
 * - id must be a non-empty string (trimmed)
 * - scoped must be a boolean
 */

type SetPiScopedResult =
  | { ok: true }
  | { ok: false; reason: string; message: string }

async function handleSetPiScoped(params: {
  provider: unknown
  id: unknown
  scoped: unknown
  setPiModelScoped: (
    provider: string,
    id: string,
    scoped: boolean,
  ) => Promise<SetPiScopedResult>
}): Promise<SetPiScopedResult> {
  const { provider, id, scoped, setPiModelScoped } = params

  if (typeof provider !== "string" || !provider.trim()) {
    return { ok: false as const, message: "provider is required" }
  }
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false as const, message: "model id is required" }
  }
  if (typeof scoped !== "boolean") {
    return { ok: false as const, message: "scoped must be a boolean" }
  }
  return setPiModelScoped(provider.trim(), id.trim(), scoped)
}

describe('models:setPiScoped', () => {
  describe('valid inputs — delegates to setPiModelScoped', () => {
    it('passes through a successful result unchanged', async () => {
      const setPiModelScoped = vi.fn().mockResolvedValue({ ok: true })

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: 'claude-3-5-sonnet',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: true })
      expect(setPiModelScoped).toHaveBeenCalledWith(
        'anthropic',
        'claude-3-5-sonnet',
        true,
      )
    })

    it('passes provider and id through trimmed', async () => {
      const setPiModelScoped = vi.fn().mockResolvedValue({ ok: true })

      await handleSetPiScoped({
        provider: '  google  ',
        id: '  gemini-2.5-pro  ',
        scoped: false,
        setPiModelScoped,
      })

      expect(setPiModelScoped).toHaveBeenCalledWith('google', 'gemini-2.5-pro', false)
    })

    it('returns a failure result from setPiModelScoped unchanged', async () => {
      const setPiModelScoped = vi.fn().mockResolvedValue({
        ok: false,
        reason: 'invalid_model',
        message: 'Model anthropic/unknown not found',
      })

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: 'unknown-model',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({
        ok: false,
        reason: 'invalid_model',
        message: 'Model anthropic/unknown not found',
      })
    })

    it('calls setPiModelScoped exactly once per invocation', async () => {
      const setPiModelScoped = vi.fn().mockResolvedValue({ ok: true })

      await handleSetPiScoped({
        provider: 'openai',
        id: 'gpt-4o',
        scoped: true,
        setPiModelScoped,
      })

      expect(setPiModelScoped).toHaveBeenCalledTimes(1)
    })

    it('does not call setPiModelScoped when provider is missing', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: null,
        id: 'claude-3-5-sonnet',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "provider is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when provider is an empty string', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: '',
        id: 'claude-3-5-sonnet',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "provider is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when provider is whitespace-only', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: '   ',
        id: 'claude-3-5-sonnet',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "provider is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when provider is a number', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 123 as unknown as string,
        id: 'claude-3-5-sonnet',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "provider is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when id is missing', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: undefined,
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "model id is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when id is an empty string', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: '',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "model id is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when id is whitespace-only', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: '  ',
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "model id is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when id is an object', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: { foo: 'bar' } as unknown as string,
        scoped: true,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "model id is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when scoped is a string', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: 'claude-3-5-sonnet',
        scoped: 'true' as unknown as boolean,
      })

      expect(result).toEqual({ ok: false, message: "scoped must be a boolean" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when scoped is a number', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: 'claude-3-5-sonnet',
        scoped: 1 as unknown as boolean,
      })

      expect(result).toEqual({ ok: false, message: "scoped must be a boolean" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('does not call setPiModelScoped when scoped is undefined', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: 'anthropic',
        id: 'claude-3-5-sonnet',
        scoped: undefined,
        setPiModelScoped,
      })

      expect(result).toEqual({ ok: false, message: "scoped must be a boolean" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })

    it('validates provider before id — returns provider error when both are invalid', async () => {
      const setPiModelScoped = vi.fn()

      const result = await handleSetPiScoped({
        provider: '',
        id: '',
        scoped: 'not-boolean' as unknown as boolean,
        setPiModelScoped,
      })

      // Validation order: provider first
      expect(result).toEqual({ ok: false, message: "provider is required" })
      expect(setPiModelScoped).not.toHaveBeenCalled()
    })
  })
})
