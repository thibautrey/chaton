import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getDb } from "../db/index.js";
import { listProjects } from "../db/repos/projects.js";

const execFileAsync = promisify(execFile);

type ResolveConversationRepoPath = (
  conversationId: string,
) => Promise<{ ok: true; repoPath: string } | { ok: false; reason: string }>;

type GetGlobalWorkspaceDir = () => string;

export async function searchProjectFiles(
  query: string,
  conversationId: string | null,
  projectId: string | null,
  deps: {
    resolveConversationRepoPath: ResolveConversationRepoPath;
    getGlobalWorkspaceDir: GetGlobalWorkspaceDir;
  },
  limit: number = 20,
): Promise<{ ok: true; files: string[] } | { ok: false; reason: string }> {
  let repoPath: string | null = null;

  if (conversationId) {
    const resolved = await deps.resolveConversationRepoPath(conversationId);
    if (resolved.ok) repoPath = resolved.repoPath;
  }

  if (!repoPath && projectId) {
    const db = getDb();
    const project = listProjects(db).find((p) => p.id === projectId);
    if (project) repoPath = project.repo_path;
  }

  if (!repoPath) {
    repoPath = deps.getGlobalWorkspaceDir();
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard"],
      { cwd: repoPath, maxBuffer: 10 * 1024 * 1024, timeout: 5000 },
    );
    const allFiles = stdout.split("\n").filter(Boolean);
    if (!query) {
      return { ok: true, files: allFiles.slice(0, limit) };
    }
    const lowerQuery = query.toLowerCase();
    const segments = lowerQuery.split(/[\s/\\]+/).filter(Boolean);
    const scored = allFiles
      .map((file) => {
        const lower = file.toLowerCase();
        let score = 0;
        for (const seg of segments) {
          const idx = lower.indexOf(seg);
          if (idx === -1) return null;
          const basename = lower.slice(lower.lastIndexOf("/") + 1);
          score += basename.includes(seg) ? 2 : 1;
        }
        score += 1 / (file.length + 1);
        return { file, score };
      })
      .filter(Boolean) as { file: string; score: number }[];
    scored.sort((a, b) => b.score - a.score);
    return { ok: true, files: scored.slice(0, limit).map((s) => s.file) };
  } catch {
    try {
      const walk = async (dir: string, prefix: string): Promise<string[]> => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const results: string[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            results.push(...(await walk(path.join(dir, entry.name), rel)));
          } else {
            results.push(rel);
          }
          if (results.length > 5000) break;
        }
        return results;
      };
      const allFiles = await walk(repoPath, "");
      if (!query) {
        return { ok: true, files: allFiles.slice(0, limit) };
      }
      const lowerQuery = query.toLowerCase();
      const segments = lowerQuery.split(/[\s/\\]+/).filter(Boolean);
      const scored = allFiles
        .map((file) => {
          const lower = file.toLowerCase();
          let score = 0;
          for (const seg of segments) {
            if (!lower.includes(seg)) return null;
            const basename = lower.slice(lower.lastIndexOf("/") + 1);
            score += basename.includes(seg) ? 2 : 1;
          }
          score += 1 / (file.length + 1);
          return { file, score };
        })
        .filter(Boolean) as { file: string; score: number }[];
      scored.sort((a, b) => b.score - a.score);
      return { ok: true, files: scored.slice(0, limit).map((s) => s.file) };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  }
}
