// Test script for update service version comparison
const { isNewerVersion } = require('./electron/lib/update/update-service.ts');

// Test cases
const testCases = [
  // Current, Latest, Expected Result
  ['0.63.0', '0.63.1', true],   // Patch update
  ['0.63.1', '0.64.0', true],   // Minor update
  ['0.63.1', '1.0.0', true],    // Major update
  ['0.63.1', '0.63.1', false],  // Same version
  ['0.63.1', '0.63.0', false],  // Older version
  ['1.0.0', '0.63.1', false],   // Current is newer
];

console.log('Testing version comparison:');
testCases.forEach(([current, latest, expected]) => {
  const result = isNewerVersion(latest, current);
  const pass = result === expected;
  console.log(`${pass ? '✓' : '✗'} ${current} -> ${latest}: ${result} ${pass ? '' : `(expected ${expected})`}`);
});