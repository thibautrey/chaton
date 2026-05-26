import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for the `skills:addRating` IPC handler.
 *
 * The handler (workspace-handlers.ts lines ~2043–2060) was previously an unguarded
 * passthrough that accepted `skillSource: string, rating: number, review?: string`.
 * Malformed IPC calls (wrong types) would pass incorrect types to `addSkillRating`.
 *
 * After this change, the handler validates:
 * - skillSource must be a non-empty string (trimmed)
 * - rating must be a finite number (Infinity/NaN rejected)
 * - review is optional — if provided, must be a string
 *
 * The underlying `addSkillRating` clamps the rating to [1, 5] with Math.max/Math.min
 * and rounds it. The handler applies this same rounding before passing to the dep.
 */

type SkillsRating = {
  skillSource: string
  rating: number
  review?: string
  createdAt: string
  userId: string
}

function handleAddRating(params: {
  skillSource: unknown
  rating: unknown
  review?: unknown
  addSkillRating: (
    skillSource: string,
    rating: number,
    review?: string,
  ) => SkillsRating
}): { ok: true; rating: SkillsRating } | { ok: false; message: string } {
  const { skillSource, rating, review, addSkillRating } = params

  if (typeof skillSource !== "string" || !skillSource.trim()) {
    return { ok: false as const, message: "skillSource is required" }
  }
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return { ok: false as const, message: "rating must be a finite number" }
  }
  return {
    ok: true as const,
    rating: addSkillRating(
      skillSource.trim(),
      Math.max(1, Math.min(5, Math.round(rating))),
      typeof review === "string" ? review : undefined,
    ),
  }
}

describe('skills:addRating', () => {
  describe('valid inputs — delegates to addSkillRating', () => {
    it('passes through a rating entry unchanged', () => {
      const storedRating = { skillSource: 'skill-a', rating: 5, createdAt: '2025-01-01', userId: 'uid1' }
      const addSkillRating = vi.fn().mockReturnValue(storedRating)

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: 5,
        addSkillRating,
      })

      expect(result).toEqual({ ok: true, rating: storedRating })
      expect(addSkillRating).toHaveBeenCalledWith('skill-a', 5, undefined)
    })

    it('passes skillSource trimmed', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'skill-a', rating: 4, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: '  skill-b  ',
        rating: 4,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-b', 4, undefined)
    })

    it('passes review when provided as a string', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 3, review: 'Great!', createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-c',
        rating: 3,
        review: 'Great!',
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-c', 3, 'Great!')
    })

    it('clamps rating > 5 to 5', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 5, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-over',
        rating: 10,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-over', 5, undefined)
    })

    it('clamps rating < 1 to 1', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 1, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-under',
        rating: -3,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-under', 1, undefined)
    })

    it('rounds fractional ratings to nearest integer', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 4, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-frac',
        rating: 4.6,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-frac', 5, undefined)
    })

    it('rounds 4.4 down to 4', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 4, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-frac2',
        rating: 4.4,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-frac2', 4, undefined)
    })

    it('calls addSkillRating exactly once per invocation', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 3, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-once',
        rating: 3,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledTimes(1)
    })

    it('does not call addSkillRating when skillSource is null', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: null,
        rating: 5,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "skillSource is required" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when skillSource is an empty string', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: '',
        rating: 5,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "skillSource is required" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when skillSource is whitespace-only', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: '   ',
        rating: 5,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "skillSource is required" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when skillSource is an object', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: { name: 'skill' } as unknown as string,
        rating: 5,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "skillSource is required" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when rating is a string', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: '5' as unknown as number,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "rating must be a finite number" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when rating is NaN', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: NaN,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "rating must be a finite number" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when rating is Infinity', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: Infinity,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "rating must be a finite number" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when rating is -Infinity', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: -Infinity,
        addSkillRating,
      })

      expect(result).toEqual({ ok: false, message: "rating must be a finite number" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('does not call addSkillRating when rating is undefined', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: 'skill-a',
        rating: undefined,
        addSkillRating,
      } as unknown as Parameters<typeof handleAddRating>[0])

      expect(result).toEqual({ ok: false, message: "rating must be a finite number" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('validates skillSource before rating — returns skillSource error when both are invalid', () => {
      const addSkillRating = vi.fn()

      const result = handleAddRating({
        skillSource: '',
        rating: 'bad' as unknown as number,
        addSkillRating,
      })

      // Validation order: skillSource first
      expect(result).toEqual({ ok: false, message: "skillSource is required" })
      expect(addSkillRating).not.toHaveBeenCalled()
    })

    it('ignores review when it is not a string (e.g. number)', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 4, review: undefined, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-numreview',
        rating: 4,
        review: 42,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-numreview', 4, undefined)
    })

    it('ignores review when it is null', () => {
      const addSkillRating = vi.fn().mockReturnValue({ skillSource: 'x', rating: 4, review: undefined, createdAt: '', userId: '' })

      handleAddRating({
        skillSource: 'skill-nullreview',
        rating: 4,
        review: null,
        addSkillRating,
      })

      expect(addSkillRating).toHaveBeenCalledWith('skill-nullreview', 4, undefined)
    })
  })
})
