// electron/lib/version/version-service.ts
// Self-contained version management without git dependency

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

interface VersionInfo {
  version: string;
  lastUpdated: string;
  commitMessages: string[];
}

export class VersionService {
  private versionFilePath: string;
  
  constructor() {
    const appDataPath = app.getPath('userData');
    this.versionFilePath = path.join(appDataPath, 'version-info.json');
  }
  
  /**
   * Get current version information
   */
  getVersionInfo(): VersionInfo {
    try {
      if (fs.existsSync(this.versionFilePath)) {
        const content = fs.readFileSync(this.versionFilePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error reading version info:', error);
    }
    
    // Default version info
    return {
      version: '0.1.0',
      lastUpdated: new Date().toISOString(),
      commitMessages: []
    };
  }
  
  /**
   * Update version information
   */
  updateVersionInfo(version: string, commitMessage: string): void {
    try {
      const currentInfo = this.getVersionInfo();
      const updatedInfo: VersionInfo = {
        version: version,
        lastUpdated: new Date().toISOString(),
        commitMessages: [...currentInfo.commitMessages, commitMessage]
      };
      
      fs.writeFileSync(this.versionFilePath, JSON.stringify(updatedInfo, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error updating version info:', error);
    }
  }
  
  /**
   * Get commit messages since last version
   */
  getCommitMessagesSinceLastVersion(): string[] {
    const info = this.getVersionInfo();
    return info.commitMessages;
  }
  
  /**
   * Get the last tag/version
   */
  getLastTag(): string {
    return this.getVersionInfo().version;
  }
}