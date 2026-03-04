import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const execFileAsync = promisify(execFile);

/**
 * Python sandboxed execution using virtual environments
 * Detects and uses project-specific virtual environments
 */
export class PythonSandbox {
  private tempDir: string;

  constructor() {
    // Create temporary directory for sandboxed execution
    this.tempDir = path.join(os.tmpdir(), 'python-sandbox');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Execute Python command using virtual environment if available
   */
  async executePythonCommand(
    args: string[],
    cwd?: string,
    timeout: number = 30000
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    pythonPath?: string;
  }> {
    try {
      const workingDir = cwd || process.cwd();
      
      // Detect virtual environment
      const venvInfo = this.detectVirtualEnv(workingDir);
      const pythonPath = venvInfo?.pythonPath || await this.findSystemPython();

      if (!pythonPath) {
        return {
          success: false,
          stdout: '',
          stderr: 'Python not found in system or virtual environment',
          exitCode: 1
        };
      }

      // Set up environment
      const env = this.createSandboxedEnvironment(venvInfo, workingDir);

      // Execute command with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const result = await execFileAsync(pythonPath, args, {
        cwd: workingDir,
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
        exitCode: (result as any).code ?? 0,
        pythonPath
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
   * Detect virtual environment in the given directory
   */
  private detectVirtualEnv(workingDir: string): { pythonPath: string; isVenv: boolean } | null {
    // Check for common virtual environment locations
    const venvPaths = [
      path.join(workingDir, 'venv', 'bin', 'python'),
      path.join(workingDir, '.venv', 'bin', 'python'),
      path.join(workingDir, 'env', 'bin', 'python'),
      path.join(workingDir, 'venv', 'Scripts', 'python.exe'), // Windows
      path.join(workingDir, '.venv', 'Scripts', 'python.exe'), // Windows
      path.join(workingDir, 'env', 'Scripts', 'python.exe') // Windows
    ];

    for (const pythonPath of venvPaths) {
      if (fs.existsSync(pythonPath)) {
        return {
          pythonPath,
          isVenv: true
        };
      }
    }

    // Check for virtual environment activation markers
    const venvMarkers = [
      path.join(workingDir, 'venv', 'pyvenv.cfg'),
      path.join(workingDir, '.venv', 'pyvenv.cfg'),
      path.join(workingDir, 'env', 'pyvenv.cfg')
    ];

    for (const marker of venvMarkers) {
      if (fs.existsSync(marker)) {
        // Try to find python executable in the same venv
        const venvDir = path.dirname(marker);
        const binDir = path.join(venvDir, path.basename(venvDir) === 'venv' ? 'bin' : 'Scripts');
        const pythonPath = path.join(binDir, process.platform === 'win32' ? 'python.exe' : 'python');
        if (fs.existsSync(pythonPath)) {
          return {
            pythonPath,
            isVenv: true
          };
        }
      }
    }

    return null;
  }

  /**
   * Find system Python installation
   */
  private async findSystemPython(): Promise<string | null> {
    const candidates = process.platform === 'win32' 
      ? ['python.exe', 'python3.exe', 'py.exe']
      : ['python3', 'python', 'python3.12', 'python3.11', 'python3.10'];

    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ['--version']);
        return candidate;
      } catch {
        // Try next candidate
      }
    }

    return null;
  }

  /**
   * Create sandboxed environment for Python execution
   */
  private createSandboxedEnvironment(
    venvInfo: { pythonPath: string; isVenv: boolean } | null,
    workingDir: string
  ): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Restrict environment variables
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      // Use temporary directory for pip cache
      PIP_CACHE_DIR: path.join(this.tempDir, 'pip-cache'),
      // Isolate user site packages
      PYTHONNOUSERSITE: '1',
      // Use working directory as base
      PWD: workingDir
    };

    // If using virtual environment, set VIRTUAL_ENV
    if (venvInfo?.isVenv) {
      const venvDir = path.dirname(path.dirname(venvInfo.pythonPath));
      env.VIRTUAL_ENV = venvDir;
      
      // Add venv bin directory to PATH
      const binDir = path.dirname(venvInfo.pythonPath);
      env.PATH = `${binDir}${path.delimiter}${env.PATH || ''}`;
    }

    // Remove sensitive environment variables
    delete env.PYTHONPATH;
    delete env.CONDA_PREFIX;
    delete env.CONDA_DEFAULT_ENV;

    return env;
  }

  /**
   * Execute pip command in the appropriate environment
   */
  async executePipCommand(
    args: string[],
    cwd?: string
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }> {
    const result = await this.executePythonCommand(['-m', 'pip', ...args], cwd);
    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    };
  }

  /**
   * Check if Python is available
   */
  async checkPythonAvailability(cwd?: string): Promise<{
    available: boolean;
    version?: string;
    isVenv?: boolean;
  }> {
    try {
      const result = await this.executePythonCommand(['--version'], cwd);
      if (result.success && result.stdout) {
        const versionMatch = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
        const venvInfo = cwd ? this.detectVirtualEnv(cwd) : null;
        
        return {
          available: true,
          version: versionMatch?.[1],
          isVenv: !!venvInfo?.isVenv
        };
      }
    } catch {
      // Ignore errors
    }

    return { available: false };
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
      console.warn('Failed to cleanup python sandbox:', error);
    }
  }
}