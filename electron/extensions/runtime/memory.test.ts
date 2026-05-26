import { beforeEach, describe, expect, it, vi } from 'vitest'

const prepareMock = vi.fn()
const allMock = vi.fn()
const runMock = vi.fn()

vi.mock('../../db/index.js', () => ({
  getDb: () => ({
    prepare: prepareMock,
  }),
}))

describe('memory runtime API validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    allMock.mockReturnValue([])
    runMock.mockReturnValue({ changes: 0 })
    prepareMock.mockReturnValue({ all: allMock, run: runMock, get: vi.fn(() => undefined) })
  })

  it('rejects malformed memory search limits before querying candidates', async () => {
    const { memorySearch } = await import('./memory.js')

    expect(memorySearch({ query: 'project memory', limit: Number.NaN })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    expect(memorySearch({ query: 'project memory', limit: 1.5 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    expect(memorySearch({ query: 'project memory', limit: 0 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at least 1' },
    })
    expect(memorySearch({ query: 'project memory', limit: 101 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 100' },
    })

    expect(prepareMock).not.toHaveBeenCalled()
  })

  it('uses a bounded candidate limit for valid memory search limits', async () => {
    const { memorySearch } = await import('./memory.js')

    expect(memorySearch({ query: 'project memory', limit: 7 })).toEqual({ ok: true, data: [] })
    expect(allMock).toHaveBeenCalledWith('project* OR memory*', 56)
  })

  it('rejects malformed memory list limits before listing rows', async () => {
    const { memoryList } = await import('./memory.js')

    expect(memoryList({ limit: Number.POSITIVE_INFINITY })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be a finite number' },
    })
    expect(memoryList({ limit: 2.25 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be an integer' },
    })
    expect(memoryList({ limit: 501 })).toEqual({
      ok: false,
      error: { code: 'invalid_args', message: 'limit must be at most 500' },
    })

    expect(prepareMock).not.toHaveBeenCalled()
  })
})
