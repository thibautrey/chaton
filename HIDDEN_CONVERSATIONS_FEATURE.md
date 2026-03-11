# Hidden Conversations Feature

## Overview

This feature allows extensions to create conversations that are not visible in the Chatons sidebar, while remaining fully functional and accessible through the extension API. This is particularly useful for:

- **Automation workflows**: Keep internal automation conversations out of the user's conversation list
- **Background processing**: Run tasks without cluttering the UI
- **Extension-internal threads**: Manage conversations entirely within an extension's scope

## Changes Made

### 1. Database Schema (Migration)

**File**: `electron/db/migrations/016_conversation_hidden_from_sidebar.sql`

Added a new column to the `conversations` table:
```sql
ALTER TABLE conversations ADD COLUMN hidden_from_sidebar INTEGER NOT NULL DEFAULT 0;
```

- Default value is 0 (visible in sidebar) for backward compatibility
- An index is created for fast queries

### 2. Data Layer

**File**: `electron/db/repos/conversations.ts`

- Updated `DbConversation` type to include `hidden_from_sidebar: number`
- Updated `insertConversation()` function signature to accept `hiddenFromSidebar?: boolean` parameter
- When creating a conversation, the parameter is converted to 0 or 1

### 3. Host Call Handler

**File**: `electron/extensions/runtime/host.ts`

Updated `channels.upsertGlobalThread` host call to:
- Accept optional `hiddenFromSidebar: boolean` parameter
- Pass it through to `insertConversation()`
- Maintain backward compatibility (defaults to false)

### 4. Sidebar Filtering

**File**: `electron/ipc/workspace.ts`

- Updated `toWorkspacePayload()` to filter hidden conversations: `.filter((c) => !c.hidden_from_sidebar)`
- Updated `mapConversation()` to expose `hiddenFromSidebar` field in the conversation object
- This ensures hidden conversations never appear in the sidebar UI

### 5. Automation Extension

**File**: `electron/extensions/runtime/automation-pi-bridge.ts`

Modified `createPiInstructionExecutor()` to create hidden conversations:
```typescript
insertConversation(db, {
  id: ephemeralConversationId,
  projectId: null,
  title: 'Automation Task',
  hiddenFromSidebar: true,  // NEW: Mark as hidden
})
```

Automation task conversations are now automatically hidden from the sidebar.

### 6. API Documentation

**File**: `docs/content/extensions/channels.mdx`

Updated `channels.upsertGlobalThread` documentation to include:
- New `hiddenFromSidebar` parameter
- Explanation of behavior and use cases
- Example usage

## Usage

### For Extension Developers

When calling `channels.upsertGlobalThread`, pass `hiddenFromSidebar: true`:

```javascript
var result = await window.chaton.extensionHostCall(
  EXTENSION_ID,
  'channels.upsertGlobalThread',
  {
    mappingKey: 'myext:internal:task-123',
    title: 'Internal Processing Task',
    modelKey: 'openai/gpt-4o',
    hiddenFromSidebar: true,  // Hide from sidebar
  }
);
```

### For Built-in Automation

Automation task conversations are automatically hidden:
- When automation rules execute Pi instructions, the conversations are invisible to users
- The conversations remain fully functional for message processing
- Extensions can still access them via `conversations.list` API

## Access Control

### Hidden from Sidebar
- **Sidebar**: Hidden conversations do NOT appear in the conversation list
- **API**: `conversations.list` from extensions returns ALL conversations (including hidden ones)
- **Automation Extension**: Hidden conversations are accessible within the automation extension's UI

### Still Fully Functional
- Hidden conversations work exactly like normal conversations
- They support the same features (messaging, model selection, etc.)
- They can be accessed by their ID directly

## Backward Compatibility

- All existing conversations default to `hidden_from_sidebar = 0` (visible)
- The parameter is optional in `channels.upsertGlobalThread`
- Existing code continues to work without changes

## Performance

- Fast filtering on sidebar load due to database index
- No performance impact on hidden conversations themselves
- Index on `hidden_from_sidebar` column for efficient queries

## Testing Recommendations

1. **Sidebar filtering**: Verify hidden conversations don't appear in the sidebar
2. **API access**: Verify hidden conversations ARE returned by `conversations.list`
3. **Automation**: Run automation tasks and verify conversations are hidden but functional
4. **Extension creation**: Test creating hidden conversations via `channels.upsertGlobalThread`
5. **Backward compatibility**: Verify existing conversations remain visible

## Files Modified

1. `electron/db/migrations/016_conversation_hidden_from_sidebar.sql` - NEW
2. `electron/db/repos/conversations.ts` - UPDATED
3. `electron/extensions/runtime/host.ts` - UPDATED
4. `electron/extensions/runtime/automation-pi-bridge.ts` - UPDATED
5. `electron/ipc/workspace.ts` - UPDATED
6. `docs/content/extensions/channels.mdx` - UPDATED

## Future Enhancements

Potential future improvements:
- UI for viewing/managing hidden conversations (admin/debug mode)
- Option to show/hide all automation conversations
- Filtering controls in the conversation list UI
- Archive vs. hide distinction
