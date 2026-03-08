# Extension Development Guidance in System Prompt

## Overview

Added a new system prompt section that instructs the AI assistant how to handle extension development requests. This ensures consistent guidance when users ask to create or edit extensions.

## Changes Made

### File: `electron/pi-sdk-runtime.ts`

#### New Function Added (Lines 459-474)

```typescript
function buildExtensionDevelopmentGuidance(): string {
  const extensionsBaseDir = getChatonsExtensionsBaseDir();
  return [
    "## Extension Development Guidance",
    "",
    "If the user asks you to create or edit an extension, follow these guidelines:",
    "",
    "1. **Documentation Reference**: For comprehensive extension development documentation, refer to https://docs.chatons.ai/extensions",
    "2. **Extension Location**: Always create new extensions in the user's extension home folder:",
    `   \`${extensionsBaseDir}\``,
    "3. **File Structure**: Follow the standard extension manifest structure as documented in the Chatons extensions guide.",
    "4. **Best Practices**: When editing or creating extensions, ensure proper manifest validation and follow the patterns in the documentation.",
    "5. **User Guidance**: When helping with extensions, provide clear paths and file locations relative to the extension home folder.",
  ].join("\n");
}
```

**Purpose**: Generates a consistent instruction block that is always included in the system prompt to guide the AI on extension development best practices.

#### System Prompt Integration (Lines 786-787)

The guidance is added to the system prompt after the optional "Available Extensions" section:

```typescript
const extensionContext = buildExtensionContextSection();
if (extensionContext) {
  sections.push(extensionContext);
}
sections.push(buildExtensionDevelopmentGuidance()); // Always included
```

**Placement**: After "Secure mode limitation handling" and "Available Extensions" (if present), before "Mode ouvert" section.

**Always Included**: Unlike the "Available Extensions" section, this guidance is always added to ensure the AI always has extension development instructions.

## Generated System Prompt Content

When a conversation starts, the AI will see:

```markdown
## Extension Development Guidance

If the user asks you to create or edit an extension, follow these guidelines:

1. **Documentation Reference**: For comprehensive extension development documentation, refer to https://docs.chatons.ai/extensions
2. **Extension Location**: Always create new extensions in the user's extension home folder:
   `/Users/username/.chaton/extensions`
3. **File Structure**: Follow the standard extension manifest structure as documented in the Chatons extensions guide.
4. **Best Practices**: When editing or creating extensions, ensure proper manifest validation and follow the patterns in the documentation.
5. **User Guidance**: When helping with extensions, provide clear paths and file locations relative to the extension home folder.
```

## Key Features

1. **Always Present**: Unlike "Available Extensions", this guidance is always injected (no conditional check)
2. **Dynamic Paths**: The extension home folder path is dynamically resolved via `getChatonsExtensionsBaseDir()`
3. **Documentation Link**: Points to https://docs.chatons.ai/extensions for comprehensive reference
4. **Best Practices**: Establishes clear guidelines for:
   - Where to create extensions
   - How to structure them
   - When to reference documentation
   - How to communicate paths to users

## How It Works

### System Prompt Flow

```
Pi Session Creation
    ↓
appendSystemPromptOverride callback
    ↓
buildExtensionContextSection() → shows installed extensions (if any)
    ↓
buildExtensionDevelopmentGuidance() → always added
    ↓
Add both sections to system prompt
    ↓
Model receives prompt with guidance
    ↓
User requests extension creation/edit
    ↓
AI follows guidelines from system prompt
```

## Integration with Extensions

This guidance complements the "Available Extensions" section:

- **Available Extensions** (conditional): Shows what extensions are already installed
- **Extension Development Guidance** (always): Shows how to create or edit extensions

Together, they provide complete context:
- What's currently available (reference)
- How to extend that (instructions)

## Example Usage Scenarios

### Scenario 1: User Asks to Create a New Extension

**User**: "Can you help me create an extension that integrates with GitHub?"

**AI Response** (guided by system prompt):
- References the Chatons extensions documentation
- Creates the extension in `~/.chaton/extensions/github-integration/`
- Follows proper manifest structure
- Explains the file layout using the correct path

### Scenario 2: User Asks to Modify an Existing Extension

**User**: "I need to update the webhook handler in my custom extension."

**AI Response** (guided by system prompt):
- Locates the extension in the user's extension home folder
- References best practices from documentation
- Makes targeted edits to the appropriate files
- Validates the manifest format

### Scenario 3: User Asks How to Create a Custom Extension

**User**: "How do I create a custom extension?"

**AI Response** (guided by system prompt):
- Directs user to https://docs.chatons.ai/extensions
- Explains the extension home folder location
- Describes the file structure and manifest requirements
- Provides practical examples

## Benefits

### For AI Assistants
- **Consistency**: Same guidance for all extension-related tasks
- **Accuracy**: Knows the exact extension home folder path
- **Authority**: Can reference official documentation URL
- **Context**: Understands extension architecture requirements

### For Users
- **Clarity**: Clear location where extensions should be created
- **Guidance**: AI provides best practice guidance automatically
- **Discovery**: Learns about official documentation through AI responses
- **Debugging**: Clear file paths for troubleshooting

### For Developers
- **Consistency**: Extension development requests are handled uniformly
- **Documentation**: Official docs are referenced in all cases
- **Scalability**: Works for any number of extensions or custom implementations

## Testing

### Manual Testing

1. **Start a New Conversation**:
   - Create a new conversation in Chatons
   - The system prompt will include the "Extension Development Guidance" section

2. **Verify Content**:
   - Check that guidance includes the dynamic extension home folder path
   - Verify documentation URL is correct: https://docs.chatons.ai/extensions
   - Confirm all 5 guidelines are present

3. **Test with Extension Request**:
   - Ask: "Help me create an extension"
   - Verify AI references the guidance in its response
   - Check that paths use the user's extension home folder

4. **Test with Multiple Extensions**:
   - Install a few extensions
   - Start a new conversation
   - Verify both sections appear:
     - "Available Extensions" (shows installed ones)
     - "Extension Development Guidance" (shows how to create/edit)

### Testing Checklist

- [ ] System prompt section always appears
- [ ] Extension home folder path is correct
- [ ] Documentation URL is accurate (https://docs.chatons.ai/extensions)
- [ ] All 5 guidelines are clearly formatted
- [ ] AI references guidance when asked about extensions
- [ ] No errors or warnings in console

## Performance Considerations

- **Execution Time**: < 1ms (simple string formatting)
- **Memory**: Negligible (fixed-size string)
- **Cache**: Extension base dir already cached
- **Impact**: No noticeable performance change

## Related Documentation

- **Extension Documentation**: https://docs.chatons.ai/extensions
- **Main Reference**: `EXTENSION_PATHS_SYSTEM_PROMPT.md` (installed extensions)
- **Architecture**: `AGENTS.md` section on extension system
- **Integration**: `PI_INTEGRATION.md` section on system prompts

## Version History

- **v1.0.0** (Mar 8, 2026): Initial implementation
  - Added extension development guidance to system prompts
  - Always-present guidance for extension creation/editing
  - Dynamic extension home folder path
  - Documentation URL reference: https://docs.chatons.ai/extensions

## Future Enhancements

Potential improvements for future versions:

1. **Quick Links**: Add inline links to specific extension templates
2. **Capability Descriptions**: Explain available capabilities in guidance
3. **Common Patterns**: Include frequently used extension patterns
4. **Troubleshooting**: Add common extension debugging tips
5. **Version Compatibility**: Note extension API version requirements
6. **Example Repository**: Link to example extensions on GitHub
