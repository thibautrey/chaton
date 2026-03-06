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
