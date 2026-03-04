/**
 * Test script for sandbox functionality
 * This can be run to verify that the sandboxing works correctly
 */

import { sandboxManager } from './sandbox-manager.js';

async function testSandbox() {
  console.log('Testing sandbox functionality...');

  try {
    // Test Node.js availability
    console.log('\n1. Testing Node.js availability:');
    const nodeAvailability = await sandboxManager.checkNodeAvailability();
    console.log('Node.js available:', nodeAvailability.available);
    if (nodeAvailability.version) {
      console.log('Node.js version:', nodeAvailability.version);
    }

    // Test Node.js command execution
    console.log('\n2. Testing Node.js command execution:');
    const nodeResult = await sandboxManager.executeNodeCommand('node', ['--version']);
    console.log('Node command success:', nodeResult.success);
    console.log('Node command output:', nodeResult.stdout);

    // Test npm command execution
    console.log('\n3. Testing npm command execution:');
    const npmResult = await sandboxManager.executeNpmCommand(['--version']);
    console.log('NPM command success:', npmResult.success);
    console.log('NPM command output:', npmResult.stdout);

    // Test Python availability
    console.log('\n4. Testing Python availability:');
    const pythonAvailability = await sandboxManager.checkPythonAvailability();
    console.log('Python available:', pythonAvailability.available);
    if (pythonAvailability.version) {
      console.log('Python version:', pythonAvailability.version);
      console.log('Using virtual env:', pythonAvailability.isVenv);
    }

    // Test Python command execution (if available)
    if (pythonAvailability.available) {
      console.log('\n5. Testing Python command execution:');
      const pythonResult = await sandboxManager.executePythonCommand(['--version']);
      console.log('Python command success:', pythonResult.success);
      console.log('Python command output:', pythonResult.stdout);
    }

    console.log('\n✅ All sandbox tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Sandbox test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSandbox();
}

export { testSandbox };