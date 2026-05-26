import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the `pi:resolveProviderBaseUrl` IPC handler.
 *
 * The handler (workspace-handlers.ts lines 1672–1686):
 * 1. Validates input — must be a non-empty string (after trimming)
 * 2. Calls deps.probeProviderBaseUrl(rawUrl) to resolve and probe the URL
 * 3. Returns ok:true with resolved baseUrl, matched, and tested fields
 *
 * We replicate the minimal handler logic inline to test without needing the full
 * workspace-handlers.ts module (Electron IPC wiring, Pi deps, path module).
 */

type ResolveResult =
  | { ok: true; baseUrl: string; matched: boolean; tested: string[] }
  | { ok: false; message: string }

interface MockDeps {
  probeProviderBaseUrl: (
    rawUrl: string,
  ) => Promise<{ resolvedBaseUrl: string; matched: boolean; tested: string[] }>
}

// Inline handler mirroring workspace-handlers.ts lines 1672–1686
async function handleResolveProviderBaseUrl(
  rawUrl: unknown,
  deps: MockDeps,
): Promise<ResolveResult> {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { ok: false as const, message: 'URL invalide.' }
  }
  const resolved = await deps.probeProviderBaseUrl(rawUrl)
  return {
    ok: true as const,
    baseUrl: resolved.resolvedBaseUrl,
    matched: resolved.matched,
    tested: resolved.tested,
  }
}

describe('pi:resolveProviderBaseUrl', () => {
  let deps: MockDeps
  let probeProviderBaseUrl: ReturnType<typeof vi.fn>

  beforeEach(() => {
    probeProviderBaseUrl = vi.fn()
    deps = { probeProviderBaseUrl }
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it('returns error when input is null', async () => {
    const result = await handleResolveProviderBaseUrl(null, deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is undefined', async () => {
    const result = await handleResolveProviderBaseUrl(undefined, deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is a number', async () => {
    const result = await handleResolveProviderBaseUrl(123, deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is an object', async () => {
    const result = await handleResolveProviderBaseUrl({ url: 'http://localhost' }, deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is an array', async () => {
    const result = await handleResolveProviderBaseUrl(['http://localhost'], deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is an empty string', async () => {
    const result = await handleResolveProviderBaseUrl('', deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  it('returns error when input is whitespace-only string', async () => {
    const result = await handleResolveProviderBaseUrl('   ', deps)
    expect(result).toEqual({ ok: false, message: 'URL invalide.' })
    expect(probeProviderBaseUrl).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Delegation
  // -------------------------------------------------------------------------

  it('passes the raw URL string to probeProviderBaseUrl', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'https://api.example.com/v1',
      matched: true,
      tested: ['https://api.example.com/v1/chat/completions'],
    })
    await handleResolveProviderBaseUrl('https://api.example.com', deps)
    expect(probeProviderBaseUrl).toHaveBeenCalledOnce()
    expect(probeProviderBaseUrl).toHaveBeenCalledWith('https://api.example.com')
  })

  it('returns ok:true with baseUrl, matched, and tested from probeProviderBaseUrl', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'https://api.openai.com/v1',
      matched: true,
      tested: ['https://api.openai.com/v1/models', 'https://api.openai.com/v1/chat/completions'],
    })
    const result = await handleResolveProviderBaseUrl('https://api.openai.com', deps)
    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://api.openai.com/v1',
      matched: true,
      tested: ['https://api.openai.com/v1/models', 'https://api.openai.com/v1/chat/completions'],
    })
  })

  it('maps baseUrl from resolvedBaseUrl field', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'http://localhost:11434/v1',
      matched: false,
      tested: ['http://localhost:11434'],
    })
    const result = await handleResolveProviderBaseUrl('http://localhost:11434', deps)
    expect(result.baseUrl).toBe('http://localhost:11434/v1')
  })

  it('returns ok:true with matched=false when no compatible endpoint is found', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'https://unreachable.example.com',
      matched: false,
      tested: ['https://unreachable.example.com/v1/models'],
    })
    const result = await handleResolveProviderBaseUrl('https://unreachable.example.com', deps)
    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://unreachable.example.com',
      matched: false,
      tested: ['https://unreachable.example.com/v1/models'],
    })
  })

  it('returns empty tested array when no endpoints are probed', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'https://api.provider.com',
      matched: false,
      tested: [],
    })
    const result = await handleResolveProviderBaseUrl('https://api.provider.com', deps)
    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://api.provider.com',
      matched: false,
      tested: [],
    })
  })

  it('does NOT trim the URL before passing to probeProviderBaseUrl', async () => {
    probeProviderBaseUrl.mockResolvedValue({
      resolvedBaseUrl: 'https://api.example.com/v1',
      matched: true,
      tested: [],
    })
    // Note: whitespace-only fails validation, but whitespace-surrounded valid URL
    // does NOT get trimmed before delegation — the trim() is only in the
    // length check. This test verifies the untrimmed string is passed through.
    probeProviderBaseUrl.mockImplementation(async (url: string) => {
      // If trim was applied before the probe, URL would be shorter
      expect(url).toBe('  https://api.example.com  ')
      return { resolvedBaseUrl: url, matched: true, tested: [] }
    })
    await handleResolveProviderBaseUrl('  https://api.example.com  ', deps)
  })
})
