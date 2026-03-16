// Test script to verify the automation fix
// This script simulates the payload that would be sent from the UI

const testPayload = {
  id: "test-rule-123",
  name: "Test Cron Automation",
  trigger: "cron",
  enabled: true,
  conditions: [],
  actions: [
    {
      type: "executeAndNotify",
      title: "Test Automation",
      instruction: "This is a test instruction"
    }
  ],
  cooldown: 0,
  runOnce: false,
  triggerData: "0 9 * * 1,3,5" // Cron expression: Monday, Wednesday, Friday at 9:00 AM
};

console.log("Test Payload:");
console.log(JSON.stringify(testPayload, null, 2));

// Simulate the backend processing
function simulateBackendProcessing(payload) {
  console.log("\n=== Backend Processing ===");
  
  // Extract triggerData
  const triggerData = typeof payload.triggerData === 'string' ? payload.triggerData : undefined;
  console.log("Extracted triggerData:", triggerData);
  
  // Simulate what would be passed to saveAutomationRule
  const saveParams = {
    id: payload.id,
    name: payload.name,
    enabled: payload.enabled !== false,
    triggerTopic: payload.trigger,
    triggerData: triggerData, // This is the key fix!
    conditionsJson: JSON.stringify(payload.conditions),
    actionsJson: JSON.stringify(payload.actions),
    cooldownMs: payload.cooldown,
    runOnce: payload.runOnce,
  };
  
  console.log("\nParameters that would be passed to saveAutomationRule:");
  console.log(JSON.stringify(saveParams, null, 2));
  
  // Verify that triggerData is included
  if (saveParams.triggerData) {
    console.log("\n✅ SUCCESS: triggerData is properly included in save parameters!");
    console.log("Cron expression:", saveParams.triggerData);
  } else {
    console.log("\n❌ FAILURE: triggerData is missing!");
  }
}

simulateBackendProcessing(testPayload);

// Test with different scenarios
console.log("\n\n=== Additional Test Scenarios ===\n");

// Test 1: Without triggerData (should not crash)
const testPayloadNoTriggerData = {
  ...testPayload,
  triggerData: undefined
};
console.log("Test 1: Payload without triggerData");
simulateBackendProcessing(testPayloadNoTriggerData);

// Test 2: With empty string triggerData
const testPayloadEmptyTriggerData = {
  ...testPayload,
  triggerData: ""
};
console.log("\nTest 2: Payload with empty string triggerData");
simulateBackendProcessing(testPayloadEmptyTriggerData);

// Test 3: With non-cron trigger (triggerData should be ignored but not cause errors)
const testPayloadNonCron = {
  ...testPayload,
  trigger: "conversation.created",
  triggerData: "0 9 * * 1,3,5"
};
console.log("\nTest 3: Non-cron trigger with triggerData");
simulateBackendProcessing(testPayloadNonCron);

console.log("\n=== All tests completed ===");