// electron/lib/git/git-service.ts
// Self-contained git operations without external git dependency

import fs from 'fs';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

const execFileAsync = promisify(execFile);

/**
 * Self-contained git service that doesn't require external git installation
 */
export class GitService {
  private git: typeof git;
  private statusCache: Map<string, { timestamp: number; status: Array<[string, string]> }>;
  private CACHE_TTL_MS: number;
  
  constructor() {
    this.git = git;
    this.statusCache = new Map();
    this.CACHE_TTL_MS = 5000; // 5 seconds cache
  }

  /**
   * Public method to access git.statusMatrix
   * Optimized to use native git when available for better performance
   */
  async getStatusMatrix(options: any): Promise<any> {
    const { fs, dir, filepaths } = options;
    
    // Check if this is a request for the entire repository
    if (Array.isArray(filepaths) && filepaths.length === 1 && filepaths[0] === '.') {
      // Try to use native git for full repository scans
      if (await this.isGitRepo(dir) && await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', dir, 'status', '--porcelain']);
          const lines = result.stdout.trim().split('\n');
          
          // Convert porcelain format to status matrix format
          return lines.map(line => {
            const [status, ...fileParts] = line.trim().split(/\s+/);
            const filepath = fileParts.join(' ');
            
            // Map porcelain status to status matrix format [filepath, headStatus, workdirStatus, stageStatus]
            // Head status: 1 = tracked, 0 = untracked
            // Workdir status: 2 = modified, 1 = added, 0 = deleted
            // Stage status: 2 = staged, 1 = staged (modified), 0 = not staged
            
            let headStatus = 1; // tracked by default
            let workdirStatus = 0; // no change by default
            let stageStatus = 0; // not staged by default
            
            if (status.startsWith('A')) {
              // Added (staged)
              headStatus = 0;
              workdirStatus = 1;
              stageStatus = 2;
            } else if (status.startsWith('M')) {
              // Modified
              if (status.length > 1 && status[1] === 'M') {
                // Staged and modified
                workdirStatus = 2;
                stageStatus = 2;
              } else {
                // Just modified (not staged)
                workdirStatus = 2;
              }
            } else if (status.startsWith('D')) {
              // Deleted
              workdirStatus = 0;
              stageStatus = 2;
            } else if (status.startsWith('??')) {
              // Untracked
              headStatus = 0;
              workdirStatus = 2;
            }
            
            return [filepath, headStatus, workdirStatus, stageStatus];
          });
        } catch (error) {
          console.warn('Native git status failed, falling back to isomorphic-git');
        }
      }
    }
    
    // Fallback to isomorphic-git
    return this.git.statusMatrix(options);
  }
  
  /**
   * Check if a directory is a git repository
   */
  async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, '.git');
      if (!fs.existsSync(gitDir)) {
        return false;
      }

      const stat = fs.statSync(gitDir);
      return stat.isDirectory() || stat.isFile();
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if there are uncommitted changes in working directory
   * Optimized to avoid full repository scan for performance
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return false;
      }
      
      // Check cache first for quick response
      const cacheKey = `status:${repoPath}`;
      const cached = this.statusCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        // Check if any files have modifications (excluding just staged changes)
        return cached.status.some(([_, status]) => 
          status === 'modified' || status === 'untracked' || status === 'deleted' || status === 'added'
        );
      }
      
      // First try a quick check using git status --porcelain
      // This is much faster than scanning all files with statusMatrix
      if (await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', repoPath, 'status', '--porcelain']);
          const hasChanges = result.stdout.trim().length > 0;
          // Cache the result for future calls
          if (hasChanges) {
            // Parse the output to build a simple cache
            const lines = result.stdout.trim().split('\n');
            const status = lines.map(line => {
              const [status, ...fileParts] = line.trim().split(/\s+/);
              const filepath = fileParts.join(' ');
              if (status.startsWith('A')) return [filepath, 'added'] as [string, string];
              if (status.startsWith('M')) return [filepath, 'modified'] as [string, string];
              if (status.startsWith('D')) return [filepath, 'deleted'] as [string, string];
              if (status.startsWith('??')) return [filepath, 'untracked'] as [string, string];
              return [filepath, 'unknown'] as [string, string];
            });
            this.statusCache.set(cacheKey, { timestamp: Date.now(), status });
          }
          return hasChanges;
        } catch (error) {
          // Fall through to isomorphic-git method
        }
      }
      
      // Fallback: Use statusMatrix but with a more targeted approach
      // Limit to root directory first, then check subdirectories only if needed
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Check if any files have modifications (workdir != head)
      const hasChanges = statusMatrix.some(row => {
        const [, headStatus, workdirStatus] = row;
        return headStatus !== workdirStatus;
      });
      
      // Cache the result if there are changes
      if (hasChanges) {
        const status = statusMatrix.map(row => {
          const [filepath, headStatus, workdirStatus] = row;
          if (headStatus === 0 && workdirStatus === 2) return [filepath, 'untracked'] as [string, string];
          if (headStatus === 1 && workdirStatus === 2) return [filepath, 'modified'] as [string, string];
          if (headStatus === 1 && workdirStatus === 0) return [filepath, 'deleted'] as [string, string];
          if (headStatus === 0 && workdirStatus === 1) return [filepath, 'added'] as [string, string];
          return [filepath, 'unknown'] as [string, string];
        });
        this.statusCache.set(cacheKey, { timestamp: Date.now(), status });
      }
      
      return hasChanges;
    } catch (error) {
      console.error('Error checking uncommitted changes:', error);
      return false;
    }
  }
  
  /**
   * Check if there are staged changes
   * Optimized to avoid full repository scan for performance
   */
  async hasStagedChanges(repoPath: string): Promise<boolean> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return false;
      }
      
      // Check cache first for quick response
      const cacheKey = `status:${repoPath}`;
      const cached = this.statusCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        // Check if any files are staged
        return cached.status.some(([_, status]) => 
          status === 'staged' || status === 'added'
        );
      }
      
      // First try a quick check using git diff --cached
      // This is much faster than scanning all files with statusMatrix
      if (await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', repoPath, 'diff', '--cached', '--name-only']);
          const hasStaged = result.stdout.trim().length > 0;
          // Cache the result for future calls
          if (hasStaged) {
            const lines = result.stdout.trim().split('\n');
            const status = lines.map(filepath => [filepath, 'staged'] as [string, string]);
            this.statusCache.set(cacheKey, { timestamp: Date.now(), status });
          }
          return hasStaged;
        } catch (error) {
          // Fall through to isomorphic-git method
        }
      }
      
      // Fallback: Use statusMatrix but with a more targeted approach
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Check if any files have staged changes (stage != head)
      const hasStaged = statusMatrix.some(row => {
        const [, headStatus, , stageStatus] = row;
        return headStatus !== stageStatus;
      });
      
      // Cache the result if there are staged changes
      if (hasStaged) {
        const status = statusMatrix
          .filter(row => {
            const [, headStatus, , stageStatus] = row;
            return headStatus !== stageStatus;
          })
          .map(row => [row[0], 'staged'] as [string, string]);
        this.statusCache.set(cacheKey, { timestamp: Date.now(), status });
      }
      
      return hasStaged;
    } catch (error) {
      console.error('Error checking staged changes:', error);
      return false;
    }
  }
  
  /**
   * Stage all changes in working directory
   */
  async addAll(repoPath: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return;
      }

      if (await this.isNativeGitAvailable()) {
        try {
          await execFileAsync('git', ['-C', repoPath, 'add', '-A']);
          this.clearCache(repoPath);
          return;
        } catch (error) {
          console.warn('Native git add -A failed, falling back to isomorphic-git');
        }
      }
      
      await this.git.add({ fs, dir: repoPath, filepath: '.' });
      this.clearCache(repoPath); // Clear cache after staging changes
    } catch (error) {
      console.error('Error staging changes:', error);
      throw error;
    }
  }

  async stageFile(repoPath: string, filepath: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return;
      }

      const normalizedPath = filepath.trim();
      if (!normalizedPath) {
        return;
      }

      if (await this.isNativeGitAvailable()) {
        await execFileAsync('git', ['-C', repoPath, 'add', '--', normalizedPath]);
        this.clearCache(repoPath);
        return;
      }

      await this.git.add({ fs, dir: repoPath, filepath: normalizedPath });
      this.clearCache(repoPath);
    } catch (error) {
      console.error('Error staging file:', error);
      throw error;
    }
  }

  async unstageFile(repoPath: string, filepath: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return;
      }

      const normalizedPath = filepath.trim();
      if (!normalizedPath) {
        return;
      }

      if (await this.isNativeGitAvailable()) {
        await execFileAsync('git', ['-C', repoPath, 'reset', 'HEAD', '--', normalizedPath]);
        this.clearCache(repoPath);
        return;
      }

      await this.git.resetIndex({ fs, dir: repoPath, filepath: normalizedPath });
      this.clearCache(repoPath);
    } catch (error) {
      console.error('Error unstaging file:', error);
      throw error;
    }
  }

  async commit(repoPath: string, message: string): Promise<string> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        throw new Error('Not a git repository');
      }

      const trimmedMessage = message.trim();
      if (!trimmedMessage) {
        throw new Error('Commit message is required');
      }

      if (await this.isNativeGitAvailable()) {
        const result = await execFileAsync('git', ['-C', repoPath, 'commit', '-m', trimmedMessage]);
        this.clearCache(repoPath);
        const stdout = result.stdout || '';
        const match = stdout.match(/\[.+?\s+([0-9a-f]{7,})\]/i);
        if (match?.[1]) {
          return match[1];
        }
      }

      const sha = await this.git.commit({
        fs,
        dir: repoPath,
        message: trimmedMessage,
        author: {
          name: 'Chatons',
          email: 'chatons@example.com',
        },
      });
      this.clearCache(repoPath);
      return sha.slice(0, 7);
    } catch (error) {
      console.error('Error committing changes:', error);
      throw error;
    }
  }
  
  /**
   * Clean untracked files from working directory
   */
  async clean(repoPath: string, dryRun = false): Promise<string[]> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return [];
      }
      
      // Use native git for better performance if available
      if (await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', repoPath, 'clean', dryRun ? '-n' : '-f', '-d']);
          if (dryRun) {
            // Parse the output to get list of files that would be removed
            const lines = result.stdout.trim().split('\n');
            return lines.filter(line => line.trim().length > 0);
          }
          return []; // Actual clean doesn't return file list
        } catch (error) {
          console.warn('Native git clean failed, falling back to isomorphic-git');
        }
      }
      
      // Fallback: Use statusMatrix to find untracked files
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Files are untracked if headStatus is 0 but workdirStatus is 2
      const untrackedFiles = statusMatrix
        .filter(row => {
          const [, headStatus, workdirStatus] = row;
          return headStatus === 0 && workdirStatus === 2;
        })
        .map(row => row[0]);
      
      if (!dryRun) {
        // Remove untracked files
        for (const file of untrackedFiles) {
          const filePath = path.join(repoPath, file);
          try {
            await fs.promises.unlink(filePath);
          } catch (error) {
            // Ignore errors for files that don't exist
            console.warn(`Could not delete ${filePath}:`, error);
          }
        }
      }
      
      return untrackedFiles;
    } catch (error) {
      console.error('Error cleaning untracked files:', error);
      return [];
    }
  }
  
  /**
   * Get the current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string | undefined> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return undefined;
      }

      if (await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', repoPath, 'branch', '--show-current']);
          const branch = result.stdout.trim();
          if (branch) {
            return branch;
          }
        } catch (error) {
          console.warn('Native git current branch failed, falling back to isomorphic-git');
        }
      }
      
      const branch = await this.git.currentBranch({ fs, dir: repoPath });
      return branch ?? undefined;
    } catch (error) {
      console.error('Error getting current branch:', error);
      return undefined;
    }
  }
  
  /**
   * Get list of branches
   */
  async getBranches(repoPath: string): Promise<string[]> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return [];
      }
      
      const branches = await this.git.listBranches({ fs, dir: repoPath });
      return branches || [];
    } catch (error) {
      console.error('Error getting branches:', error);
      return [];
    }
  }
  
  /**
   * Get commit history
   */
  async getLog(repoPath: string, limit = 10): Promise<any[]> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return [];
      }
      
      const log = await this.git.log({ fs, dir: repoPath, depth: limit });
      return log || [];
    } catch (error) {
      console.error('Error getting commit log:', error);
      return [];
    }
  }
  
  /**
   * Get diff for a specific file or all changes
   */
  async getDiff(repoPath: string, filepath?: string): Promise<string> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return '';
      }
      
      // Try to use native git if available for better diff functionality
      if (await this.isNativeGitAvailable()) {
        const args = ['-C', repoPath, 'diff'];
        if (filepath) {
          args.push('--', filepath);
        }
        try {
          const result = await execFileAsync('git', args);
          return result.stdout || '';
        } catch (error) {
          console.warn('Native git diff failed, falling back to basic implementation');
        }
      }
      
      // Fallback: basic implementation using isomorphic-git
      // Note: isomorphic-git doesn't have full diff functionality
      console.warn('getDiff using fallback - consider installing native git for full functionality');
      return '';
    } catch (error) {
      console.error('Error getting diff:', error);
      return '';
    }
  }
  
  /**
   * Get diff for staged changes (changes added to index)
   */
  async getStagedDiff(repoPath: string, filepath?: string): Promise<string> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return '';
      }
      
      // Use native git if available
      if (await this.isNativeGitAvailable()) {
        const args = ['-C', repoPath, 'diff', '--cached'];
        if (filepath) {
          args.push('--', filepath);
        }
        try {
          const result = await execFileAsync('git', args);
          return result.stdout || '';
        } catch (error) {
          console.warn('Native git diff --cached failed');
        }
      }
      
      console.warn('getStagedDiff using fallback - consider installing native git for full functionality');
      return '';
    } catch (error) {
      console.error('Error getting staged diff:', error);
      return '';
    }
  }
  
  /**
   * Get combined diff for both staged and unstaged changes
   */
  async getCombinedDiff(repoPath: string, filepath?: string): Promise<string> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return '';
      }
      
      // Use native git if available
      if (await this.isNativeGitAvailable()) {
        const args = ['-C', repoPath, 'diff', 'HEAD'];
        if (filepath) {
          args.push('--', filepath);
        }
        try {
          const result = await execFileAsync('git', args);
          return result.stdout || '';
        } catch (error) {
          console.warn('Native git diff HEAD failed');
        }
      }
      
      // Fallback: Try to use status information to provide some context
      // This won't be a full diff but can indicate what files changed
      const status = await this.getStatus(repoPath);
      if (status.length > 0) {
        const changedFiles = status
          .filter(([_, status]) => status !== 'unmodified')
          .map(([filepath]) => filepath);
        if (filepath && changedFiles.includes(filepath)) {
          return `[Diff not available without native git - file ${filepath} has ${status.find(([f]) => f === filepath)?.[1] || 'unknown'} changes]`;
        } else if (!filepath) {
          return `[Diff not available without native git - ${changedFiles.length} file(s) changed: ${changedFiles.join(', ')}]`;
        }
      }
      
      return '';
    } catch (error) {
      console.error('Error getting combined diff:', error);
      return '';
    }
  }
  
  /**
   * Get status of all files
   * Optimized to use native git when available for better performance
   */
  async getStatus(repoPath: string): Promise<Array<[string, string]>> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return [];
      }
      
      // Check cache first
      const cacheKey = `status:${repoPath}`;
      const cached = this.statusCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.status;
      }
      
      let statusResult: Array<[string, string]> = [];
      
      // Use native git for better performance if available
      if (await this.isNativeGitAvailable()) {
        try {
          const result = await execFileAsync('git', ['-C', repoPath, 'status', '--porcelain']);
          const lines = result.stdout.trim().split('\n');
          statusResult = lines.map(line => {
            const [status, ...fileParts] = line.trim().split(/\s+/);
            const filepath = fileParts.join(' ');
            // Map porcelain status to our format
            if (status.startsWith('A')) return [filepath, 'added'] as [string, string];
            if (status.startsWith('M')) return [filepath, 'modified'] as [string, string];
            if (status.startsWith('D')) return [filepath, 'deleted'] as [string, string];
            if (status.startsWith('R')) return [filepath, 'renamed'] as [string, string];
            if (status.startsWith('C')) return [filepath, 'copied'] as [string, string];
            if (status.startsWith('U')) return [filepath, 'unmerged'] as [string, string];
            if (status.startsWith('??')) return [filepath, 'untracked'] as [string, string];
            return [filepath, 'unknown'] as [string, string];
          });
        } catch (error) {
          console.warn('Native git status failed, falling back to isomorphic-git');
        }
      }
      
      // Fallback: Use isomorphic-git statusMatrix if native git failed or not available
      if (statusResult.length === 0) {
        const statusMatrix = await this.git.statusMatrix({ 
          fs, 
          dir: repoPath,
          filepaths: ['.'] 
        });
        
        // Convert status matrix to more readable format
        statusResult = statusMatrix.map(row => {
          const [filepath, headStatus, workdirStatus, stageStatus] = row;
          
          // Determine status based on the matrix values
          let status = 'unmodified';
          if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
            status = 'untracked';
          } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
            status = 'modified';
          } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
            status = 'staged';
          } else if (headStatus === 1 && workdirStatus === 0) {
            status = 'deleted';
          } else if (headStatus === 0 && workdirStatus === 0) {
            status = 'absent';
          }
          
          return [filepath, status] as [string, string];
        });
      }
      
      // Cache the result
      this.statusCache.set(cacheKey, { timestamp: Date.now(), status: statusResult });
      return statusResult;
    } catch (error) {
      console.error('Error getting status:', error);
      return [];
    }
  }
  
  /**
   * Reset staged changes
   */
  async reset(repoPath: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return;
      }
      
      // Use native git for better performance if available
      if (await this.isNativeGitAvailable()) {
        try {
          await execFileAsync('git', ['-C', repoPath, 'reset']);
          this.clearCache(repoPath);
          return;
        } catch (error) {
          console.warn('Native git reset failed, falling back to isomorphic-git');
        }
      }
      
      // Fallback: Use resetIndex to unstage all changes
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Unstage all files that are staged
      for (const row of statusMatrix) {
        const [filepath, , , stageStatus] = row;
        if (stageStatus !== 0) { // If staged
          try {
            await this.git.resetIndex({ fs, dir: repoPath, filepath });
          } catch (error) {
            console.warn(`Could not reset ${filepath}:`, error);
          }
        }
      }
      this.clearCache(repoPath);
    } catch (error) {
      console.error('Error resetting changes:', error);
      throw error;
    }
  }
  
  /**
   * Checkout a branch
   */
  async checkout(repoPath: string, branch: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        throw new Error('Not a git repository');
      }

      if (await this.isNativeGitAvailable()) {
        try {
          await execFileAsync('git', ['-C', repoPath, 'checkout', branch]);
          this.clearCache(repoPath);
          return;
        } catch (error) {
          console.warn('Native git checkout failed, falling back to isomorphic-git');
        }
      }
      
      await this.git.checkout({ fs, dir: repoPath, ref: branch });
      this.clearCache(repoPath); // Clear cache after checkout
    } catch (error) {
      console.error('Error checking out branch:', error);
      throw error;
    }
  }
  
  /**
   * Pull changes from remote
   */
  async pull(repoPath: string, remote = 'origin', branch?: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        throw new Error('Not a git repository');
      }
      
      const currentBranch = await this.getCurrentBranch(repoPath);
      if (!currentBranch && !branch) {
        throw new Error('No current branch and no branch specified');
      }

      if (await this.isNativeGitAvailable()) {
        try {
          await execFileAsync('git', ['-C', repoPath, 'pull', remote, branch || currentBranch!]);
          this.clearCache(repoPath);
          return;
        } catch (error) {
          console.warn('Native git pull failed, falling back to isomorphic-git');
        }
      }
      
      await this.git.pull({ 
        fs, 
        http, 
        dir: repoPath,
        remote: remote,
        ref: branch || currentBranch,
        singleBranch: true,
        fastForward: true
      });
      this.clearCache(repoPath); // Clear cache after pull
    } catch (error) {
      console.error('Error pulling changes:', error);
      throw error;
    }
  }
  
  /**
   * Push changes to remote
   */
  async push(repoPath: string, remote = 'origin', branch?: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        throw new Error('Not a git repository');
      }
      
      const currentBranch = await this.getCurrentBranch(repoPath);
      if (!currentBranch && !branch) {
        throw new Error('No current branch and no branch specified');
      }

      if (await this.isNativeGitAvailable()) {
        try {
          await execFileAsync('git', ['-C', repoPath, 'push', '--set-upstream', remote, branch || currentBranch!]);
          this.clearCache(repoPath);
          return;
        } catch (error) {
          console.warn('Native git push failed, falling back to isomorphic-git');
        }
      }
      
      await this.git.push({ 
        fs, 
        http, 
        dir: repoPath,
        remote: remote,
        ref: branch || currentBranch,
      });
      this.clearCache(repoPath); // Clear cache after push
    } catch (error) {
      console.error('Error pushing changes:', error);
      throw error;
    }
  }
  
  /**
   * Initialize a new git repository
   */
  async init(repoPath: string): Promise<void> {
    try {
      await this.git.init({ fs, dir: repoPath });
      this.clearCache(repoPath); // Clear cache after init
    } catch (error) {
      console.error('Error initializing git repository:', error);
      throw error;
    }
  }
  
  /**
   * Create a worktree.
   * Strategy:
   * 1) Prefer native `git worktree add` when git is available.
   * 2) Fallback to local clone with isomorphic-git for environments without git.
   */
  async createWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        throw new Error(`Not a git repository: ${repoPath}`);
      }

      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
      const branch = branchName?.trim() || `chaton/worktree-${Date.now()}`;

      if (await this.isNativeGitAvailable()) {
        // -B creates or resets the branch at HEAD for this new worktree.
        await execFileAsync('git', [
          '-C',
          repoPath,
          'worktree',
          'add',
          '-B',
          branch,
          worktreePath,
          'HEAD',
        ]);
        this.clearCache(worktreePath); // Clear cache for the new worktree
        return;
      }

      const fileUrl = this.toFileUrl(repoPath);
      await this.git.clone({
        fs,
        http,
        dir: worktreePath,
        url: fileUrl,
        noCheckout: false,
      });

      try {
        await this.git.checkout({
          fs,
          dir: worktreePath,
          ref: branch,
          force: true,
        });
      } catch {
        // Branch does not exist yet in clone: create it from current HEAD.
        await this.git.branch({
          fs,
          dir: worktreePath,
          ref: branch,
          checkout: true,
        });
      }
      this.clearCache(worktreePath); // Clear cache for the new worktree
    } catch (error) {
      console.error('Error creating worktree:', error);
      throw error;
    }
  }

  async isNativeGitAvailable(): Promise<boolean> {
    try {
      await execFileAsync('git', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async resolveDefaultBranch(repoPath: string): Promise<string | undefined> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return undefined;
      }

      if (await this.isNativeGitAvailable()) {
        const commands: string[][] = [
          ['-C', repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD'],
          ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'],
        ];

        for (const args of commands) {
          try {
            const result = await execFileAsync('git', args);
            const value = result.stdout.trim();
            if (!value) {
              continue;
            }
            const branch = value.replace(/^refs\/remotes\/origin\//, '');
            if (branch && branch !== 'HEAD') {
              return branch;
            }
          } catch {
            // Try next strategy.
          }
        }
      }

      const currentBranch = await this.getCurrentBranch(repoPath);
      if (currentBranch) {
        return currentBranch;
      }

      const branches = await this.getBranches(repoPath);
      if (branches.includes('main')) return 'main';
      if (branches.includes('master')) return 'master';
      return branches[0];
    } catch (error) {
      console.error('Error resolving default branch:', error);
      return undefined;
    }
  }

  private toFileUrl(localPath: string): string {
    const normalized = path.resolve(localPath).replace(/\\/g, '/');
    return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
  }
  
  /**
   * Clear cache for a specific repository
   */
  clearCache(repoPath: string): void {
    const cacheKey = `status:${repoPath}`;
    this.statusCache.delete(cacheKey);
  }
  
  /**
   * Clear all cached status information
   */
  clearAllCache(): void {
    this.statusCache.clear();
  }
  
  /**
   * Check if cache should be invalidated due to potential external changes
   * This can be called before operations to ensure cache freshness
   */
  async shouldInvalidateCache(repoPath: string): Promise<boolean> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return false;
      }
      
      // For now, we don't have file system watching, so we rely on TTL
      // In future, this could check file modification times or use FS events
      return false;
    } catch (error) {
      return false;
    }
  }
}
