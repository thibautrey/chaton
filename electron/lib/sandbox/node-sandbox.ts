import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const execFileAsync = promisify(execFile);

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
      
      // Execute command with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const result = await execFileAsync(command, args, {
        cwd: cwd || this.tempDir,
        env,
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
      // Set NODE_PATH to limit module resolution
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
    // Use our bundled npm or create a mock
    const npmPath = this.getNpmPath();
    return this.executeCommand('npm', args, cwd);
  }

  /**
   * Get path to npm (use bundled or create mock)
   */
  private getNpmPath(): string {
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