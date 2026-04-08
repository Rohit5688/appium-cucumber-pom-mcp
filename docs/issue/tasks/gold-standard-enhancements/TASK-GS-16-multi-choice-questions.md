# TASK-GS-16 — Multi-Choice Questions (Structured Clarification)

**Status**: DONE  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — updates existing tool  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

When the agent encounters ambiguity, it currently calls `request_user_clarification` with an open-ended question:

> "Which login button should I use?"

This is inefficient — the user must type a full answer, and the agent must parse unstructured text. A better UX is a structured numbered list that the user can respond to with just "1", "2", or "3".

**Before**:
```
Question: "Which login button should I use for the LoginScreen test?"
```

**After**:
```
Question: Which login button should I use?
Context: Found 3 elements with 'login' text on LoginScreen

Options:
  [1] Main form login (recommended) — accessibility-id: ~login_btn
  [2] Footer login — accessibility-id: ~footer_login  
  [3] Social login (Google) — accessibility-id: ~social_login

Reply with the option number (1-3):
```

---

## What to Update

### File: `src/tools/request_user_clarification.ts`

Find the existing tool handler. Update the input schema and output formatting.

#### Step 1 — Update input schema

```typescript
// In the tool registration (src/index.ts or the tool file):
inputSchema: {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      description: 'The clarification question (concise, ≤100 chars)'
    },
    context: {
      type: 'string',
      description: 'Background context explaining why clarification is needed'
    },
    options: {
      type: 'array',
      description: 'Structured response options. If provided, renders as numbered list.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Option number (1, 2, 3...)' },
          label: { type: 'string', description: 'Human-readable description' },
          detail: { type: 'string', description: 'Technical detail (locator, path, etc.)' },
          recommended: { type: 'boolean', description: 'Marks the recommended option' }
        },
        required: ['id', 'label']
      }
    },
    defaultOption: {
      type: 'number',
      description: 'Default option to use if user does not respond within the session'
    }
  },
  required: ['question']
}
```

#### Step 2 — Update the handler to format options

In the `request_user_clarification` handler:

```typescript
case 'request_user_clarification': {
  const { question, context, options, defaultOption } = args;

  let output = `❓ CLARIFICATION NEEDED\n`;
  output += `Question: ${question}\n`;

  if (context) {
    output += `Context: ${context}\n`;
  }

  if (options && Array.isArray(options) && options.length > 0) {
    output += `\nOptions:\n`;
    for (const opt of options) {
      const recommended = opt.recommended ? ' (recommended)' : '';
      const detail = opt.detail ? ` — ${opt.detail}` : '';
      output += `  [${opt.id}] ${opt.label}${recommended}${detail}\n`;
    }
    output += `\nReply with the option number (1-${options.length}):`;
  } else {
    output += `\nPlease provide your answer:`;
  }

  if (defaultOption !== undefined) {
    output += `\n(Default: option ${defaultOption} if unanswered)`;
  }

  return {
    content: [{ type: 'text', text: output }]
  };
}
```

#### Step 3 — Update tool description

```typescript
description: `Requests structured clarification from the user. Use when the agent finds ambiguity that cannot be resolved autonomously.

WHEN TO USE:
- Found multiple matching elements with no clear priority
- File conflict with multiple plausible resolutions
- Platform ambiguity (iOS vs Android) without clear signal
- User intent unclear for a destructive operation

WHEN NOT TO USE:
- Avoid if the answer can be inferred from context
- Avoid asking multiple questions at once
- Avoid for simple boolean decisions — pick the safer option

PARAMETER: options — If provided, renders a numbered selection table. User can respond with just the number.

OUTPUT INSTRUCTIONS: Display the question as-is. Do not rephrase or add commentary.`
```

---

## Usage Examples

### Example 1 — Element conflict

```typescript
// Tool call:
{
  question: "Which login button should I use for the test?",
  context: "Found 3 elements with 'login' text on LoginScreen",
  options: [
    { id: 1, label: "Main form login", detail: "~login_btn", recommended: true },
    { id: 2, label: "Footer login", detail: "~footer_login" },
    { id: 3, label: "Social login (Google)", detail: "~social_login" }
  ]
}

// Output:
// ❓ CLARIFICATION NEEDED
// Question: Which login button should I use for the test?
// Context: Found 3 elements with 'login' text on LoginScreen
//
// Options:
//   [1] Main form login (recommended) — ~login_btn
//   [2] Footer login — ~footer_login
//   [3] Social login (Google) — ~social_login
//
// Reply with the option number (1-3):
```

### Example 2 — Platform choice

```typescript
{
  question: "Which platform should the test target?",
  context: "Project has both android/ and ios/ directories",
  options: [
    { id: 1, label: "Android (UIAutomator2)", detail: "android/", recommended: true },
    { id: 2, label: "iOS (XCUITest)", detail: "ios/" },
    { id: 3, label: "Both platforms (separate files)", detail: "android/ + ios/" }
  ],
  defaultOption: 1
}
```

---

## Verification

1. Run: `npm run build` — must pass

2. Call `request_user_clarification` with the options schema:
   - Verify numbered options render correctly
   - Verify recommended option is labeled
   - Verify "Reply with the option number" prompt appears

3. Call without options (legacy mode):
   - Verify open-ended question still works
   - Verify no regressions in existing usage

---

## Done Criteria

- [x] Input schema updated with `options` array and `context` and `defaultOption` fields
- [x] Handler formats structured option table when `options` provided
- [x] Handler works in legacy mode (no options) without regression
- [x] Tool description updated with clear WHEN TO USE / WHEN NOT TO USE guidance
- [x] `npm run build` passes with zero errors
- [x] Manual test confirms numbered options render correctly
- [x] Change `Status` above to `DONE`

---

## Notes

- **Backward compatible** — existing calls without `options` still work (open-ended mode)
- **No LLM processing of response** — the user's number response is returned directly; the agent must parse "1" or "2" from the follow-up message
- **Keep question ≤100 chars** — enforced by description; long questions defeat the structured UX
- **Recommended flag is informational** — the agent should not auto-select the recommended option; always ask
