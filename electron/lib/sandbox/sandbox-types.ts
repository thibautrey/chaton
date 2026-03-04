// Type definitions for sandboxed command execution
export interface SandboxCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  pythonPath?: string; // Only for Python commands
}

export interface NodeAvailability {
  available: boolean;
  version?: string;
}

export interface PythonAvailability {
  available: boolean;
  version?: string;
  isVenv?: boolean;
}