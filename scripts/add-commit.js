#!/usr/bin/env node

/**
 * Add commit message for version tracking
 * Self-contained alternative to git commits
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function main() {
  try {
    const commitMessage = process.argv[2];
    
    if (!commitMessage) {
      console.error('Usage: npm run commit "Your commit message"');
      process.exit(1);
    }
    
    const versionFilePath = path.join(rootDir, '.version-tracking.json');
    let trackingData = { commitMessages: [] };
    
    // Load existing data
    if (await fs.exists(versionFilePath)) {
      const content = await fs.readFile(versionFilePath, 'utf-8');
      trackingData = JSON.parse(content);
    }
    
    // Add new commit message
    trackingData.commitMessages.push(commitMessage);
    
    // Save updated data
    await fs.writeFile(versionFilePath, JSON.stringify(trackingData, null, 2), 'utf-8');
    
    console.log(`Added commit: ${commitMessage}`);
    console.log(`Total commits tracked: ${trackingData.commitMessages.length}`);
    
  } catch (error) {
    console.error('Error adding commit:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}