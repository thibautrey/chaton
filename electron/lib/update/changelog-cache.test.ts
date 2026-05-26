import { describe, expect, it } from 'vitest'
import {
  createChangelogPrefetchMetadata,
  shouldPrefetchChangelogs,
  type ChangelogPrefetchResult,
} from './changelog-cache.js'

describe('shouldPrefetchChangelogs', () => {
  const now = Date.parse('2026-05-26T00:00:00.000Z')

  it('prefetches when metadata is missing or invalid', () => {
    expect(shouldPrefetchChangelogs(null, now)).toBe(true)
    expect(shouldPrefetchChangelogs({ fetchedAt: 'not-a-date' }, now)).toBe(true)
  })

  it('skips when the changelog cache was refreshed recently', () => {
    expect(shouldPrefetchChangelogs({ fetchedAt: '2026-05-25T12:00:00.000Z' }, now)).toBe(false)
  })

  it('prefetches again after the refresh interval', () => {
    expect(shouldPrefetchChangelogs({ fetchedAt: '2026-05-24T23:59:59.000Z' }, now)).toBe(true)
  })
})

describe('createChangelogPrefetchMetadata', () => {
  it('records the refresh time and release count', () => {
    expect(createChangelogPrefetchMetadata(30, new Date('2026-05-26T00:00:00.000Z'))).toEqual({
      fetchedAt: '2026-05-26T00:00:00.000Z',
      releaseCount: 30,
    })
  })
})

describe('ChangelogPrefetchResult', () => {
  it('represents the non-network startup outcomes explicitly', () => {
    const outcomes: ChangelogPrefetchResult[] = [
      { status: 'skipped-session' },
      { status: 'skipped-cache', fetchedAt: '2026-05-26T00:00:00.000Z', releaseCount: 30 },
      { status: 'prefetched', releaseCount: 30 },
      { status: 'failed', error: 'network timeout' },
    ]

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'skipped-session',
      'skipped-cache',
      'prefetched',
      'failed',
    ])
  })
})
