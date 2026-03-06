import type { ModifiedFileStat, ModifiedFileStatByPath } from "./types";

export function toStatByPath(files: ModifiedFileStat[]): ModifiedFileStatByPath {
  const next: ModifiedFileStatByPath = {};
  for (const file of files) {
    next[file.path] = { added: file.added, removed: file.removed };
  }
  return next;
}

export function computeThreadDeltaFiles(
  currentFiles: ModifiedFileStat[],
  baselineByPath: ModifiedFileStatByPath | null,
): ModifiedFileStat[] {
  if (!baselineByPath) {
    return currentFiles.sort((a, b) => a.path.localeCompare(b.path));
  }

  const currentByPath = toStatByPath(currentFiles);
  const allPaths = new Set<string>([
    ...Object.keys(currentByPath),
    ...Object.keys(baselineByPath),
  ]);
  const deltaFiles: ModifiedFileStat[] = [];

  for (const path of allPaths) {
    const current = currentByPath[path] ?? { added: 0, removed: 0 };
    const baseline = baselineByPath[path] ?? { added: 0, removed: 0 };
    const added = current.added - baseline.added;
    const removed = current.removed - baseline.removed;
    if (added === 0 && removed === 0) {
      continue;
    }
    deltaFiles.push({ path, added, removed });
  }

  return deltaFiles.sort((a, b) => a.path.localeCompare(b.path));
}

export function computeRecentChangedFiles(
  currentFiles: ModifiedFileStat[],
  previousByPath: ModifiedFileStatByPath | null,
): ModifiedFileStat[] {
  if (!previousByPath) {
    return [];
  }

  const currentByPath = toStatByPath(currentFiles);
  const allPaths = new Set<string>([
    ...Object.keys(currentByPath),
    ...Object.keys(previousByPath),
  ]);
  const changedFiles: ModifiedFileStat[] = [];

  for (const path of allPaths) {
    const current = currentByPath[path] ?? { added: 0, removed: 0 };
    const previous = previousByPath[path] ?? { added: 0, removed: 0 };
    const addedDelta = current.added - previous.added;
    const removedDelta = current.removed - previous.removed;
    const didChange = addedDelta !== 0 || removedDelta !== 0;
    if (!didChange) {
      continue;
    }

    // Ignore transitions to clean state (typically caused by commit/reset/stage flows).
    if (current.added === 0 && current.removed === 0) {
      continue;
    }

    changedFiles.push({ path, added: addedDelta, removed: removedDelta });
  }

  return changedFiles.sort((a, b) => a.path.localeCompare(b.path));
}

export function computeTotals(files: ModifiedFileStat[]): { files: number; added: number; removed: number } {
  return files.reduce(
    (acc, file) => ({
      files: acc.files + 1,
      added: acc.added + file.added,
      removed: acc.removed + file.removed,
    }),
    { files: 0, added: 0, removed: 0 },
  );
}
