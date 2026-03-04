// electron/lib/git/git-service.ts
// Self-contained git operations without external git dependency

import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

/**
 * Self-contained git service that doesn't require external git installation
 */
export class GitService {
  private git: typeof git;
  
  constructor() {
    this.git = git;
  }
  
  /**
   * Check if a directory is a git repository
   */
  async isGitRepo(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, '.git');
      return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if there are uncommitted changes in working directory
   */
  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return false;
      }
      
      // Use statusMatrix to get comprehensive status information
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Check if any files have modifications (workdir != head)
      return statusMatrix.some(row => {
        const [, headStatus, workdirStatus] = row;
        return headStatus !== workdirStatus;
      });
    } catch (error) {
      console.error('Error checking uncommitted changes:', error);
      return false;
    }
  }
  
  /**
   * Check if there are staged changes
   */
  async hasStagedChanges(repoPath: string): Promise<boolean> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return false;
      }
      
      // Use statusMatrix to get comprehensive status information
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Check if any files have staged changes (stage != head)
      return statusMatrix.some(row => {
        const [, headStatus, , stageStatus] = row;
        return headStatus !== stageStatus;
      });
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
      
      await this.git.add({ fs, dir: repoPath, filepath: '.' });
    } catch (error) {
      console.error('Error staging changes:', error);
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
      
      // Use statusMatrix to find untracked files
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
      
      const branch = await this.git.currentBranch({ fs, dir: repoPath });
      // Convert void to undefined
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
      
      // Note: isomorphic-git doesn't have a built-in diff function
      // This is a placeholder that would need to be implemented
      // using git operations or an external diff library
      console.warn('getDiff not implemented - isomorphic-git does not provide diff functionality');
      return '';
    } catch (error) {
      console.error('Error getting diff:', error);
      return '';
    }
  }
  
  /**
   * Get status of all files
   */
  async getStatus(repoPath: string): Promise<Array<[string, string]>> {
    try {
      if (!await this.isGitRepo(repoPath)) {
        return [];
      }
      
      const statusMatrix = await this.git.statusMatrix({ 
        fs, 
        dir: repoPath,
        filepaths: ['.'] 
      });
      
      // Convert status matrix to more readable format
      return statusMatrix.map(row => {
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
        
        return [filepath, status];
      });
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
      
      // Use resetIndex to unstage all changes
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
      
      await this.git.checkout({ fs, dir: repoPath, ref: branch });
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
      
      await this.git.pull({ 
        fs, 
        http, 
        dir: repoPath,
        remote: remote,
        ref: branch || currentBranch,
        singleBranch: true,
        fastForward: true
      });
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
      
      await this.git.push({ 
        fs, 
        http, 
        dir: repoPath,
        remote: remote,
        ref: branch || currentBranch,
      });
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
    } catch (error) {
      console.error('Error initializing git repository:', error);
      throw error;
    }
  }
  
  /**
   * Create a worktree (simplified implementation)
   * Note: isomorphic-git doesn't have full worktree support, so this creates
   * a separate git repository instead
   */
  async createWorktree(repoPath: string, worktreePath: string, branchName: string): Promise<void> {
    try {
      // Clone the repository to create a worktree-like structure
      await this.git.clone({ 
        fs, 
        http, 
        dir: worktreePath,
        url: repoPath,
        noCheckout: false,
        depth: 1
      });
      
      // Checkout the specific branch
      if (branchName) {
        await this.git.checkout({ fs, dir: worktreePath, ref: branchName });
      }
    } catch (error) {
      console.error('Error creating worktree:', error);
      throw error;
    }
  }
}
