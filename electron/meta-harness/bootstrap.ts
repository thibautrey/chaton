import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { HarnessCandidate, HarnessBootstrapResult } from "./types.js";

const execFileAsync = promisify(execFile);

function resolveShellCommand(cwd: string, maxEntriesPerDir: number): string {
  const escapedCwd = cwd.replace(/'/g, `'\\''`);
  const maxEntries = Math.max(1, maxEntriesPerDir);
  return [
    `printf 'cwd: %s\\n' \"$PWD\"`,
    `printf 'platform: %s\\n' \"${process.platform}\"`,
    `printf 'arch: %s\\n' \"${process.arch}\"`,
    `printf 'cpus: %s\\n' \"${os.cpus().length}\"`,
    `printf 'memory_gb: %.2f\\n' \"$(awk 'BEGIN { printf \"%.2f\", ${os.totalmem()} / 1024 / 1024 / 1024 }')\" 2>/dev/null || true`,
    `printf '\\n[top-level]\\n'`,
    `find '${escapedCwd}' -mindepth 1 -maxdepth 1 | sort | head -n ${maxEntries} 2>/dev/null || true`,
    `printf '\\n[git]\\n'`,
    `git rev-parse --show-toplevel 2>/dev/null || true`,
    `git status --short 2>/dev/null | head -n ${maxEntries} || true`,
    `printf '\\n[toolchain]\\n'`,
    `for cmd in node npm pnpm yarn bun python3 python go rustc cargo java javac deno php ruby git; do if command -v \"$cmd\" >/dev/null 2>&1; then printf '%s: ' \"$cmd\"; \"$cmd\" --version 2>/dev/null | head -n 1; fi; done`,
  ].join("; ");
}

export async function gatherEnvironmentSnapshot(params: {
  cwd: string;
  timeoutMs: number;
  maxEntriesPerDir: number;
}): Promise<string | null> {
  const timeoutMs = Math.max(1, Math.floor(params.timeoutMs));
  const maxEntriesPerDir = Math.max(1, Math.floor(params.maxEntriesPerDir));
  const shell = process.env.SHELL || "/bin/bash";
  const command = resolveShellCommand(params.cwd, maxEntriesPerDir);

  try {
    const { stdout, stderr } = await execFileAsync(shell, ["-lc", command], {
      cwd: params.cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 256,
    });
    const text = `${stdout ?? ""}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function applyHarnessCandidate(
  candidate: HarnessCandidate | null,
  runtimeCwd: string,
  toolsCwd: string,
): Promise<HarnessBootstrapResult> {
  const prependSections = candidate?.prompt?.prependSections ?? [];
  const appendSections = candidate?.prompt?.appendSections ?? [];
  const snapshotCfg = candidate?.bootstrap?.environmentSnapshot;
  const behaviorPrompt = candidate?.behaviorPrompt?.trim();

  if (!snapshotCfg?.enabled) {
    return {
      promptPrependSections: prependSections,
      promptAppendSections: appendSections,
      ...(behaviorPrompt ? { behaviorPrompt } : {}),
    };
  }

  const envSnapshotText = await gatherEnvironmentSnapshot({
    cwd: toolsCwd || runtimeCwd,
    timeoutMs: snapshotCfg.timeoutMs ?? 15000,
    maxEntriesPerDir: snapshotCfg.maxEntriesPerDir ?? 20,
  });

  return {
    promptPrependSections: envSnapshotText
      ? [...prependSections, `## Environment Snapshot\n${envSnapshotText}`]
      : prependSections,
    promptAppendSections: appendSections,
    ...(envSnapshotText ? { envSnapshotText } : {}),
    ...(behaviorPrompt ? { behaviorPrompt } : {}),
  };
}

export function buildHarnessPromptHints(candidate: HarnessCandidate | null): string[] {
  if (!candidate) return [];
  const hints: string[] = [];
  if (candidate.tools?.lazyDiscoveryMode === "eager") {
    hints.push(
      "Tool discovery mode is eager for this run. Prefer using already available tools directly when you know the right one.",
    );
  }
  if (candidate.tools?.lazyDiscoveryMode === "minimal") {
    hints.push(
      "Tool discovery mode is minimal for this run. Search for tools sparingly and prefer core tools unless discovery is necessary.",
    );
  }
  if (candidate.tools?.subagentPolicy === "encourage") {
    hints.push(
      "This harness encourages subagents for multi-part work when delegation can reduce latency or improve focus.",
    );
  }
  if (candidate.tools?.subagentPolicy === "restrict") {
    hints.push(
      "This harness restricts subagent use. Prefer solving the task in the main runtime unless delegation is clearly required.",
    );
  }
  if (hints.length === 0) return [];
  return [`## Harness Policy\n${hints.map((hint) => `- ${hint}`).join("\n")}`];
}

export function sanitizeBenchmarkId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "default";
}

export function resolveBenchmarkWorkspace(root: string, taskWorkingDirectory?: string): string {
  if (!taskWorkingDirectory) return root;
  return path.isAbsolute(taskWorkingDirectory)
    ? taskWorkingDirectory
    : path.resolve(root, taskWorkingDirectory);
}
