# Quick Start: display_action_suggestions Tool

## What This Tool Does

Displays clickable action badges in the Chatons composer, allowing the LLM to present users with options to choose from instead of typing.

**Visual result**: Instead of typing, user sees buttons like:
```
┌─────────────────────────────────────────────────────┐
│ [Implement full solution]  [Simpler workaround]    │
│ [Check dependencies]                               │
└─────────────────────────────────────────────────────┘
```

## How to Use It in Prompts

In your LLM prompt or system message, you can instruct it to call this tool:

```javascript
// When you need to present options to the user, use:
display_action_suggestions({
  "suggestions": [
    {
      "label": "Short button text",
      "message": "Full message to send when clicked"
    },
    {
      "label": "Another option",
      "message": "Another message"
    }
  ]
})
```

## Example Conversation

**User**: "I'm not sure how to proceed with this feature"

**Assistant**: *thinks about options, then calls tool*

```python
display_action_suggestions({
  "suggestions": [
    {
      "label": "Implement full solution",
      "message": "Let's implement the full solution with new action type, execution logic, and UI updates"
    },
    {
      "label": "Simpler workaround",
      "message": "Let's create a simpler workaround by modifying existing code"
    },
    {
      "label": "Need more info",
      "message": "What dependencies might we be missing? Tell me more about the requirements"
    }
  ]
})
```

**Result**: Three buttons appear. User clicks one, and the assistant continues with that approach.

## Tool Parameters

```typescript
{
  "suggestions": [
    {
      "label": string,        // Required, max 50 chars - shown on button
      "message": string,      // Required - sent when clicked
      "id": string            // Optional - unique ID, auto-generated if omitted
    }
  ]
}
```

### Constraints

- **Max suggestions**: 4 (more are silently truncated)
- **Max label length**: 50 characters
- **Min label**: 1 character
- **Message**: Any length, but keep reasonable (user will see it)
- **All fields**: Must be non-empty strings

## Error Handling

The tool will return an error if:
- No suggestions provided
- All suggestions are empty/invalid
- No `label` or `message` in any suggestion

Example error response:
```json
{
  "ok": false,
  "error": {
    "code": "invalid_args",
    "message": "at least one valid suggestion with label and message is required"
  }
}
```

## Success Response

When successful, returns:
```json
{
  "ok": true,
  "data": {
    "count": 3,
    "suggestions": [
      {"id": "action_0", "label": "Option A", "message": "..."},
      {"id": "action_1", "label": "Option B", "message": "..."},
      {"id": "action_2", "label": "Option C", "message": "..."}
    ]
  }
}
```

## Testing the Tool

### Manual Test

1. Create a global conversation in Chatons
2. Ask the model: "Show me 3 options using the display_action_suggestions tool. The options should be: (A) Option A with message 'message a', (B) Option B with message 'message b', (C) Option C with message 'message c'"
3. Expected result:
   - Three buttons appear in composer
   - Click each button → message is populated
   - Suggestions disappear after clicking

### Automated Test Script

You could create a test prompt like:

```
You have access to the display_action_suggestions tool. 
Use it right now to display 3 example actions.
The actions should be:
1. Label: "Do this", Message: "I want to proceed with this approach"
2. Label: "Do that", Message: "Let me try that instead"  
3. Label: "Tell more", Message: "I need more information first"
```

### Test Checklist

Run these tests manually:

- [ ] **Valid suggestions**: 3 buttons appear correctly
- [ ] **Clicking button**: Message appears in composer
- [ ] **Suggestions clear**: After clicking, buttons disappear
- [ ] **Multiple calls**: Calling tool again replaces old suggestions
- [ ] **Long labels**: Labels >50 chars are truncated correctly
- [ ] **5+ suggestions**: 5th suggestion is silently dropped
- [ ] **Empty fields**: Tool rejects empty label or message
- [ ] **In project conversation**: Works in project threads too
- [ ] **Multi-turn**: Works correctly across multiple turns
- [ ] **Model switching**: Still works after changing models mid-conversation

## Common Patterns

### Yes/No Decision
```javascript
display_action_suggestions({
  "suggestions": [
    {"label": "Yes", "message": "Yes, proceed with this approach"},
    {"label": "No", "message": "No, let's try something different"}
  ]
})
```

### Multi-Step Wizard
```javascript
display_action_suggestions({
  "suggestions": [
    {"label": "Step 1", "message": "Let's start with step 1"},
    {"label": "Step 2", "message": "Jump to step 2"},
    {"label": "Skip to end", "message": "Skip to the final summary"}
  ]
})
```

### Choose Difficulty
```javascript
display_action_suggestions({
  "suggestions": [
    {"label": "Easy", "message": "Explain in simple terms"},
    {"label": "Medium", "message": "Give me a balanced explanation"},
    {"label": "Expert", "message": "Give me all the technical details"},
    {"label": "Example code", "message": "Show me code examples"}
  ]
})
```

## Troubleshooting

### Buttons don't appear

**Possible causes**:
- Tool call returned an error (check error message)
- Pi session not active (start a conversation first)
- Tool name misspelled

**Solution**: 
- Check the model's response for error messages
- Make sure the tool name is exactly `display_action_suggestions`
- Verify suggestions have both label and message

### Buttons appear but don't work

**Possible causes**:
- Conversation ended before user could click
- Browser tab lost focus

**Solution**:
- Keep the conversation active
- Click button immediately after it appears
- Try again in a new conversation

### Messages too long

**Possible causes**:
- Message field contains very long text

**Solution**:
- Keep messages concise (1-2 lines ideal)
- Use the message as a complete instruction the user should type

## Prompt Engineering Tips

1. **Keep labels short**: 1-3 words works best
2. **Make messages complete**: User should be able to submit them as-is
3. **Make options clear**: Each should be distinct and useful
4. **3 options**: Sweet spot for UX (not too many, not too few)
5. **Use after explanations**: Show options after explaining the choice

Good pattern:
```
"Here are 3 ways forward:
1. Implement everything now
2. Start with a prototype
3. Need more information first

Let me display these as options:"

display_action_suggestions({...})
```

## Related Features

- **schedule_task**: Automate actions based on triggers
- **thread_action_suggestions**: (this tool) Present choices to users
- **Extension UI requests**: Pi's native UI request mechanism (this tool uses it)

## See Also

- Implementation: `/IMPLEMENTATION_SUMMARY.md`
- Architecture: `/COMPOSER_ACTIONS_IMPLEMENTATION.md`
- Pi Integration: `/AGENTS.md` (section on thread actions)
