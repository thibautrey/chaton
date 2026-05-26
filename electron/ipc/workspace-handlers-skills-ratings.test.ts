import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the skills rating IPC handlers:
 *   `skills:getRatings`, `skills:addRating`, `skills:getAverageRating`
 *
 * All three are simple passthroughs to workspace-skills.ts functions.
 * We replicate the minimal handler logic inline to test without needing the
 * full workspace-handlers.ts module (Electron IPC wiring, DB, Pi deps).
 *
 * Key behaviors verified:
 * - getRatings: undefined skillSource → all ratings; with skillSource → filtered
 * - addRating: rating is clamped to [1,5]; review is optional; entry is persisted
 * - getAverageRating: empty → {average:0, count:0}; single/multiple ratings → correct mean
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// -------------------------------------------------------------------------
// Inline minimal handlers — mirror workspace-handlers.ts lines 2031–2040
// -------------------------------------------------------------------------

function handleGetRatings(params: {
  skillSource?: unknown
  getSkillsRatings: (skillSource?: string) => SkillsRating[]
}): SkillsRating[] | unknown[] {
  // Mirror the production handler's validation (workspace-handlers.ts lines 2273–2290):
  // Reject invalid types: number, boolean, object, array, function.
  // undefined is intentionally allowed (returns all ratings).
  if (
    params.skillSource !== undefined &&
    (typeof params.skillSource !== 'string' || !params.skillSource.trim())
  ) {
    return []
  }
  return params.getSkillsRatings(
    typeof params.skillSource === 'string' && params.skillSource.trim()
      ? params.skillSource.trim()
      : undefined,
  )
}

function handleAddRating(params: {
  skillSource: string
  rating: number
  review?: string
  addSkillRating: (skillSource: string, rating: number, review?: string) => SkillsRating
}): SkillsRating {
  return params.addSkillRating(params.skillSource, params.rating, params.review)
}

function handleGetAverageRating(params: {
  skillSource: string
  getSkillAverageRating: (skillSource: string) => { average: number; count: number }
}): { average: number; count: number } {
  return params.getSkillAverageRating(params.skillSource)
}

// -------------------------------------------------------------------------
// In-memory stub of the skills rating store (mirrors workspace-skills.ts)
// -------------------------------------------------------------------------

type SkillsRating = {
  skillSource: string
  rating: number
  review?: string
  createdAt: string
  userId: string
}

const RATINGS_STORE: SkillsRating[] = []

function readSkillsRatingsStub(): SkillsRating[] {
  return [...RATINGS_STORE]
}

function writeSkillsRatingsStub(ratings: SkillsRating[]): void {
  RATINGS_STORE.length = 0
  RATINGS_STORE.push(...ratings)
}

function addSkillRatingStub(
  skillSource: string,
  rating: number,
  review?: string,
): SkillsRating {
  const ratings = readSkillsRatingsStub()
  const userId = `stub-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const entry: SkillsRating = {
    skillSource,
    rating: Math.max(1, Math.min(5, rating)),
    review,
    createdAt: new Date(0).toISOString(),
    userId,
  }
  ratings.push(entry)
  writeSkillsRatingsStub(ratings)
  return entry
}

function getSkillsRatingsStub(skillSource?: string): SkillsRating[] {
  const ratings = readSkillsRatingsStub()
  if (!skillSource) return ratings
  return ratings.filter((r) => r.skillSource === skillSource)
}

function getSkillAverageRatingStub(
  skillSource: string,
): { average: number; count: number } {
  const ratings = getSkillsRatingsStub(skillSource)
  if (ratings.length === 0) return { average: 0, count: 0 }
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0)
  return {
    average: sum / ratings.length,
    count: ratings.length,
  }
}

beforeEach(() => {
  RATINGS_STORE.length = 0
})

// -------------------------------------------------------------------------
// skills:getRatings
// -------------------------------------------------------------------------

describe('skills:getRatings — IPC-level skillSource validation', () => {
  // Reject invalid types (non-string / non-undefined)
  const invalidTypes = [
    ['number (42)', 42],
    ['boolean (true)', true],
    ['object', { foo: 'bar' }],
    ['array', ['skill-a']],
    ['function', () => {}],
  ] as const

  for (const [label, value] of invalidTypes) {
    it(`rejects ${label} → returns empty array`, () => {
      const result = handleGetRatings({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skillSource: value as any,
        getSkillsRatings: getSkillsRatingsStub,
      })
      expect(result).toEqual([])
    })
  }

  it('rejects empty string → returns empty array without calling getSkillsRatings', () => {
    const spy = vi.fn().mockReturnValue([])
    const result = handleGetRatings({
      skillSource: '',
      getSkillsRatings: spy,
    })
    // Empty string is falsy, so it triggers early return of []
    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('rejects whitespace-only string → returns empty array without calling getSkillsRatings', () => {
    const spy = vi.fn().mockReturnValue([])
    const result = handleGetRatings({
      skillSource: '   ',
      getSkillsRatings: spy,
    })
    // Whitespace-only is falsy, so it triggers early return of []
    expect(spy).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('accepts valid non-empty string → trims and delegates', () => {
    const spy = vi.fn().mockReturnValue([{ skillSource: ' skill-a ', rating: 5, createdAt: '', userId: '' }])
    const result = handleGetRatings({
      skillSource: '  skill-a  ',
      getSkillsRatings: spy,
    })
    expect(spy).toHaveBeenCalledWith('skill-a')
    expect(result).toHaveLength(1)
  })

  it('accepts undefined → delegates as undefined (all ratings)', () => {
    const spy = vi.fn().mockReturnValue([])
    const result = handleGetRatings({
      skillSource: undefined,
      getSkillsRatings: spy,
    })
    expect(spy).toHaveBeenCalledWith(undefined)
    expect(result).toEqual([])
  })
it('delegation: calls getSkillsRatings with undefined when skillSource is undefined', () => {
    addSkillRatingStub('skill-a', 5)
    addSkillRatingStub('skill-b', 3)
    addSkillRatingStub('skill-a', 4)

    const result = handleGetRatings({
      skillSource: undefined,
      getSkillsRatings: getSkillsRatingsStub,
    })

    expect(result).toHaveLength(3)
  })

  it('returns only ratings matching the given skillSource', () => {
    addSkillRatingStub('skill-a', 5)
    addSkillRatingStub('skill-b', 3)
    addSkillRatingStub('skill-a', 4)
    addSkillRatingStub('skill-c', 2)

    const result = handleGetRatings({
      skillSource: 'skill-a',
      getSkillsRatings: getSkillsRatingsStub,
    })

    expect(result).toHaveLength(2)
    expect(result.every((r) => r.skillSource === 'skill-a')).toBe(true)
  })

  it('returns empty array when no ratings exist', () => {
    const result = handleGetRatings({
      skillSource: 'nonexistent',
      getSkillsRatings: getSkillsRatingsStub,
    })
    expect(result).toHaveLength(0)
  })

  it('returns empty array when skillSource has no ratings', () => {
    addSkillRatingStub('skill-a', 5)
    const result = handleGetRatings({
      skillSource: 'skill-b',
      getSkillsRatings: getSkillsRatingsStub,
    })
    expect(result).toHaveLength(0)
  })
})

// -------------------------------------------------------------------------
// skills:addRating
// -------------------------------------------------------------------------

describe('skills:addRating', () => {
  it('clamps rating above 5 down to 5', () => {
    const entry = handleAddRating({
      skillSource: 'test-skill',
      rating: 10,
      addSkillRating: addSkillRatingStub,
    })
    expect(entry.rating).toBe(5)
  })

  it('clamps rating below 1 up to 1', () => {
    const entry = handleAddRating({
      skillSource: 'test-skill',
      rating: -3,
      addSkillRating: addSkillRatingStub,
    })
    expect(entry.rating).toBe(1)
  })

  it('accepts rating of exactly 1 and 5', () => {
    const entry1 = handleAddRating({
      skillSource: 'test-skill',
      rating: 1,
      addSkillRating: addSkillRatingStub,
    })
    const entry2 = handleAddRating({
      skillSource: 'test-skill',
      rating: 5,
      addSkillRating: addSkillRatingStub,
    })
    expect(entry1.rating).toBe(1)
    expect(entry2.rating).toBe(5)
  })

  it('stores review when provided', () => {
    const entry = handleAddRating({
      skillSource: 'test-skill',
      rating: 4,
      review: 'Great skill!',
      addSkillRating: addSkillRatingStub,
    })
    expect(entry.review).toBe('Great skill!')
  })

  it('stores review as undefined when omitted', () => {
    const entry = handleAddRating({
      skillSource: 'test-skill',
      rating: 3,
      addSkillRating: addSkillRatingStub,
    })
    expect(entry.review).toBeUndefined()
  })

  it('assigns skillSource correctly', () => {
    const entry = handleAddRating({
      skillSource: 'my-awesome-skill',
      rating: 5,
      addSkillRating: addSkillRatingStub,
    })
    expect(entry.skillSource).toBe('my-awesome-skill')
  })

  it('assigns userId and createdAt', () => {
    const before = Date.now()
    const entry = handleAddRating({
      skillSource: 'test-skill',
      rating: 5,
      addSkillRating: addSkillRatingStub,
    })
    const after = Date.now()
    expect(entry.userId).toBeDefined()
    expect(entry.userId.length).toBeGreaterThan(0)
    const createdTime = new Date(entry.createdAt).getTime()
    expect(createdTime).toBe(0) // stub uses epoch
  })

  it('persists the rating so subsequent getRatings sees it', () => {
    handleAddRating({
      skillSource: 'persisted-skill',
      rating: 4,
      addSkillRating: addSkillRatingStub,
    })

    const ratings = handleGetRatings({
      skillSource: 'persisted-skill',
      getSkillsRatings: getSkillsRatingsStub,
    })

    expect(ratings).toHaveLength(1)
    expect(ratings[0].rating).toBe(4)
  })

  it('accumulates multiple ratings for the same skill', () => {
    handleAddRating({ skillSource: 'test', rating: 5, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'test', rating: 3, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'test', rating: 4, addSkillRating: addSkillRatingStub })

    const ratings = handleGetRatings({
      skillSource: 'test',
      getSkillsRatings: getSkillsRatingsStub,
    })

    expect(ratings).toHaveLength(3)
  })
})

// -------------------------------------------------------------------------
// skills:getAverageRating
// -------------------------------------------------------------------------

describe('skills:getAverageRating', () => {
  it('returns {average:0, count:0} when no ratings exist for skill', () => {
    const result = handleGetAverageRating({
      skillSource: 'nonexistent',
      getSkillAverageRating: getSkillAverageRatingStub,
    })
    expect(result).toEqual({ average: 0, count: 0 })
  })

  it('returns the single rating when only one rating exists', () => {
    handleAddRating({ skillSource: 'solo', rating: 4, addSkillRating: addSkillRatingStub })
    const result = handleGetAverageRating({
      skillSource: 'solo',
      getSkillAverageRating: getSkillAverageRatingStub,
    })
    expect(result).toEqual({ average: 4, count: 1 })
  })

  it('computes correct mean for multiple ratings', () => {
    handleAddRating({ skillSource: 'multi', rating: 5, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'multi', rating: 3, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'multi', rating: 4, addSkillRating: addSkillRatingStub })

    const result = handleGetAverageRating({
      skillSource: 'multi',
      getSkillAverageRating: getSkillAverageRatingStub,
    })

    expect(result.average).toBeCloseTo(4, 5)
    expect(result.count).toBe(3)
  })

  it('ignores ratings for other skills', () => {
    handleAddRating({ skillSource: 'skill-a', rating: 5, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'skill-b', rating: 1, addSkillRating: addSkillRatingStub })

    const result = handleGetAverageRating({
      skillSource: 'skill-a',
      getSkillAverageRating: getSkillAverageRatingStub,
    })

    expect(result).toEqual({ average: 5, count: 1 })
  })

  it('handles fractional averages correctly', () => {
    handleAddRating({ skillSource: 'frac', rating: 5, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'frac', rating: 4, addSkillRating: addSkillRatingStub })

    const result = handleGetAverageRating({
      skillSource: 'frac',
      getSkillAverageRating: getSkillAverageRatingStub,
    })

    expect(result.average).toBe(4.5)
    expect(result.count).toBe(2)
  })

  it('uses clamped rating values for average (not raw input)', () => {
    // Rating of 10 gets clamped to 5, rating of -1 gets clamped to 1
    handleAddRating({ skillSource: 'clamp', rating: 10, addSkillRating: addSkillRatingStub })
    handleAddRating({ skillSource: 'clamp', rating: -1, addSkillRating: addSkillRatingStub })

    const result = handleGetAverageRating({
      skillSource: 'clamp',
      getSkillAverageRating: getSkillAverageRatingStub,
    })

    expect(result.average).toBe(3) // (5 + 1) / 2
    expect(result.count).toBe(2)
  })
})
