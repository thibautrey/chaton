// Simple test to verify the deduplication fix
const testCases = [
  {
    name: "bash commands with different whitespace",
    toolCalls: [
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.ts" -type f -exec grep -l "projectId.*string.*null" {} \; | head -10 $', toolCallId: null },
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.ts" -type f -exec grep -l "projectId.*string.*null" {} \; | head -10$', toolCallId: null }
    ],
    expectedCount: 1
  },
  {
    name: "bash commands with same whitespace",
    toolCalls: [
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.ts" -type f', toolCallId: null },
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.ts" -type f', toolCallId: null }
    ],
    expectedCount: 1
  },
  {
    name: "different bash commands",
    toolCalls: [
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.ts"', toolCallId: null },
      { kind: 'toolCall', name: 'bash', arguments: 'find . -name "*.js"', toolCallId: null }
    ],
    expectedCount: 2
  }
];

function dedupeToolCalls(blocks) {
  const seen = new Set();
  const unique = [];

  for (const block of blocks) {
    if (block.kind !== 'toolCall') continue;
    const key = block.toolCallId ? `id:${block.toolCallId}` : `sig:${block.name}:${block.arguments.replace(/\s+/g, ' ').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(block);
  }
  return unique;
}

console.log("Testing deduplication fix...\n");

let allPassed = true;
for (const testCase of testCases) {
  const result = dedupeToolCalls(testCase.toolCalls);
  const passed = result.length === testCase.expectedCount;
  
  console.log(`Test: ${testCase.name}`);
  console.log(`  Input: ${testCase.toolCalls.length} tool calls`);
  console.log(`  Output: ${result.length} tool calls`);
  console.log(`  Expected: ${testCase.expectedCount} tool calls`);
  console.log(`  Status: ${passed ? 'PASS' : 'FAIL'}`);
  console.log();
  
  if (!passed) {
    allPassed = false;
  }
}

console.log(allPassed ? "All tests passed!" : "Some tests failed!");
