# Requirement Sheets

Requirement sheets let extension tools pause execution and prompt the user to complete a prerequisite action (such as entering an API key, authenticating, or configuring a setting). A sheet slides down from the top of the conversation area as an iframe, feels native to Chatons, and supports both programmatic close (confirm) and user-initiated close (dismiss/cancel).

Chatons also uses this mechanism internally when an LLM provider returns an authentication error (401, expired token, invalid credentials). In that case, a built-in sheet appears explaining the issue and offering a shortcut to Settings.

---

## How it works

1. An extension tool detects that a mandatory requirement is not met (missing API key, expired OAuth token, unconfigured setting, etc.)
2. The tool returns a special error response that includes a `requirementSheet` object with the HTML to display
3. Chatons opens the sheet and keeps the tool call pending
4. The user completes the action inside the sheet iframe
5. The iframe calls `window.chaton.requirementSheet.confirm()` to signal completion, or the user dismisses the sheet
6. Chatons resolves the original tool call only after the sheet is confirmed or dismissed, so the agent does not need to reason about requirement sheets explicitly

---

## Returning a requirement sheet from a tool

When your extension API handler determines that prerequisites are not met, return an error with a `requirementSheet` property:

```javascript
// In your extension's API handler
function handleMyToolCall(params) {
  const apiKey = getStoredApiKey();

  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'API key not configured. Please set it in the sheet above.',
        requirementSheet: {
          title: 'Configure API Key',
          html: buildConfigSheetHtml(),
        },
      },
    };
  }

  // Normal execution...
  return { ok: true, data: { result: 'success' } };
}
```

### `requirementSheet` object

| Property | Type     | Required | Description                                          |
|----------|----------|----------|------------------------------------------------------|
| `title`  | `string` | No       | Title shown in the sheet header. Defaults to "Action Required". |
| `html`   | `string` | Yes      | Full HTML document to render in the sheet iframe.     |

---

## Sheet HTML and communication

The sheet is rendered as an iframe with `sandbox="allow-scripts allow-same-origin allow-forms"`. Your HTML has access to `window.chaton.requirementSheet` for communicating back to the host:

### Available methods

```javascript
// Signal that the user completed all required actions (closes the sheet)
window.chaton.requirementSheet.confirm();

// Dismiss the sheet (cancel, no action completed)
window.chaton.requirementSheet.dismiss();

// Open Chatons settings and dismiss the sheet
window.chaton.requirementSheet.openSettings();
```

### Alternatively via postMessage

You can also communicate directly via `postMessage`:

```javascript
// Confirm
window.parent.postMessage({ type: 'chaton:requirement-sheet:confirm' }, '*');

// Dismiss
window.parent.postMessage({ type: 'chaton:requirement-sheet:dismiss' }, '*');

// Open settings
window.parent.postMessage({ type: 'chaton:requirement-sheet:open-settings' }, '*');
```

---

## Complete example

### Extension manifest (`manifest.json`)

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "capabilities": ["llm.tools", "storage.kv"],
  "llm": {
    "tools": [
      {
        "name": "my_tool",
        "description": "Does something that requires an API key",
        "parameters": {
          "type": "object",
          "properties": {
            "query": { "type": "string" }
          }
        }
      }
    ]
  }
}
```

### API handler

```javascript
function handleMyTool(params) {
  const apiKey = kvGet('api_key');

  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'API key is required. A configuration sheet has been shown to the user.',
        requirementSheet: {
          title: 'Set up API Key',
          html: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 20px 24px;
    margin: 0;
    background: var(--chaton-ui-background, #f5f6f8);
    color: var(--chaton-ui-foreground, #1a1b22);
    font-size: 14px;
  }
  .field { margin-bottom: 16px; }
  label { display: block; font-weight: 500; font-size: 13px; margin-bottom: 6px; }
  input {
    width: 100%; box-sizing: border-box;
    padding: 8px 12px; border-radius: 8px;
    border: 1px solid var(--chaton-ui-border, #d6d9e2);
    background: var(--chaton-ui-card, #fff);
    color: inherit; font: inherit; font-size: 13px;
  }
  input:focus { outline: 2px solid var(--chaton-ui-ring, #6b7280); outline-offset: 2px; }
  .actions { display: flex; gap: 10px; justify-content: flex-end; }
  button {
    font: inherit; font-size: 13px; font-weight: 500;
    padding: 8px 18px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--chaton-ui-border, #d6d9e2);
    background: var(--chaton-ui-card, #fff);
    color: inherit;
  }
  button:hover { opacity: 0.85; }
  .btn-primary {
    background: var(--chaton-ui-primary, hsl(220 7% 32%));
    color: var(--chaton-ui-primary-foreground, #fff);
    border-color: var(--chaton-ui-primary, hsl(220 7% 32%));
  }
  @media (prefers-color-scheme: dark) {
    body { background: hsl(222 14% 12%); color: hsl(210 20% 90%); }
    input { background: hsl(222 13% 17%); border-color: hsl(222 10% 24%); }
    button { background: hsl(222 13% 17%); border-color: hsl(222 10% 24%); color: hsl(210 20% 90%); }
  }
</style>
</head>
<body>
  <div class="field">
    <label for="api-key">API Key</label>
    <input id="api-key" type="password" placeholder="Enter your API key" />
  </div>
  <p style="font-size: 12px; color: var(--chaton-ui-muted-foreground, #6b7280); margin-bottom: 16px;">
    Your key is stored locally and never shared.
  </p>
  <div class="actions">
    <button onclick="window.chaton.requirementSheet.dismiss()">Cancel</button>
    <button class="btn-primary" onclick="saveKey()">Save</button>
  </div>
  <script>
    function saveKey() {
      var key = document.getElementById('api-key').value.trim();
      if (!key) return;
      // Use the chaton KV storage bridge to save the key
      // (actual storage depends on your extension's backend)
      window.chaton.requirementSheet.confirm();
    }
  </script>
</body>
</html>`,
        },
      },
    };
  }

  // Use the API key
  return { ok: true, data: { result: callExternalApi(apiKey, params.query) } };
}
```

---

## Built-in auth error sheets

Chatons automatically shows a requirement sheet when an LLM provider returns an authentication error. This covers:

- **401 Unauthorized** responses
- **Expired tokens** (OAuth)
- **Invalid or missing API keys**
- **403 Forbidden** responses

The built-in sheet shows the error message and offers:
- A **Dismiss** button to close the sheet
- An **Open Settings** button that navigates to Settings > Providers & Models

No extension code is needed for this behavior -- it is built into the conversation runtime.

---

## Styling guidelines

To make your sheet feel native to Chatons:

1. Use the CSS variables from the Chatons UI system (available in the iframe):
   - `--chaton-ui-background`, `--chaton-ui-foreground`, `--chaton-ui-card`
   - `--chaton-ui-border`, `--chaton-ui-primary`, `--chaton-ui-muted-foreground`
   - See `docs/EXTENSIONS_UI_LIBRARY.md` for the full list

2. Use the `chatonExtensionComponents` global for pre-styled UI primitives:
   ```javascript
   var components = window.chatonExtensionComponents;
   var btn = components.createButton({ text: 'Save', variant: 'primary' });
   ```

3. Respect dark mode with `@media (prefers-color-scheme: dark)` or the CSS variables

4. Keep the sheet content compact -- the max height is ~360px

---

## User interaction

| Action | What happens |
|--------|-------------|
| Click close icon (X) | Sheet is dismissed (cancel) |
| Click outside the sheet (backdrop) | Sheet is dismissed (cancel) |
| Press Escape | Sheet is dismissed (cancel) |
| `window.chaton.requirementSheet.confirm()` | Sheet is confirmed and closed |
| `window.chaton.requirementSheet.dismiss()` | Sheet is dismissed (cancel) |

---

## Lifecycle

1. The sheet is shown when a tool returns a `requirementSheet` or when the runtime detects an auth error
2. Only one sheet can be active per conversation at a time
3. When dismissed or confirmed, the sheet state is cleared
4. The tool error has already been returned to the model by the time the sheet appears -- the model should instruct the user to retry after fixing the issue
