#!/usr/bin/env node

/**
 * Semantic Versioning Utility
 * Determines version bump based on conventional commits
 * and updates package.json accordingly
 * Self-contained version without git dependency
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const log = (...args) => console.error(...args);
const warn = (...args) => console.error(...args);

/**
 * Get the latest git tag that matches semver pattern
 * @returns {Promise<string>} Latest semver tag or '0.0.0' if none found
 */
async function getLatestGitTag() {
  try {
    const { execSync } = await import('child_process');
    // Get all tags sorted by version:refname, filter for semver tags
    const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(tag => tag.match(/^v?\d+\.\d+\.\d+$/));
    
    if (tags.length > 0) {
      // Remove 'v' prefix if present
      const latestTag = tags[0].replace(/^v/, '');
      log(`Found latest semver tag: ${latestTag}`);
      return latestTag;
    }
  } catch (error) {
    log('No git tags found or git not available, starting from 0.0.0');
  }
  return '0.0.0';
}

/**
 * Parse conventional commit messages to determine version bump
 * @returns {string} 'major' | 'minor' | 'patch' | 'none'
 */
async function determineVersionBump() {
  try {
    const { execSync } = await import('child_process');
    
    // Get the latest semver tag
    const latestTag = await getLatestGitTag();
    
    // Get all commits since the latest tag
    let commitMessages = [];
    try {
      // Check if the tag exists and is reachable from HEAD
      const commits = execSync(`git log ${latestTag}..HEAD --oneline --no-merges 2>/dev/null || git log --oneline --no-merges`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map(line => line.replace(/^[a-f0-9]+\s+/, ''));
      commitMessages = commits;
    } catch (error) {
      log('No new commits since last tag');
      return 'none';
    }
    
    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;
    
    for (const commit of commitMessages) {
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
    warn('Error determining version bump:', error.message);
    return 'patch'; // Default to patch if we can't determine
  }
}

/**
 * Get current version from package.json or git tags
 * @returns {Promise<string>} Current version
 */
async function getCurrentVersion() {
  // Try to get version from git tags first (for CI/CD consistency)
  const gitTagVersion = await getLatestGitTag();
  if (gitTagVersion !== '0.0.0') {
    return gitTagVersion;
  }
  
  // Fallback to package.json version
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
  log(`Updated package.json to version ${newVersion}`);
}

/**
 * Main function
 */
async function main() {
  try {
    const currentVersion = await getCurrentVersion();
    log(`Current version: ${currentVersion}`);
    
    const bumpType = await determineVersionBump();
    log(`Determined version bump: ${bumpType}`);
    
    if (bumpType === 'none') {
      log('No version bump needed');
      return currentVersion;
    }
    
    const newVersion = bumpVersion(currentVersion, bumpType);
    log(`New version: ${newVersion}`);
    
    await updatePackageJson(newVersion);
    
    // Create git tag for the new version
    try {
      const { execSync } = await import('child_process');
      execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
      log(`Created git tag: v${newVersion}`);
    } catch (tagError) {
      warn('Could not create git tag:', tagError.message);
    }
    
    return newVersion;
  } catch (error) {
    warn('Error in version bumping:', error);
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
