#!/usr/bin/env node

/**
 * Semantic Versioning Utility
 * Determines version bump based on conventional commits
 * and updates package.json accordingly
 */

import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

/**
 * Parse conventional commit messages to determine version bump
 * @returns {string} 'major' | 'minor' | 'patch' | 'none'
 */
async function determineVersionBump() {
  try {
    // Get commit messages since last tag
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo "0.0.0"', { 
      cwd: rootDir,
      encoding: 'utf8' 
    }).trim();
    
    const commits = execSync(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { 
      cwd: rootDir,
      encoding: 'utf8' 
    });
    
    const commitLines = commits.trim().split('\n');
    
    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;
    
    for (const commit of commitLines) {
      const match = commit.match(/^(feat|fix|docs|style|refactor|perf|test|chore)(?:\((.+)\))?: (.+)/);
      
      if (match) {
        const type = match[1];
        const message = match[3];
        
        // Check for breaking changes
        if (message.includes('BREAKING CHANGE') || message.match(/!\s*$/)) {
          hasBreaking = true;
          break; // Major bump takes precedence
        }
        
        if (type === 'feat') {
          hasFeature = true;
        } else if (type === 'fix') {
          hasFix = true;
        }
      }
    }
    
    if (hasBreaking) {
      return 'major';
    } else if (hasFeature) {
      return 'minor';
    } else if (hasFix) {
      return 'patch';
    }
    
    return 'none';
  } catch (error) {
    console.error('Error determining version bump:', error.message);
    return 'patch'; // Default to patch if we can't determine
  }
}

/**
 * Get current version from package.json
 * @returns {string} Current version
 */
async function getCurrentVersion() {
  const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
  return packageJson.version;
}

/**
 * Bump version according to semver rules
 * @param {string} currentVersion
 * @param {string} bumpType
 * @returns {string} New version
 */
function bumpVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return currentVersion;
  }
}

/**
 * Update package.json with new version
 * @param {string} newVersion
 */
async function updatePackageJson(newVersion) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  
  packageJson.version = newVersion;
  
  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated package.json to version ${newVersion}`);
}

/**
 * Main function
 */
async function main() {
  try {
    const currentVersion = await getCurrentVersion();
    console.log(`Current version: ${currentVersion}`);
    
    const bumpType = await determineVersionBump();
    console.log(`Determined version bump: ${bumpType}`);
    
    if (bumpType === 'none') {
      console.log('No version bump needed');
      return currentVersion;
    }
    
    const newVersion = bumpVersion(currentVersion, bumpType);
    console.log(`New version: ${newVersion}`);
    
    await updatePackageJson(newVersion);
    
    return newVersion;
  } catch (error) {
    console.error('Error in version bumping:', error);
    process.exit(1);
  }
}

// Export for programmatic use
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(version => {
    if (version) {
      console.log(version);
    }
  });
}

export { determineVersionBump, getCurrentVersion, bumpVersion, updatePackageJson, main };
