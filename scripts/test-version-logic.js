// Test the version comparison logic manually
function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number)
  const currentParts = current.split('.').map(Number)

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0
    const currentPart = currentParts[i] || 0

    if (latestPart > currentPart) return true
    if (latestPart < currentPart) return false
  }

  return false
}

// Test cases
const testCases = [
  // Current, Latest, Expected Result
  ['0.63.0', '0.63.1', true],   // Patch update
  ['0.63.1', '0.64.0', true],   // Minor update  
  ['0.63.1', '1.0.0', true],    // Major update
  ['0.63.1', '0.63.1', false],  // Same version
  ['0.63.1', '0.63.0', false],  // Older version
  ['1.0.0', '0.63.1', false],   // Current is newer
  ['62', '63', true],           // Old format (should still work)
  ['v0.63.0', '0.63.1', true],  // Mixed format
];

console.log('Testing version comparison logic:');
testCases.forEach(([current, latest, expected]) => {
  const result = isNewerVersion(latest, current);
  const pass = result === expected;
  console.log(`${pass ? '✓' : '✗'} ${current} -> ${latest}: ${result} ${pass ? '' : `(expected ${expected})`}`);
});