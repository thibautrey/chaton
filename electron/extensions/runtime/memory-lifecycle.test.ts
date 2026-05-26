import { describe, expect, it } from 'vitest'

import { isSqliteBusyError } from './memory-lifecycle.js'

describe('isSqliteBusyError', () => {
  it('detects better-sqlite3 busy errors', () => {
    expect(isSqliteBusyError({ code: 'SQLITE_BUSY' })).toBe(true)
  })

  it('does not treat other sqlite errors as retryable busy locks', () => {
    expect(isSqliteBusyError({ code: 'SQLITE_CORRUPT' })).toBe(false)
    expect(isSqliteBusyError(new Error('database is locked'))).toBe(false)
    expect(isSqliteBusyError(null)).toBe(false)
  })
})
