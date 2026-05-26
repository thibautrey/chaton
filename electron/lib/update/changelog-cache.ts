export const CHANGELOG_PREFETCH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface ChangelogPrefetchMetadata {
  fetchedAt?: string
  releaseCount?: number
}

export type ChangelogPrefetchResult =
  | { status: 'skipped-session' }
  | { status: 'skipped-cache'; fetchedAt?: string; releaseCount?: number }
  | { status: 'prefetched'; releaseCount: number }
  | { status: 'failed'; error: string }

export function shouldPrefetchChangelogs(
  metadata: ChangelogPrefetchMetadata | null,
  nowMs = Date.now(),
  intervalMs = CHANGELOG_PREFETCH_INTERVAL_MS,
): boolean {
  if (!metadata?.fetchedAt) {
    return true
  }

  const fetchedAtMs = Date.parse(metadata.fetchedAt)
  if (!Number.isFinite(fetchedAtMs)) {
    return true
  }

  return nowMs - fetchedAtMs >= intervalMs
}

export function createChangelogPrefetchMetadata(
  releaseCount: number,
  now = new Date(),
): Required<ChangelogPrefetchMetadata> {
  return {
    fetchedAt: now.toISOString(),
    releaseCount,
  }
}
