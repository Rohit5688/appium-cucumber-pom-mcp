### LS-07 — `perform_action` Floods AI Context With Raw XML + Base64 Per Step

**Real-world symptom (reported)**
User gave a 10-step flow prompt. AppForge performed 2 steps (Open Application → Click Sign In), then the AI replied with a generic "don't know what you want me to do" message and lost the entire task context.

**Root cause**
Every `perform_action` call currently returns:
```jsonc
{
"pageSource": "<full iOS XML hierarchy — can be 50–300 KB>",
"screenshot": "<Base64 image — can be 500 KB–2 MB>"
}
```
Over a 10-step flow that is potentially **5–20 MB of token-heavy data** pumped back into the AI context. Most LLM hosts impose context-window limits of 128K–200K tokens. After 2–3 steps the context is saturated, the AI drops its task directive, and the conversation falls back to a generic stateless response.

**Fix plan**
Make `perform_action` return a **compact summary by default**. Full XML and screenshot should be opt-in, not the default.

Change the `perform_action` response contract:

```typescript
// Default response (captureAfter=true, verboseCapture=false)
{
action: 'tap',
selector: '~signInButton',
success: true,
elementCount: 12, // count of interactive elements on new screen
screenTitle: 'Sign In', // first XCUIElementTypeStaticText value if available
topElements: [ // first 5 accessibility-id / label elements only
{ label: 'Sign In with Username', type: 'XCUIElementTypeButton', selector: '~signInWithUsername' },
...
],
screenshotAvailable: true, // flag — fetch with inspect_ui_hierarchy if needed
message: 'tap on ~signInButton succeeded. 12 elements on new screen.'
}

// Full capture only when verboseCapture: true is explicitly passed
{
...,
pageSource: '<full XML>',
screenshot: '<base64>'
}
```

This reduces per-step response from ~500 KB to ~1 KB while still giving the AI enough context (element count, screen title, top interactive elements) to plan the next step.

**Files to change**
- `src/services/AppiumSessionService.ts` — add `compactSummary()` helper that extracts top elements from page source without returning the full XML
- `src/index.ts` — change dispatcher default to compact; only include `pageSource`/`screenshot` when `verboseCapture: true`

**Status**: ✅ Fixed on `feature/token-optimization`. `performAction()` now returns `{ summary: { elementCount, screenTitle, topElements } }` by default (~1 KB). Raw XML + screenshot only when `verboseCapture: true` is explicitly passed. Per-step token cost reduced ~500×.

---

### LS-08 — AI Loses Task Directive Mid-Flow (No Persistent Workflow State)

**Real-world symptom (reported)**
After performing 2 of 10 steps, the AI gave up and replied: _"don't know what you want me to do yet — how can I help with these open files?"_

**Root cause — two compounding factors**

1. **Context saturation** (LS-07): Full XML + screenshot per step exhausted the context window, causing the AI to drop its task prompt.
2. **No workflow anchor in the MCP**: AppForge has no tool that holds the user's multi-step task description. When the AI's context window is full, it cannot rediscover "what was I doing" from tool responses alone. The task lives only in the initial prompt turn, which gets evicted.

**Fix plan**
Add a `workflow_context` field to `start_appium_session` and a new `get_workflow_status` tool:

```typescript
// start_appium_session — new optional field
{
projectRoot: string;
profileName?: string;
workflowSteps?: string[]; // NEW: user's plain-English step list
}

// Server persists steps + current index in .appium-mcp/active-session.json
// Every perform_action response includes:
{
...,
workflowProgress: {
currentStep: 2,
totalSteps: 10,
nextStep: 'On next page click on Sign In with Username button',
remainingSteps: ['Enter username...', 'Enter password...', ...]
}
}
```

This means the AI can always re-orient itself from the tool response alone, even after a context eviction. It does not need to remember the original prompt.

**Files to change**
- `src/services/AppiumSessionService.ts` — persist `workflowSteps` + `currentStepIndex` in session state
- `src/index.ts` — accept `workflowSteps` in `start_appium_session`, inject `workflowProgress` into every `perform_action` response

**Status**: ✅ Fixed on `feature/token-optimization`. `start_appium_session` now accepts `workflowSteps[]`. Every `perform_action` response includes `workflowProgress: { currentStep, totalSteps, nextStep, remainingSteps }` so the AI can re-orient itself without the original prompt.

---

### LS-09 — AI Guesses Selectors Without Seeing Live XML First

**Real-world symptom (reported)**
The user's prompt included step names like "Click on Sign In button" and "Click on Sign In with Username button". The AI has to guess selectors like `~signInButton` or `~signInWithUsername` without ever inspecting the actual XML hierarchy for those element names.

**Root cause**
`start_appium_session` returns only `elementsFound: 5` — a count, not the elements themselves. The AI starts the workflow with zero knowledge of real selector names on even the first screen.

**Fix plan**
Extend the `start_appium_session` response to always include `topElements` of the launch screen (same compact format as LS-07):

```jsonc
{
"sessionId": "...",
"platform": "iOS",
"device": "iPhone 17 Pro",
"elementsFound": 5,
"topElements": [
{ "label": "Sign In", "type": "XCUIElementTypeButton", "selector": "~Sign In" },
{ "label": "Create Account", "type": "XCUIElementTypeButton", "selector": "~Create Account" }
],
"message": "Session started. 5 elements found on launch screen."
}
```

This lets the AI map user intent ("Click Sign In") to real selectors (`~Sign In`) from the very first response, eliminating guesswork.

**Files to change**
- `src/services/AppiumSessionService.ts` — add `extractTopElements(xml)` helper
- `src/index.ts` — include `topElements` in `start_appium_session` response

**Status**: ✅ Fixed on `feature/token-optimization`. `start_appium_session` now returns `{ elementCount, screenTitle, topElements: [{ label, type, selector }] }` from the launch screen XML, giving the AI real selector names before any interaction.

---

### LS-10 — `start_appium_session` Drops `initialPageSource` and `screenshot` From Response

**Real-world symptom**
Session response returns only `elementsFound: N` (a count). The AI never sees actual screenshot or XML of the launch screen, so it cannot confirm what screen opened or identify real element names.

**Root cause**
The dispatcher deliberately strips `initialPageSource` and `screenshot` out of the `start_appium_session` response:
```typescript
// src/index.ts
return this.textResult(JSON.stringify({
sessionId: sessionInfo.sessionId,
...
elementsFound: this.executionService['parseXmlElements'](sessionInfo.initialPageSource).length,
// ← initialPageSource and screenshot are silently dropped
}, null, 2));
```
This was done to reduce token load, but it leaves the AI without any screen context at session start.

**Fix plan**
Apply the same compact-summary approach from LS-09: return `topElements` instead of the raw `pageSource`. This gives semantic context (element labels + selectors) without the token cost.

**Status**: ✅ Fixed on `feature/token-optimization`. Resolved as part of LS-09 — the dispatcher no longer drops `initialPageSource` but instead builds `launchSummary` (via `compactPageSummary()`) and returns that in the response.

---

## Fix Delivery Order

| Priority | ID | Work item | File(s) |
|----------|----|-----------|---------|
| ✅ | LS-07 | Compact `perform_action` response — remove default full XML/screenshot | `AppiumSessionService.ts`, `index.ts` |
| ✅ | LS-08 | Add `workflowSteps` to session + `workflowProgress` in action responses | `AppiumSessionService.ts`, `index.ts` |
| ✅ | LS-09 | Return `topElements` in `start_appium_session` response | `AppiumSessionService.ts`, `index.ts` |
| ✅ | LS-10 | Replace raw `pageSource` drop with semantic `topElements` in session start | `index.ts` |
| ✅ | LS-05 | Auto-fetch live XML in `inspect_ui_hierarchy` when session active | `index.ts` |
| ✅ | LS-02 | Add driver-presence check to `check_environment` | `EnvironmentCheckService.ts` |

## Acceptance Criteria

- A 10-step workflow prompt completes all 10 steps without the AI losing context.
- Each `perform_action` response is under 2 KB by default (compact mode).
- `start_appium_session` response includes real element labels and selectors from the launch screen.
- The AI can re-orient itself mid-flow using `workflowProgress` alone, without the original prompt.
- `inspect_ui_hierarchy` with no arguments returns live current-screen XML when a session is active.
- `check_environment` warns when the required Appium platform driver is not installed, with exact install command.
- `perform_action` with `verboseCapture: true` still returns full `pageSource` + `screenshot` for locator deep-dives.