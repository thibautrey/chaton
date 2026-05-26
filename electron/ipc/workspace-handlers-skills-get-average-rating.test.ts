import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `skills:getAverageRating` IPC handler.
 *
 * Handler (workspace-handlers.ts lines ~2061–2068):
 *   ipcMain.handle("skills:getAverageRating", (_event, skillSource: string) => {
 *     if (typeof skillSource !== "string" || !skillSource.trim()) {
 *       return { ok: false as const, message: "skillSource is required" };
 *     }
 *     return deps.getSkillAverageRating(skillSource.trim());
 *   });
 *
 * The handler validates that skillSource is a non-empty string before delegating
 * to the underlying getSkillAverageRating function. Without this guard, a
 * non-string value (e.g. null, undefined, number) would be passed directly to
 * the business logic.
 */

type AvgRatingResult = { average: number; count: number }

function handleGetAverageRating(params: {
  skillSource: unknown
  getSkillAverageRating: (skillSource: string) => AvgRatingResult
}): AvgRatingResult {
  const { skillSource, getSkillAverageRating } = params
  if (typeof skillSource !== 'string' || !skillSource.trim()) {
    return { ok: false as const, message: 'skillSource is required' } as never
  }
  return getSkillAverageRating(skillSource.trim())
}

describe('handleGetAverageRating', () => {
  const makeDeps = (overrides?: Partial<{ getSkillAverageRating: (skillSource: string) => AvgRatingResult }>) => ({
    getSkillAverageRating: vi.fn<(skillSource: string) => AvgRatingResult>().mockReturnValue({ average: 4.2, count: 10 }),
    ...overrides,
  })

  // --- validation: returns error for non-string skillSource ---

  it('returns error when skillSource is null', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: null, ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is undefined', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: undefined, ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is a number', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: 42, ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is an object', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: { name: 'test' }, ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is an array', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: ['a', 'b'], ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is a boolean', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: true, ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  // --- validation: returns error for empty/whitespace skillSource ---

  it('returns error when skillSource is an empty string', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: '', ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is whitespace-only', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: '   ', ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  it('returns error when skillSource is a string with only newlines and tabs', () => {
    const deps = makeDeps()
    const result = handleGetAverageRating({ skillSource: '\n\t  ', ...deps })
    expect(result).toEqual({ ok: false, message: 'skillSource is required' })
    expect(deps.getSkillAverageRating).not.toHaveBeenCalled()
  })

  // --- happy path: delegates with trimmed skillSource ---

  it('delegates to getSkillAverageRating with the trimmed skillSource', () => {
    const getSkillAverageRating = vi.fn<(skillSource: string) => AvgRatingResult>().mockReturnValue({ average: 3.5, count: 4 })
    const deps = makeDeps({ getSkillAverageRating })
    handleGetAverageRating({ skillSource: '  my-skill  ', ...deps })
    expect(getSkillAverageRating).toHaveBeenCalledOnce()
    expect(getSkillAverageRating).toHaveBeenCalledWith('my-skill')
  })

  it('returns getSkillAverageRating result unchanged (non-zero average)', () => {
    const deps = makeDeps({ getSkillAverageRating: vi.fn().mockReturnValue({ average: 4.8, count: 20 }) })
    const result = handleGetAverageRating({ skillSource: 'popular-skill', ...deps })
    expect(result).toEqual({ average: 4.8, count: 20 })
  })

  it('returns getSkillAverageRating result unchanged (zero average)', () => {
    const deps = makeDeps({ getSkillAverageRating: vi.fn().mockReturnValue({ average: 0, count: 0 }) })
    const result = handleGetAverageRating({ skillSource: 'unrated-skill', ...deps })
    expect(result).toEqual({ average: 0, count: 0 })
  })

  it('does not call getSkillAverageRating more than once per invocation', () => {
    const getSkillAverageRating = vi.fn<(skillSource: string) => AvgRatingResult>().mockReturnValue({ average: 3.0, count: 5 })
    const deps = makeDeps({ getSkillAverageRating })
    handleGetAverageRating({ skillSource: 'test-skill', ...deps })
    expect(getSkillAverageRating).toHaveBeenCalledTimes(1)
  })
})
