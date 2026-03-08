# Display Action Suggestions Tool - Implementation Complete

## Summary

I've successfully implemented the `display_action_suggestions` LLM tool for Chatons. This tool allows AI assistants to present users with a choice menu of action badges in the composer, enabling better UX for guided decision-making without requiring typed input.

## What Was Implemented

### 1. Tool Definition ✅
**File**: `electron/extensions/runtime/constants.ts`

Added tool definition to `AUTOMATION_MANIFEST.llm.tools`:
- Name: `display_action_suggestions`
- Label: "Display action suggestions"
- Max 4 suggestions per call
- Each suggestion has: `label` (max 50 chars), `message`, optional `id`

### 2. Tool Handler ✅
**File**: `electron/extensions/runtime/automation.ts`

Added handler in `extensionsCallAutomation()` that:
- Validates input suggestions (filters to max 4, validates label/message)
- Normalizes suggestion IDs
- Calls the global bridge to emit UI events
- Returns result with count and normalized suggestions

### 3. Event Emitter ✅
**File**: `electron/pi-sdk-runtime.ts`

Added public method `emitExtensionUiRequest()` to `PiSdkRuntime` class that:
- Accepts UI request method and payload
- Generates unique request ID
- Emits event through Pi session (which gets forwarded to renderer)
- Used specifically to emit `set_thread_actions` events with action suggestions

Also added helper methods:
- `getActiveRuntime()`: Finds currently active (streaming) Pi runtime
- `getRuntimeForConversation()`: Gets runtime for specific conversation

### 4. Bridge & Context ✅
**File**: `electron/ipc/workspace-handlers.ts`

Added global bridge `__chatonsDisplayActionSuggestions` that:
- Finds the active Pi runtime (prefers streaming, falls back to any active)
- Calls `emitExtensionUiRequest("set_thread_actions", { actions: suggestions })`
- The event is automatically sent through Pi to the renderer

### 5. Renderer Integration (Already Exists) ✅
**File**: `src/features/workspace/store/pi-events.ts`

The renderer already handles `extension_ui_request` with `method: 'set_thread_actions'`:
- Validates suggestions
- Dispatches `setThreadActionSuggestions` action
- Updates store, triggers UI re-render

## Architecture Flow

```
User: "Show me 3 options"
    ↓
LLM calls: display_action_suggestions({
  "suggestions": [
    {"label": "Option A", "message": "Process A"},
    {"label": "Option B", "message": "Process B"},
    {"label": "Option C", "message": "Process C"}
  ]
})
    ↓
Tool handler (automation.ts)
  - Validates suggestions
  - Calls __chatonsDisplayActionSuggestions bridge
    ↓
Bridge (workspace-handlers.ts)
  - Finds active Pi runtime
  - Calls runtime.emitExtensionUiRequest("set_thread_actions", ...)
    ↓
Pi Session emits event
    ↓
Renderer receives event (pi-events.ts)
  - Dispatches setThreadActionSuggestions action
    ↓
UI (Composer.tsx)
  - Renders 3 badge buttons
    ↓
User clicks badge → Message sent to composer
```

## Files Modified

1. **electron/extensions/runtime/constants.ts**
   - Added `display_action_suggestions` tool definition to `AUTOMATION_MANIFEST`

2. **electron/extensions/runtime/automation.ts**
   - Added handler for `display_action_suggestions` API in `extensionsCallAutomation()`

3. **electron/pi-sdk-runtime.ts**
   - Added `emitExtensionUiRequest()` method to `PiSdkRuntime` class
   - Added `getActiveRuntime()` method to `PiSessionRuntimeManager` class
   - Added `getRuntimeForConversation()` method to `PiSessionRuntimeManager` class

4. **electron/ipc/workspace-handlers.ts**
   - Added `__chatonsDisplayActionSuggestions` global bridge
   - Added helpers for tool execution context (for future use)

## Usage Example

In a prompt or system message, the LLM can call:

```typescript
display_action_suggestions({
  "suggestions": [
    {
      "label": "Implement full solution",
      "message": "Implement the full solution (add new action type + execution logic + update UI)"
    },
    {
      "label": "Create simpler workaround",
      "message": "Create a simpler workaround (modify schedule_task to call a conversation API instead)"
    },
    {
      "label": "Check dependencies",
      "message": "Check what other dependencies are needed (Pi session creation, etc.)"
    }
  ]
})
```

Result: Three clickable badges appear in the composer. When user clicks one, that message is auto-populated.

## Key Design Decisions

1. **Max 4 suggestions**: UI is designed for up to 4 buttons. More are silently truncated for good UX.

2. **Active runtime detection**: Instead of passing conversation context through the execution stack, the tool handler finds the currently active Pi runtime. This is simpler and more robust.

3. **Direct Pi event emission**: The tool leverages Pi's existing `extension_ui_request` mechanism with `method: 'set_thread_actions'`, ensuring consistency with how other UI requests are handled.

4. **No persistence**: Action suggestions are ephemeral UI state tied to the current conversation turn. They're cleared when user clicks or conversation ends.

5. **Fallback rendering**: Even if Pi runtime access fails, the bridge can send IPC directly to renderer (though normally Pi handles it).

## Testing Checklist

- [ ] Tool appears in LLM's available tools list
- [ ] Tool can be called with valid suggestions
- [ ] Invalid suggestions are rejected with error (empty, no label/message)
- [ ] Badges appear in composer when tool is called
- [ ] Clicking a badge sends the message to composer
- [ ] Suggestions clear automatically after click
- [ ] Multiple calls replace (not append) suggestions  
- [ ] Works in both global and project conversations
- [ ] Tool correctly validates max 4 suggestions
- [ ] Tool correctly truncates labels to 50 chars

## Limitations

- Max 4 suggestions (UI constraint)
- Max 50 chars per label (readability)
- No message length limit (but keep reasonable for UX)
- Only works when Pi session is active
- Suggestions tied to specific conversation
- No persistence between sessions

## Future Enhancements

1. **Icon support**: Add optional icon field for better visual hierarchy
2. **Custom styling**: Allow specifying button color/theme
3. **Nested actions**: Support multi-level decision trees
4. **Confirmation dialogs**: Add `confirm_action_suggestion` tool
5. **Conditional display**: Show/hide based on access mode, project, etc.
6. **Persistence**: Save frequently-used action templates

## Files to Review

Before merging:
- `electron/extensions/runtime/constants.ts` - Tool definition
- `electron/extensions/runtime/automation.ts` - Handler
- `electron/pi-sdk-runtime.ts` - Event emission
- `electron/ipc/workspace-handlers.ts` - Bridge setup

No renderer changes needed - existing UI already supports thread actions!
