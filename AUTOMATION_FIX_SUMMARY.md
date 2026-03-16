# Fix for Automation Extension - Cron Expression Not Saved

## Problem Description
When creating an automation rule with a cron trigger in the Chatons automation extension, the cron expression was not being saved to the database. This caused cron-based automations to fail because the `triggerData` field (which stores the cron expression) was not being passed from the backend to the database layer.

## Root Cause
In the file `/electron/extensions/runtime/automation.ts`, the `extensionsCallAutomation` function was handling the `automation.rules.save` API call but was not extracting the `triggerData` field from the payload and passing it to the `saveAutomationRule` function.

## Files Modified

### 1. `/electron/extensions/runtime/automation.ts` (TypeScript source)
**Location:** Line 280-290

**Before:**
```typescript
const runOnce = typeof p.runOnce === 'boolean' ? p.runOnce : false
saveAutomationRule(db, {
  id,
  name,
  enabled: p.enabled !== false,
  triggerTopic: trigger,
  conditionsJson: JSON.stringify(conditions),
  actionsJson: JSON.stringify(actions),
  cooldownMs: cooldown,
  runOnce,
})
console.log('[Automation] Saved rule:', { id, name, trigger, runOnce })
```

**After:**
```typescript
const runOnce = typeof p.runOnce === 'boolean' ? p.runOnce : false
const triggerData = typeof p.triggerData === 'string' ? p.triggerData : undefined
saveAutomationRule(db, {
  id,
  name,
  enabled: p.enabled !== false,
  triggerTopic: trigger,
  triggerData,
  conditionsJson: JSON.stringify(conditions),
  actionsJson: JSON.stringify(actions),
  cooldownMs: cooldown,
  runOnce,
})
console.log('[Automation] Saved rule:', { id, name, trigger, runOnce, triggerData })
```

### 2. `/dist-electron/extensions/runtime/automation.js` (Compiled JavaScript)
**Location:** Line 258-270

Applied the same changes as above to the compiled JavaScript file.

## Changes Made

1. **Added `triggerData` extraction:** Extract the `triggerData` field from the payload using `typeof p.triggerData === 'string' ? p.triggerData : undefined`

2. **Added `triggerData` to save parameters:** Include the extracted `triggerData` in the parameters passed to `saveAutomationRule`

3. **Enhanced logging:** Updated the console log to include `triggerData` for better debugging

## Impact

### Before the fix:
- Cron expressions were sent from the UI but not saved to the database
- Cron-based automations would fail to execute because no cron expression was stored
- The `trigger_data` column in the `automation_rules` table would be NULL for cron rules

### After the fix:
- Cron expressions are properly extracted from the payload
- Cron expressions are saved to the database in the `trigger_data` column
- Cron-based automations can now be properly scheduled and executed
- The existing cron scheduling infrastructure (`initializeCronTasks`, `updateCronTask`) already supports this field and will now work correctly

## Testing

A test script was created to verify the fix works correctly:
- ✅ Cron expressions are properly extracted and included in save parameters
- ✅ The fix handles cases where `triggerData` is undefined or empty
- ✅ The fix works for both cron and non-cron triggers
- ✅ No breaking changes to existing functionality

## Related Code

The following existing code already supports `triggerData` and will now work correctly:

1. **Database layer** (`/electron/db/repos/automation.ts`):
   - The `saveAutomationRule` function already accepts `triggerData` parameter
   - The SQL UPDATE/INSERT statements already handle the `trigger_data` column

2. **Cron scheduling** (`/electron/extensions/runtime/automation.ts`):
   - `initializeCronTasks()` uses `rule.trigger_data` to get cron expressions
   - `updateCronTask()` uses `rule.trigger_data` to update cron expressions

3. **API responses** (`/electron/extensions/runtime/automation.ts`):
   - `automation.rules.list` already includes `triggerData: rule.trigger_data` in responses

4. **UI layer** (`/electron/extensions/builtin/automation/index.js`):
   - The UI already sends `triggerData` in the payload when creating/editing cron rules
   - The UI already handles displaying `triggerData` when listing rules

## Verification Steps

To verify the fix is working:

1. Create a new automation rule with a cron trigger
2. Set a cron expression (e.g., "0 9 * * 1,3,5" for Mon, Wed, Fri at 9 AM)
3. Save the rule
4. Check the database: `SELECT trigger_data FROM automation_rules WHERE id = 'your-rule-id'`
5. Verify that the cron expression is stored in the `trigger_data` column
6. Check the logs for: `[Automation] Saved rule:` - it should now include the `triggerData`

## Notes

- This fix is backward compatible - existing rules without `triggerData` will continue to work
- The fix only affects cron-based automations; other trigger types are unaffected
- The database schema already supports this field via migration `017_automation_cron_support.sql`