import { NodeSandbox } from './node-sandbox.js';
import { PythonSandbox } from './python-sandbox.js';

/**
 * Sandbox manager for coordinating Node.js and Python execution
 */
export class SandboxManager {
  private nodeSandbox: NodeSandbox;
  private pythonSandbox: PythonSandbox;

  constructor() {
    this.nodeSandbox = new NodeSandbox();
    this.pythonSandbox = new PythonSandbox();
  }

  /**
   * Execute Node.js command in sandboxed environment
   */
  async executeNodeCommand(
    command: string,
    args: string[] = [],
    cwd?: string,
    timeout?: number
  ) {
    return this.nodeSandbox.executeCommand(command, args, cwd, timeout);
  }

  /**
   * Execute npm command in sandboxed environment
   */
  async executeNpmCommand(args: string[], cwd?: string) {
    return this.nodeSandbox.executeNpmCommand(args, cwd);
  }

  /**
   * Execute Python command in sandboxed environment
   */
  async executePythonCommand(args: string[], cwd?: string, timeout?: number) {
    return this.pythonSandbox.executePythonCommand(args, cwd, timeout);
  }

  /**
   * Execute pip command in sandboxed environment
   */
  async executePipCommand(args: string[], cwd?: string) {
    return this.pythonSandbox.executePipCommand(args, cwd);
  }

  /**
   * Check Node.js availability
   */
  async checkNodeAvailability(): Promise<{ available: boolean; version?: string }> {
    try {
      const result = await this.nodeSandbox.executeCommand('node', ['--version']);
      if (result.success && result.stdout) {
        const versionMatch = result.stdout.match(/v(\d+\.\d+\.\d+)/);
        return {
          available: true,
          version: versionMatch?.[1]
        };
      }
    } catch {
      // Ignore errors
    }
    return { available: false };
  }

  /**
   * Check Python availability
   */
  async checkPythonAvailability(cwd?: string) {
    return this.pythonSandbox.checkPythonAvailability(cwd);
  }

  /**
   * Clean up all sandbox environments
   */
  cleanup() {
    this.nodeSandbox.cleanup();
    this.pythonSandbox.cleanup();
  }

  /**
   * Get sandbox manager instance (singleton pattern)
   */
  static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  private static instance: SandboxManager;
}

// Export singleton instance
export const sandboxManager = SandboxManager.getInstance();