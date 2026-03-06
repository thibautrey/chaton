import type { ParsedDiffLine } from "./types";

export function parseDiffLines(lines: string[], firstChangedLine: number | null): ParsedDiffLine[] {
  let oldLineCursor = 0;
  let newLineCursor = 0;
  let sawFirstChanged = false;
  const parsed: ParsedDiffLine[] = [];

  for (const line of lines) {
    const hunk = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (hunk) {
      oldLineCursor = Number.parseInt(hunk[1], 10);
      newLineCursor = Number.parseInt(hunk[2], 10);
      parsed.push({
        raw: line,
        className: "chat-diff-line-neutral",
        oldLine: null,
        newLine: null,
        isChangeContent: false,
      });
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const isFirst =
        !sawFirstChanged &&
        firstChangedLine !== null &&
        Number.isFinite(newLineCursor) &&
        newLineCursor === firstChangedLine;
      if (isFirst) sawFirstChanged = true;
      parsed.push({
        raw: line,
        className: `chat-diff-line-plus${isFirst ? " chat-diff-line-first-change" : ""}`,
        oldLine: null,
        newLine: newLineCursor,
        isChangeContent: true,
      });
      newLineCursor += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      const isFirst = !sawFirstChanged && firstChangedLine === null;
      if (isFirst) sawFirstChanged = true;
      parsed.push({
        raw: line,
        className: `chat-diff-line-minus${isFirst ? " chat-diff-line-first-change" : ""}`,
        oldLine: oldLineCursor,
        newLine: null,
        isChangeContent: true,
      });
      oldLineCursor += 1;
      continue;
    }

    if (line.startsWith("\\ No newline at end of file")) {
      parsed.push({
        raw: line,
        className: "chat-diff-line-neutral",
        oldLine: null,
        newLine: null,
        isChangeContent: false,
      });
      continue;
    }

    parsed.push({
      raw: line,
      className: "chat-diff-line-neutral",
      oldLine: oldLineCursor,
      newLine: newLineCursor,
      isChangeContent: false,
    });
    oldLineCursor += 1;
    newLineCursor += 1;
  }

  return parsed;
}
