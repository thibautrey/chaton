import type { ParsedDiffLine } from "./types";

const DIFF_LINE_BASE_CLASS = "grid px-2 py-0.5";
const DIFF_LINE_GRID_STYLE = "[grid-template-columns:44px_44px_minmax(0,1fr)]";

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
        className: `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_GRID_STYLE}`,
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
        className: `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_GRID_STYLE} border-l-2 border-[#2f7b53] bg-[#133122] text-[#8fe2b4]${isFirst ? " outline outline-2 outline-offset-[-2px] outline-[#f5c451]" : ""}`,
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
        className: `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_GRID_STYLE} border-l-2 border-[#8f3347] bg-[#351720] text-[#f3acb8]${isFirst ? " outline outline-2 outline-offset-[-2px] outline-[#f5c451]" : ""}`,
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
        className: `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_GRID_STYLE}`,
        oldLine: null,
        newLine: null,
        isChangeContent: false,
      });
      continue;
    }

    parsed.push({
      raw: line,
      className: `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_GRID_STYLE}`,
      oldLine: oldLineCursor,
      newLine: newLineCursor,
      isChangeContent: false,
    });
    oldLineCursor += 1;
    newLineCursor += 1;
  }

  return parsed;
}
