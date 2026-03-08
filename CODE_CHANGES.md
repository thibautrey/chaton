# Code Changes Summary - display_action_suggestions Tool

## Overview

This document lists all code modifications made to implement the `display_action_suggestions` LLM tool.

## File-by-File Changes

### 1. electron/extensions/runtime/constants.ts

**Change**: Added `display_action_suggestions` tool to `AUTOMATION_MANIFEST.llm.tools`

**Location**: In `AUTOMATION_MANIFEST` object, within `llm.tools` array

**Added**:
```typescript
{
  name: 'display_action_suggestions',
  label: 'Display action suggestions',
  description: 'Display a choice menu of action badges in the composer for the user to click. Useful for guiding users through decisions without requiring typed input.',
  promptSnippet: 'Display suggested actions as clickable badges in the composer.',
  promptGuidelines: [
    'Use this tool to present multiple options to the user as a choice menu.',
    'Keep labels short (max 30 chars) and action messages concise.',
    'Limit suggestions to 4 or fewer for good UI layout.',
    'Each action message should be a complete instruction or question the user would enter.',
  ],
  parameters: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        description: 'Array of action suggestions to display (max 4 for UI fit)',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Short button text (recommended max 30 chars)',
              maxLength: 50,
            },
            message: {
              type: 'string',
              description: 'The message to send when user clicks this action',
            },
            id: {
              type: 'string',
              description: 'Optional unique ID for this suggestion (auto-generated if omitted)',
            },
          },
          required: ['label', 'message'],
        },
      },
    },
    required: ['suggestions'],
  },
}
```

### 2. electron/extensions/runtime/automation.ts

**Change**: Added handler for `display_action_suggestions` API

**Location**: In `extensionsCallAutomation()` function, before `return null` statement

**Added**:
```typescript
if (apiName === 'display_action_suggestions') {
  const params = asRecord(payload) ?? {}
  const suggestions = Array.isArray(params.suggestions) ? params.suggestions : []
  
  // Validate and normalize suggestions
  const validated = suggestions
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !Array.isArray(s))
    .slice(0, 4) // Max 4 suggestions for UI fit
    .map((s, i) => ({
      id: typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `action_${i}`,
      label: typeof s.label === 'string' ? s.label.trim().slice(0, 50) : `Option ${i + 1}`,
      message: typeof s.message === 'string' ? s.message : '',
    }))
    .filter((s) => s.label.length > 0 && s.message.trim().length > 0)
  
  if (validated.length === 0) {
    return { ok: false, error: { code: 'invalid_args', message: 'at least one valid suggestion with label and message is required' } }
  }
  
  // Use the bridge to send suggestions to the current conversation
  const bridge = (globalThis as Record<string, unknown>).__chatonsDisplayActionSuggestions as ((suggestions: Array<{ id: string; label: string; message: string }>) => boolean) | undefined
  if (bridge) {
    bridge(validated)
  }
  
  return { ok: true, data: { count: validated.length, suggestions: validated } }
}
```

### 3. electron/pi-sdk-runtime.ts

**Change 1**: Added `emitExtensionUiRequest()` method to `PiSdkRuntime` class

**Location**: After `respondExtensionUi()` method (around line 1142)

**Added**:
```typescript
/**
 * Emit an extension UI request event (used by extensions to trigger UI updates)
 */
emitExtensionUiRequest(
  method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text" | "set_thread_actions",
  payload: Record<string, unknown>,
) {
  const id = crypto.randomUUID();
  this.emit({
    type: "extension_ui_request",
    id,
    method,
    ...payload,
  });
}
```

**Change 2**: Added `getActiveRuntime()` method to `PiSessionRuntimeManager` class

**Location**: Before `getRuntimeForConversation()` method (around line 1352)

**Added**:
```typescript
/**
 * Finds the currently active (streaming) Pi runtime, or returns undefined if none.
 * Used by extensions to emit UI events back to the active conversation.
 */
getActiveRuntime(): PiSdkRuntime | undefined {
  for (const runtime of this.runtimes.values()) {
    const status = runtime.getStatus();
    if (status === 'streaming') {
      return runtime;
    }
  }
  // Fallback: return the first runtime if any exists (tool execution might not be streaming yet)
  return this.runtimes.values().next().value;
}
```

**Change 3**: Added `getRuntimeForConversation()` method to `PiSessionRuntimeManager` class

**Location**: After `getActiveRuntime()` method

**Added**:
```typescript
/**
 * Gets the runtime for a specific conversation, if it exists.
 */
getRuntimeForConversation(conversationId: string): PiSdkRuntime | undefined {
  return this.runtimes.get(conversationId);
}
```

### 4. electron/ipc/workspace-handlers.ts

**Change**: Added global bridge and context management for `display_action_suggestions`

**Location**: After `__chatonsChannelBridge` definition (around line 480)

**Added**:
```typescript
// Store for active tool execution context (conversationId currently executing)
const activeToolExecutionContext = new Map<string, string>(); // requestId -> conversationId

(globalThis as Record<string, unknown>).__chatonsToolExecutionContextStart = (
  requestId: string,
  conversationId: string,
) => {
  activeToolExecutionContext.set(requestId, conversationId);
};

(globalThis as Record<string, unknown>).__chatonsToolExecutionContextEnd = (
  requestId: string,
) => {
  activeToolExecutionContext.delete(requestId);
};

(globalThis as Record<string, unknown>).__chatonsDisplayActionSuggestions = (
  suggestions: Array<{ id: string; label: string; message: string }>,
): boolean => {
  // Try to find the active runtime by looking for one that's currently streaming
  let activeRuntime = deps.piRuntimeManager.getActiveRuntime();
  
  // If no active runtime found, try to get from execution context
  if (!activeRuntime) {
    const conversationId = Array.from(activeToolExecutionContext.values())[0];
    if (conversationId) {
      activeRuntime = deps.piRuntimeManager.getRuntimeForConversation(conversationId);
    }
  }

  if (!activeRuntime) {
    console.warn("display_action_suggestions: no active Pi runtime found");
    return false;
  }

  // Emit an extension_ui_request event through the Pi session
  try {
    activeRuntime.emitExtensionUiRequest("set_thread_actions", { actions: suggestions });
    return true;
  } catch (error) {
    console.error("display_action_suggestions: failed to emit UI request", error);
    return false;
  }
};
```

## Files NOT Modified (Already Support This)

### src/features/workspace/store/state.ts
- Already has `setThreadActionSuggestions` and `clearThreadActionSuggestions` actions
- Already has `ThreadActionSuggestion` type definition
- No changes needed

### src/features/workspace/store/pi-events.ts
- Already handles `extension_ui_request` with `method: 'set_thread_actions'`
- Already validates and dispatches actions to store
- No changes needed

### src/components/shell/Composer.tsx
- Already renders thread action badges
- Already shows up to 4 badges
- Already clears on click
- No changes needed

### src/features/workspace/rpc.ts
- Already has `ThreadActionSuggestion` type
- Already part of `PiConversationRuntime`
- No changes needed

## Total Lines Changed

- **constants.ts**: ~40 new lines
- **automation.ts**: ~27 new lines  
- **pi-sdk-runtime.ts**: ~35 new lines (public methods)
- **workspace-handlers.ts**: ~42 new lines

**Total**: ~144 new lines of code

## Imports Required

No new imports needed:
- `crypto` already imported in pi-sdk-runtime.ts
- `asRecord` already imported in automation.ts
- `globalThis` is a built-in

## Type Safety

All changes are type-safe:
- Payload validation uses `asRecord()` and type guards
- Extension UI request types are defined in pi-sdk-runtime.ts
- Bridge signatures match usage

## Backwards Compatibility

- No changes to existing APIs
- No changes to existing tool signatures
- No changes to render state/store
- Purely additive change

## Testing Coverage Needed

- Unit test for tool handler validation
- Integration test for tool execution with Pi session
- E2E test for UI rendering and user interaction

## Code Review Checklist

- [ ] Tool definition in constants.ts looks correct
- [ ] Handler validation logic is sound
- [ ] Bridge implementation correctly finds active runtime
- [ ] emitExtensionUiRequest signature matches other methods
- [ ] No circular dependencies introduced
- [ ] Error handling is comprehensive
- [ ] Type safety throughout
- [ ] No console.* calls in production code (warnings/errors OK for now)
- [ ] Comments explain non-obvious code sections
- [ ] Consistent with existing code style
