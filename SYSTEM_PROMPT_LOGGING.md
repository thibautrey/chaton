# System Prompt Logging Feature

## Overview

This implementation adds detailed logging of system prompts and setup instructions sent to the LLM when a conversation starts. The logs are displayed in the "Console de logs" (Log Console) for debugging and transparency purposes.

## Changes Made

### 1. Electron Side (Backend)

#### File: `electron/pi-sdk-runtime.ts`

**New RpcEvent Type:**
- Added `system_prompt` event type to the `RpcEvent` union type
- Event includes:
  - `sections`: Array of system prompt sections
  - `model`: The LLM model being used
  - `accessMode`: Either "secure" or "open"
  - `thinkingLevel`: The thinking level setting

**System Prompt Assembly:**
- Modified the `appendSystemPromptOverride` function in the `DefaultResourceLoader` configuration
- Added logging of each section as it's being assembled with `console.log([SYSTEM_PROMPT] ...)` 
- Captured the system prompt sections for emission

**Event Emission:**
- After the Pi session is successfully created, a `system_prompt` event is emitted with:
  - All assembled prompt sections
  - Session metadata (model, access mode, thinking level)
  - Logs a summary and detailed information about each section

### 2. Frontend Side (React)

#### File: `src/features/workspace/store/pi-events.ts`

**New Event Handler:**
- Added handling for `payload.type === 'system_prompt'` in the `applyPiEvent` function
- When a system_prompt event is received:
  1. Extracts the sections, model info, access mode, and thinking level
  2. Logs a summary message with `window.logger` including:
     - Number of sections
     - Model information (provider/model-id)
     - Access mode (secure/open)
     - Thinking level
  3. Logs each section individually for complete transparency

## User Workflow

### Using the Console de logs

1. **Start a conversation** - Select a model and create a new conversation
2. **Open the Console de logs** - Press `Ctrl+Shift+L` (or use the UI menu)
3. **View System Prompts** - Once the conversation initializes, you'll see:
   - An info log: "System prompt initialized with X sections"
   - Detailed logs for each section (1/N, 2/N, etc.)
   - Complete system prompt text for each section

### Filtering in Console de logs

- **Filter by level**: Select "Info" to see initialization messages
- **Filter by source**: Select "Frontend" to see the system prompt logs
- **Search**: Use the search box to find specific sections (e.g., "access mode", "extension", "thread action")

## Example Log Output

```
[INFO] [FRONTEND] System prompt initialized with 8 sections
Conversation: abc123
Model: openai/gpt-4
Access Mode: secure
Thinking Level: medium

[INFO] [FRONTEND] System prompt section 1/8
Section: ## Comportement par defaut
...full section content...

[INFO] [FRONTEND] System prompt section 2/8
Section: ## Thread action suggestions tool
...full section content...

[INFO] [FRONTEND] System prompt section 3/8
Section: ## Conversation access mode
...full section content...

... (and so on for each section)
```

## Technical Details

### How System Prompts Are Assembled

The system prompt is built in stages with the following sections:

1. **Pi Base Prompts** - Base prompts from Pi Coding Agent
2. **Extension Documentation** - Instructions about reading extension docs
3. **Default Behavior** - User-configured default behavior prompt (if any)
4. **Thread Actions** - Guidance on using thread action suggestions
5. **Access Mode** - Instructions based on secure/open mode
6. **Secure Mode Handling** - Limitations and suggestions for mode switching
7. **Extension Context** - List of installed extensions and capabilities
8. **Extension Development** - Guidance for extension development
9. **Open Mode Instructions** - Additional permissions info (if in open mode)

### Event Flow

```
1. Conversation starts
   ↓
2. Pi session creation begins
   ↓
3. DefaultResourceLoader builds system prompt
   ↓
4. appendSystemPromptOverride captures all sections
   ↓
5. System prompt event is emitted
   ↓
6. Frontend receives system_prompt event via IPC (pi:event)
   ↓
7. applyPiEvent logs each section to window.logger
   ↓
8. LogConsole displays logs (via Ctrl+Shift+L)
```

## Benefits

- **Debugging**: See exactly what instructions the AI is receiving
- **Transparency**: Understand how access modes affect the prompt
- **Verification**: Confirm extensions are properly integrated
- **Understanding**: Learn what system instructions are applied by default
- **Testing**: Easily verify custom behavior prompts are being used

## Related Code

- **Logger**: `/src/lib/logger.ts` - Frontend logging utilities
- **Log Manager**: `/electron/lib/logging/log-manager.ts` - Centralized logging
- **Log Console Component**: `/src/components/LogConsole.tsx` - UI for viewing logs
- **Pi Integration**: `/docs/PI_INTEGRATION.md` - Pi integration documentation

## Notes

- System prompts are logged only when a conversation is initialized
- Console output includes `[SYSTEM_PROMPT]` prefix for easy filtering
- Full prompt sections are logged to maintain transparency
- No sensitive data (API keys, tokens) should appear in system prompts
- Logs are persisted in the app's log files for later review
