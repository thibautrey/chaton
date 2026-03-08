# Testing Checklist - display_action_suggestions Tool

## Pre-Testing Setup

- [ ] Code has been compiled successfully
- [ ] No TypeScript errors
- [ ] App launches without errors
- [ ] Console shows no warnings about missing bridges

## Unit Tests

### Tool Handler Validation

- [ ] **Valid input**: Handler accepts array of suggestions with label and message
- [ ] **Min suggestions**: Accepts 1 suggestion
- [ ] **Max suggestions**: Accepts 4 suggestions, truncates 5+
- [ ] **Auto-ID**: Generates ID when not provided
- [ ] **Trim whitespace**: Labels and IDs are trimmed
- [ ] **Label truncation**: Labels >50 chars are truncated
- [ ] **Invalid label**: Rejects empty labels
- [ ] **Invalid message**: Rejects empty messages
- [ ] **Zero suggestions**: Returns error appropriately
- [ ] **Null/undefined**: Handles gracefully

### Type Validation

- [ ] **Array type**: Requires array of objects
- [ ] **Object type**: Requires objects not primitives
- [ ] **String types**: Enforces string types for label/message
- [ ] **Type coercion**: Doesn't coerce non-strings
- [ ] **Return format**: Returns correct success format
- [ ] **Error format**: Returns correct error format

## Integration Tests

### Tool Execution

- [ ] **Tool discovery**: Tool appears in available tools list
- [ ] **Tool callable**: Can be called by LLM
- [ ] **With parameters**: Accepts all parameter types
- [ ] **Result handling**: Result is properly formatted
- [ ] **Error handling**: Errors don't crash the system

### Bridge Communication

- [ ] **Bridge exists**: __chatonsDisplayActionSuggestions exists
- [ ] **Bridge callable**: Can be called directly
- [ ] **Runtime detection**: Finds active runtime
- [ ] **Event emission**: Emits extension_ui_request
- [ ] **No runtime**: Handles gracefully when no runtime active
- [ ] **Event propagation**: Event reaches renderer

### Pi Session Integration

- [ ] **With active conversation**: Works during active conversation
- [ ] **During streaming**: Tool can be called while model is responding
- [ ] **Idle session**: Works after initial response
- [ ] **Multiple sessions**: Doesn't interfere with other conversations
- [ ] **Session cleanup**: Doesn't leak resources

## End-to-End Tests

### Manual Testing - Simple Case

1. Create new global conversation
2. Send message: "Use the display_action_suggestions tool to show me 2 options: 'Option A' with message 'I choose A' and 'Option B' with message 'I choose B'"
3. Verify:
   - [ ] Tool is called by model
   - [ ] Result shows success
   - [ ] No errors in console

4. Visual verification:
   - [ ] Two buttons appear in composer area
   - [ ] Button labels read "Option A" and "Option B"
   - [ ] Buttons are clickable (cursor changes)

5. User interaction:
   - [ ] Click first button → "I choose A" appears in text area
   - [ ] Buttons disappear after click
   - [ ] Can send the message normally

### Manual Testing - Three Options

1. Create new conversation
2. Send: "Show 3 options using the tool: Save, Preview, Cancel. Each with appropriate messages"
3. Verify:
   - [ ] Exactly 3 buttons render
   - [ ] Buttons in correct order
   - [ ] All are clickable
   - [ ] Each populates correct message

### Manual Testing - Edge Cases

#### Too Many Suggestions
1. Ask model to provide 5+ suggestions
2. Verify:
   - [ ] Tool accepts call
   - [ ] Only 4 buttons appear (5+ truncated)
   - [ ] No error shown to user

#### Long Labels
1. Ask model to provide very long labels (>50 chars)
2. Verify:
   - [ ] Labels are truncated
   - [ ] Text still reads sensibly
   - [ ] Buttons don't break layout

#### Empty Suggestions
1. Ask model to provide empty label or message
2. Verify:
   - [ ] Tool returns error
   - [ ] No buttons appear
   - [ ] Error is handled gracefully

#### Special Characters
1. Ask for options with emoji, special chars: "👍 Good", "❌ Bad", "💭 Think\nMore"
2. Verify:
   - [ ] Labels render correctly
   - [ ] Special chars display properly
   - [ ] No broken text encoding

### Manual Testing - Multi-Turn

1. First turn:
   - [ ] Tool shows 3 options
   - [ ] User clicks one
   - [ ] Message sent

2. Second turn:
   - [ ] Model responds
   - [ ] Tool shows 3 different options
   - [ ] User clicks another
   - [ ] Previous options are gone

3. Third turn:
   - [ ] Same pattern works
   - [ ] No accumulation of old options

### Manual Testing - Model Switching

1. Start with Model A
2. Show 2 options
3. Click one → works
4. Switch to Model B
5. Show 2 different options
6. Verify:
   - [ ] Works with new model
   - [ ] No conflicts
   - [ ] No lingering state

### Manual Testing - Project Conversations

1. Create project conversation
2. Use tool in project thread
3. Verify:
   - [ ] Works same as global
   - [ ] Buttons appear
   - [ ] Messages work
   - [ ] No project-specific issues

## UI/UX Tests

### Visual Layout

- [ ] Buttons are horizontally aligned
- [ ] Buttons don't overflow composer width
- [ ] Buttons have good spacing
- [ ] Buttons are appropriately sized
- [ ] Text is readable
- [ ] Buttons look clickable (have :hover state)

### Interaction

- [ ] Hover state is visible
- [ ] Click feedback is immediate
- [ ] Message appears instantly in textarea
- [ ] Text field gains focus after click
- [ ] User can edit message before sending
- [ ] User can clear and type instead

### Accessibility

- [ ] Buttons are keyboard navigable (Tab)
- [ ] Buttons are pressable with Enter/Space
- [ ] ARIA labels are present
- [ ] Color contrast is sufficient
- [ ] Screen readers can read button labels

## Error Scenarios

### Network/Process Issues

- [ ] Renderer window loses focus → try again, works
- [ ] Model stops responding → buttons don't appear
- [ ] Pi crashes → graceful error handling
- [ ] Long response → tool still works
- [ ] Short response → tool works

### Invalid States

- [ ] Call tool with null suggestions → error
- [ ] Call tool with wrong param names → error
- [ ] Call tool with numeric labels → error  
- [ ] Call tool with no parameters → error
- [ ] Call tool twice → second call replaces first

### Concurrency

- [ ] Two conversations showing options → only one active
- [ ] Model calls tool rapidly → last call wins
- [ ] User clicks while model is responding → handled gracefully
- [ ] Conversation ends while options showing → options clear

## Performance Tests

- [ ] Tool execution < 100ms
- [ ] Button rendering < 500ms after event
- [ ] No memory leaks (check DevTools after 100 calls)
- [ ] No CPU spike when displaying options
- [ ] Works with many conversations open

## Regression Tests

Make sure existing functionality still works:

- [ ] Other tools still work (read, bash, edit, write)
- [ ] Automation tool still works
- [ ] Thread continuity not affected
- [ ] Message history intact
- [ ] Models still load correctly
- [ ] Projects still work
- [ ] Settings still accessible

## Browser DevTools Checks

- [ ] No console errors
- [ ] No console warnings (except expected)
- [ ] Network tab shows event delivery
- [ ] React DevTools shows proper state updates
- [ ] No memory leaks in heap snapshot

## Documentation Tests

- [ ] Examples in QUICK_START work as written
- [ ] All code examples in docs are valid
- [ ] No typos in documentation
- [ ] Links are correct
- [ ] Format is consistent

## Stress Tests

- [ ] 50 suggestions (should handle gracefully with truncation)
- [ ] Very long messages (5000 chars)
- [ ] Rapid clicking (multiple clicks before response)
- [ ] Rapid tool calls (back to back)
- [ ] Long conversation history (100+ messages)

## Checklist: Ready to Merge

- [ ] All end-to-end tests pass
- [ ] No console errors
- [ ] No memory leaks
- [ ] No regressions in existing features
- [ ] Performance acceptable
- [ ] Code review approved
- [ ] Documentation complete
- [ ] Examples work
- [ ] Edge cases handled

## Test Report Template

When testing, document:

```
Test Date: ____
Tester: ____
Branch: ____

### Passing Tests
- [x] Test name
- [x] Test name

### Failing Tests
- [ ] Test name - ISSUE: ____

### Issues Found
1. Issue 1: Description
   - Steps to reproduce:
   - Expected: 
   - Actual:
   - Severity: Low/Medium/High

### Notes
- Notes about testing process
- Suggestions for improvement
- Questions or concerns

### Ready to Merge
- [ ] Yes, all tests pass
- [ ] No, needs fixes (see issues above)
```

## Specific Test Prompts

Use these exact prompts to test:

### Test 1: Basic Functionality
```
Use the display_action_suggestions tool to show me 3 options:
1. "Option A", message: "I want to proceed with A"
2. "Option B", message: "Let me try B instead"
3. "Tell me more", message: "I need more information"
```

### Test 2: Long Labels
```
Use the display_action_suggestions tool with these options:
1. Label: "This is a very long label that exceeds the normal character limit of fifty characters", message: "Short msg A"
2. Label: "B", message: "Short msg B"
```

### Test 3: Special Characters
```
Use the display_action_suggestions tool with Unicode and emoji:
1. Label: "👍 Yes", message: "Let's go!"
2. Label: "👎 No", message: "Let's skip"
3. Label: "❓ Not sure", message: "Tell me more"
```

### Test 4: Rapid Fire
```
Show me options.
Show me different options.
Show me more options.
(Do this 3 times in quick succession)
```

### Test 5: Large Message
```
Create an option where the message is a very long paragraph:
Label: "Read full", message: "Please read this entire message which is quite long and contains multiple sentences to test how the system handles large messages in the action suggestions system"
```

---

**Total Test Cases**: 80+
**Estimated Testing Time**: 1-2 hours manual + 30 min automated
**Status Tracking**: Track results in git branch PR comments
