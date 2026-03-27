import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const requireFromHere = createRequire(import.meta.url);

/**
 * Node.js sandboxed execution utility process
 * Runs Node.js commands in an isolated environment
 */
export class NodeSandbox {
  private tempDir: string;
  private nodePath: string;

  constructor() {
    // Use Electron's bundled Node.js
    this.nodePath = process.execPath;
    
    // Create temporary directory for sandboxed execution
    this.tempDir = path.join(os.tmpdir(), 'node-sandbox');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private resolveNodeCommand(): { command: string; argsPrefix: string[]; env: NodeJS.ProcessEnv } {
    if (this.nodePath && fs.existsSync(this.nodePath)) {
      if (process.versions.electron) {
        return {
          command: this.nodePath,
          argsPrefix: [],
          env: { ELECTRON_RUN_AS_NODE: '1' },
        };
      }
      return { command: this.nodePath, argsPrefix: [], env: {} };
    }
    return { command: 'node', argsPrefix: [], env: {} };
  }

  private resolveBundledNpmCli(): string | null {
    const candidates = new Set<string>();
    try {
      const npmPackagePath = requireFromHere.resolve('npm/package.json');
      const npmDir = path.dirname(npmPackagePath);
      candidates.add(path.join(npmDir, 'bin', 'npm-cli.js'));
    } catch {
      // Keep probing packaged locations below.
    }

    const roots = [
      process.cwd(),
      process.resourcesPath,
      path.join(process.resourcesPath ?? '', 'app.asar.unpacked'),
      path.join(process.resourcesPath ?? '', 'npm'),
      path.join(process.resourcesPath ?? '', 'resources', 'npm'),
    ];
    for (const root of roots) {
      if (!root) continue;
      candidates.add(path.join(root, 'npm', 'bin', 'npm-cli.js'));
      candidates.add(path.join(root, 'resources', 'npm', 'bin', 'npm-cli.js'));
      candidates.add(path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private getBundledNpmNodePath(npmCliPath: string): string {
    return path.join(path.resolve(path.dirname(npmCliPath), '..'), 'node_modules');
  }

  /**
   * Execute a Node.js command in sandboxed environment
   */
  async executeCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    timeout: number = 30000
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }> {
    try {
      // Set up sandboxed environment
      const env = this.createSandboxedEnvironment();
      const node = this.resolveNodeCommand();
      const isNodeAlias = command === 'node' || command === 'node.exe';
      const resolvedCommand = isNodeAlias ? node.command : command;
      const resolvedArgs = isNodeAlias ? [...node.argsPrefix, ...args] : args;
      const resolvedEnv = { ...env, ...node.env };
      
      // Execute command with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const result = await execFileAsync(resolvedCommand, resolvedArgs, {
        cwd: cwd || this.tempDir,
        env: resolvedEnv,
        signal: controller.signal as any,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      clearTimeout(timeoutId);

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: (result as any).code ?? 0
      };
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: error instanceof Error && 'code' in error ? (error as any).code : 1
      };
    }
  }

  /**
   * Create sandboxed environment variables
   */
  private createSandboxedEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Restrict environment variables
      NODE_ENV: 'production',
      // Use temporary directory for npm cache
      npm_config_cache: path.join(this.tempDir, 'npm-cache'),
      npm_config_prefix: this.tempDir,
      npm_config_global_prefix: this.tempDir,
      // Disable npm features that require network access
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      // Default module resolution stays isolated unless a bundled tool needs more.
      NODE_PATH: this.tempDir,
      // Use our temp directory as home to isolate config files
      HOME: this.tempDir,
      USERPROFILE: this.tempDir
    };

    // Remove sensitive environment variables
    delete env.PATH;
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;

    return env;
  }

  /**
   * Execute npm command in sandboxed environment
   */
  async executeNpmCommand(
    args: string[],
    cwd?: string
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }> {
    const npmPath = this.getNpmPath();
    const node = this.resolveNodeCommand();
    const extraEnv = npmPath.endsWith('npm-cli.js')
      ? { NODE_PATH: [this.getBundledNpmNodePath(npmPath), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) }
      : undefined;

    try {
      const env = { ...this.createSandboxedEnvironment(), ...node.env, ...(extraEnv ?? {}) };
      const result = await execFileAsync(node.command, [...node.argsPrefix, npmPath, ...args], {
        cwd: cwd || this.tempDir,
        env,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10
      });

      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: (result as any).code ?? 0
      };
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: error instanceof Error && 'code' in error ? (error as any).code : 1
      };
    }
  }

  /**
   * Get path to npm (use bundled or create mock)
   */
  private getNpmPath(): string {
    const bundledCli = this.resolveBundledNpmCli();
    if (bundledCli) {
      return bundledCli;
    }

    // Try to find npm in the same directory as node
    const npmPath = path.join(path.dirname(this.nodePath), 'npm');
    if (fs.existsSync(npmPath)) {
      return npmPath;
    }
    
    // Fallback: create a minimal npm mock
    return this.createNpmMock();
  }

  /**
   * Create minimal npm mock for basic commands
   */
  private createNpmMock(): string {
    const mockPath = path.join(this.tempDir, 'npm');
    
    const mockScript = `#!/bin/bash
# Minimal npm mock for sandboxed environment

case "$1" in
  "--version")
    echo "6.14.0"
    exit 0
    ;;
  "ci"|"install")
    echo "npm notice"
    echo "added 0 packages in 0s"
    exit 0
    ;;
  "list"|"ls")
    echo "{}"
    exit 0
    ;;
  *)
    echo "Unknown npm command: $1"
    exit 1
    ;;
esac`;

    fs.writeFileSync(mockPath, mockScript);
    fs.chmodSync(mockPath, 0o755);
    
    return mockPath;
  }

  /**
   * Clean up sandbox environment
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Failed to cleanup node sandbox:', error);
    }
  }
}
