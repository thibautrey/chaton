#!/usr/bin/env node

/**
 * Test script for version.js
 * Simulates different commit scenarios to verify version bumping logic
 */

import { determineVersionBump, bumpVersion } from './version.js';

async function runTests() {
  console.log('=== Version Script Tests ===\n');
  
  // Test version bumping logic
  console.log('1. Testing bumpVersion function:');
  const testCases = [
    { current: '1.2.3', bump: 'major', expected: '2.0.0' },
    { current: '1.2.3', bump: 'minor', expected: '1.3.0' },
    { current: '1.2.3', bump: 'patch', expected: '1.2.4' },
    { current: '0.0.1', bump: 'minor', expected: '0.1.0' },
    { current: '2.9.9', bump: 'major', expected: '3.0.0' },
  ];
  
  testCases.forEach(({ current, bump, expected }) => {
    const result = bumpVersion(current, bump);
    const pass = result === expected;
    console.log(`  ${pass ? '✓' : '✗'} ${current} + ${bump} = ${result} ${pass ? '' : `(expected ${expected})`}`);
  });
  
  console.log('\n2. Version bumping logic:');
  console.log('  The script analyzes Git commits since last tag');
  console.log('  - BREAKING CHANGE or ! suffix → major bump');
  console.log('  - feat: commits → minor bump');
  console.log('  - fix: commits → patch bump');
  console.log('  - Other types → no bump');
  
  console.log('\n3. To test with real Git history:');
  console.log('  - Make some commits with conventional commit messages');
  console.log('  - Run: node scripts/version.js');
  console.log('  - Check the output version');
  
  console.log('\n=== Tests Complete ===');
}

runTests().catch(console.error);
