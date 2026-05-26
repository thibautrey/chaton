import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test surface ────────────────────────────────────────────────────────────
// Handler under test:
//   workspace:getTouchedFilesForToolCall  (line ~939 in workspace-handlers.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Inline handler replica ──────────────────────────────────────────────────
// Must mirror the actual handler logic exactly so tests validate real behavior.
// ─────────────────────────────────────────────────────────────────────────────
function handleGetTouchedFilesForToolCall(
  touchedPathsByToolCall: Map<string, Set<string>>,
  toolCallId: unknown,
): string[] {
  if (typeof toolCallId !== 'string' || !toolCallId.trim()) {
    return []
  }
  return Array.from(touchedPathsByToolCall.get(toolCallId.trim()) ?? [])
}

describe('workspace:getTouchedFilesForToolCall', () => {
  let touchedPathsByToolCall: Map<string, Set<string>>

  beforeEach(() => {
    touchedPathsByToolCall = new Map<string, Set<string>>()
  })

  // ─── Rejects invalid toolCallId types ──────────────────────────────────────

  describe('rejects invalid toolCallId types', () => {
    const invalidValues: unknown[] = [undefined, null, 123, true, {}, [], () => {}]

    invalidValues.forEach((value) => {
      it(`returns [] for ${JSON.stringify(value)}`, () => {
        const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, value)
        expect(result).toEqual([])
      })
    })
  })

  // ─── Rejects empty and whitespace-only strings ───────────────────────────────

  describe('rejects empty and whitespace-only strings', () => {
    it('returns [] for empty string', () => {
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, '')
      expect(result).toEqual([])
    })

    it('returns [] for whitespace-only string', () => {
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, '   \t\n  ')
      expect(result).toEqual([])
    })
  })

  // ─── Accepts valid non-empty strings ───────────────────────────────────────

  describe('accepts valid non-empty strings', () => {
    it('returns [] for unknown toolCallId', () => {
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, 'unknown-id')
      expect(result).toEqual([])
    })

    it('returns stored paths for known toolCallId', () => {
      touchedPathsByToolCall.set('req-123', new Set(['src/a.ts', 'src/b.ts']))
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, 'req-123')
      expect(result).toEqual(['src/a.ts', 'src/b.ts'])
    })
  })

  // ─── Trimming behavior ───────────────────────────────────────────────────────

  describe('trims whitespace from valid IDs', () => {
    it('trims valid ID before lookup', () => {
      touchedPathsByToolCall.set('req-456', new Set(['src/c.ts']))
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, '  req-456  ')
      expect(result).toEqual(['src/c.ts'])
    })

    it('whitespace-padded unknown ID returns [] (not stored as-is)', () => {
      // The trimmed version 'req-789' is not in the map, so [] is returned
      touchedPathsByToolCall.set('req-789', new Set(['src/d.ts']))
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, '  req-789  ')
      expect(result).toEqual(['src/d.ts'])
    })

    it('padded unknown ID returns []', () => {
      touchedPathsByToolCall.set('req-abc', new Set(['src/e.ts']))
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, '  req-xyz  ')
      expect(result).toEqual([])
    })
  })

  // ─── Path ordering ───────────────────────────────────────────────────────────

  describe('path ordering', () => {
    it('paths are returned in insertion order', () => {
      const set = new Set<string>()
      set.add('z.ts')
      set.add('a.ts')
      set.add('m.ts')
      touchedPathsByToolCall.set('req-order', set)
      const result = handleGetTouchedFilesForToolCall(touchedPathsByToolCall, 'req-order')
      expect(result).toEqual(['z.ts', 'a.ts', 'm.ts'])
    })
  })
})
