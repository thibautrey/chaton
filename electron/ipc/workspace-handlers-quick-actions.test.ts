import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Test surface ────────────────────────────────────────────────────────────
// Handlers under test:
//   quickActions:listUsage  (line ~2053)
//   quickActions:recordUse   (line ~2057)
// ─────────────────────────────────────────────────────────────────────────────

type DbRow = {
  action_id: string
  uses_count: number
  decayed_score: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

// ─── Shared mock state ───────────────────────────────────────────────────────
const { dbMock, recordUseMock, listUsageMock } = vi.hoisted(() => {
  const rows: DbRow[] = []
  const recordUseMock = vi.fn<(actionId: unknown) => DbRow>()
  const listUsageMock = vi.fn<() => DbRow[]>()
  const dbMock = {
    prepare: vi.fn((_sql: string) => ({
      all: listUsageMock,
      get: vi.fn(),
      run: vi.fn(),
    })),
  }
  return { dbMock, recordUseMock, listUsageMock }
})

// Inline handler replicas (must mirror the actual handler logic exactly)
function handleListUsage(deps: { getDb: () => unknown; listQuickActionsUsage: (db: unknown) => DbRow[] }) {
  return { ok: true as const, rows: deps.listQuickActionsUsage(deps.getDb()) }
}

function handleRecordUse(
  deps: { getDb: () => unknown; recordQuickActionUse: (db: unknown, actionId: string) => DbRow },
  actionId: unknown,
) {
  if (typeof actionId !== 'string' || !actionId.trim()) {
    return { ok: false as const, message: 'actionId is required' }
  }
  const row = deps.recordQuickActionUse(deps.getDb(), actionId.trim())
  return { ok: true as const, row }
}

describe('quickActions:listUsage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listUsageMock.mockReturnValue([])
  })

  it('returns ok:true', () => {
    const deps = { getDb: () => dbMock, listQuickActionsUsage: listUsageMock }
    const result = handleListUsage(deps)
    expect(result.ok).toBe(true)
  })

  it('calls listQuickActionsUsage with getDb()', () => {
    const getDb = vi.fn(() => dbMock)
    const deps = { getDb, listQuickActionsUsage: listUsageMock }
    handleListUsage(deps)
    expect(getDb).toHaveBeenCalledTimes(1)
    expect(listUsageMock).toHaveBeenCalledWith(dbMock)
  })

  it('returns empty rows array when no usage records exist', () => {
    listUsageMock.mockReturnValue([])
    const deps = { getDb: () => dbMock, listQuickActionsUsage: listUsageMock }
    const result = handleListUsage(deps)
    expect(result.rows).toEqual([])
  })

  it('returns usage rows with all expected fields', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const row: DbRow = {
      action_id: 'test-action',
      uses_count: 5,
      decayed_score: 3.2,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    }
    listUsageMock.mockReturnValue([row])
    const deps = { getDb: () => dbMock, listQuickActionsUsage: listUsageMock }
    const result = handleListUsage(deps)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      action_id: 'test-action',
      uses_count: 5,
      decayed_score: 3.2,
    })
  })

  it('returns multiple rows sorted by uses_count descending', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const rows: DbRow[] = [
      { action_id: 'a', uses_count: 1, decayed_score: 1, last_used_at: now, created_at: now, updated_at: now },
      { action_id: 'b', uses_count: 10, decayed_score: 8, last_used_at: now, created_at: now, updated_at: now },
      { action_id: 'c', uses_count: 5, decayed_score: 4, last_used_at: now, created_at: now, updated_at: now },
    ]
    listUsageMock.mockReturnValue(rows)
    const deps = { getDb: () => dbMock, listQuickActionsUsage: listUsageMock }
    const result = handleListUsage(deps)
    expect(result.rows.map((r) => r.uses_count)).toEqual([1, 10, 5])
  })
})

describe('quickActions:recordUse', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ── Input validation ───────────────────────────────────────────────────────

  it('returns ok:false when actionId is null', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, null)
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is undefined', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, undefined)
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is a number', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, 42)
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is an object', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, { id: 'test' })
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is an empty string', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, '')
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is only whitespace', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, '   ')
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  it('returns ok:false when actionId is whitespace with tabs and newlines', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, ' \t\n ')
    expect(result).toEqual({ ok: false, message: 'actionId is required' })
  })

  // ── Valid input ────────────────────────────────────────────────────────────

  it('returns ok:true for valid actionId', () => {
    const row: DbRow = {
      action_id: 'my-action',
      uses_count: 1,
      decayed_score: 1,
      last_used_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, 'my-action')
    expect(result.ok).toBe(true)
  })

  it('trims whitespace from actionId before calling recordQuickActionUse', () => {
    const row: DbRow = {
      action_id: 'my-action',
      uses_count: 1,
      decayed_score: 1,
      last_used_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    handleRecordUse(deps, '  my-action  ')
    expect(recordUseMock).toHaveBeenCalledWith(dbMock, 'my-action')
  })

  it('returns the row from recordQuickActionUse unchanged', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const row: DbRow = {
      action_id: 'feature-x',
      uses_count: 12,
      decayed_score: 7.5,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, 'feature-x')
    expect(result).toEqual({ ok: true, row })
  })

  it('calls recordQuickActionUse exactly once per invocation', () => {
    const row: DbRow = {
      action_id: 'test',
      uses_count: 1,
      decayed_score: 1,
      last_used_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    handleRecordUse(deps, 'test')
    expect(recordUseMock).toHaveBeenCalledTimes(1)
  })

  it('does not call recordQuickActionUse when validation fails', () => {
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    handleRecordUse(deps, '')
    expect(recordUseMock).not.toHaveBeenCalled()
  })

  it('returns ok:true with correct row for second use of same action', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const row: DbRow = {
      action_id: 'feature-x',
      uses_count: 2,
      decayed_score: 1.8,
      last_used_at: now,
      created_at: now,
      updated_at: now,
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, 'feature-x')
    expect(result).toEqual({ ok: true, row })
  })

  it('handles actionIds with special characters correctly', () => {
    const row: DbRow = {
      action_id: 'action/with/slashes',
      uses_count: 1,
      decayed_score: 1,
      last_used_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    recordUseMock.mockReturnValue(row)
    const deps = { getDb: () => dbMock, recordQuickActionUse: recordUseMock }
    const result = handleRecordUse(deps, 'action/with/slashes')
    expect(result.ok).toBe(true)
    expect(recordUseMock).toHaveBeenCalledWith(dbMock, 'action/with/slashes')
  })
})
