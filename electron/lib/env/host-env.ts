import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function buildHostToolEnv(cwd?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = env[pathKey] ?? env.PATH ?? "";
  const pathEntries = currentPath
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(
      (entry, index, array) =>
        entry.length > 0 && array.indexOf(entry) === index,
    );

  const addPathEntry = (entry: string | undefined | null) => {
    if (!entry) return;
    const trimmed = entry.trim();
    if (!trimmed) return;
    if (!pathEntries.includes(trimmed)) {
      pathEntries.push(trimmed);
    }
  };

  if (process.platform === "darwin") {
    [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/opt/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].forEach(addPathEntry);

    const home = os.homedir();
    [
      path.join(home, ".nvm", "versions", "node"),
      path.join(home, ".volta", "bin"),
      path.join(home, ".fnm"),
    ].forEach((baseDir) => {
      if (!fs.existsSync(baseDir)) return;
      addPathEntry(baseDir);
      try {
        for (const child of fs.readdirSync(baseDir)) {
          addPathEntry(path.join(baseDir, child, "bin"));
        }
      } catch {
        // Ignore unreadable directories; we still keep known host paths.
      }
    });
  } else if (process.platform === "linux") {
    [
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/local/sbin",
      "/usr/sbin",
      "/sbin",
      path.join(os.homedir(), ".local", "bin"),
      path.join(os.homedir(), ".volta", "bin"),
    ].forEach(addPathEntry);
  }

  env[pathKey] = pathEntries.join(path.delimiter);
  env.PATH = env[pathKey];
  if (cwd) {
    env.PWD = cwd;
  }
  return env;
}

export function resolveHostExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
): string {
  if (!command.trim() || command.includes(path.sep)) {
    return command;
  }

  const pathValue =
    env[process.platform === "win32" ? "Path" : "PATH"] ?? env.PATH ?? "";
  const searchDirs = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((ext) => ext.trim())
          .filter((ext) => ext.length > 0)
      : [""];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(
        dir,
        process.platform === "win32" ? `${command}${ext}` : command,
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}
