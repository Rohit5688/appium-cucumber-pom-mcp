## Issues

### LS-01 — Appium 2/3 Base Path Incompatibility

**Symptom**
Every `start_appium_session` call against a running Appium 2 or 3 server returned:
```
WebDriverError: The requested resource could not be found ...
when running "http://localhost:4723/wd/hub/session" with method "POST"
```

**Root cause**
`AppiumSessionService` hardcoded `path: '/wd/hub/'`. Appium 2/3 dropped the `/wd/hub` prefix — the session endpoint is now at root `/`.

**Fix (already implemented)**
`detectAppiumPath()` probes `/status` and `/wd/hub/status` before connecting and selects the correct base path automatically. WebdriverIO is then initialised with the detected path.

**Status**: ✅ Fixed on `feature/token-optimization`.

---

### LS-02 — No Preflight Check for Missing Appium Drivers

**Symptom**
Session failed with:
```
Could not find a driver for automationName 'XCUITest' and platformName 'iOS'.
Run 'appium driver list --installed' to see.
```
The error was clear but AppForge itself gave no hint about it before the attempt.

**Root cause**
`check_environment` does not verify whether the required Appium driver (XCUITest / UiAutomator2) is installed for the target platform. Session startup discovers the gap at runtime rather than pre-flight.

**Fix plan**
In `EnvironmentCheckService.check()`, add a driver-presence check:
```
appium driver list --installed
```
Cross-reference against the platform in `mcp-config.json` (`XCUITest` for iOS, `UiAutomator2` for Android). If missing, surface:
```
❌ Appium driver: xcuitest not installed.
Fix: appium driver install xcuitest
```

**Status**: ✅ Fixed on `feature/token-optimization`. `checkAppiumDrivers` now checks all required drivers for the given platform (including `both`), returns exact `appium driver install <name>` commands for any missing driver.

---

### LS-03 — `end_appium_session` False Success

**Symptom**
After all failed session starts, `end_appium_session` returned `"Appium session terminated."` even though no session was ever established.

**Fix (already implemented)**
`endSession()` now returns an explicit state enum. The tool dispatcher returns:
- `{ status: "terminated" }` — session existed and was closed.
- `{ status: "no_active_session" }` — nothing was running, nothing terminated.

**Status**: ✅ Fixed on `feature/token-optimization`.

---

### LS-04 — Session Is Read-Only: XML Only From Launch Screen

**Symptom**
When asked to "navigate to the login screen and capture its hierarchy", the AI could not do it. `start_appium_session` returned the launch screen XML — and that was the only screen AppForge could ever see. Subsequent calls to `inspect_ui_hierarchy` showed unchanged data because no navigation occurred.

**Root cause**
This is an architectural gap. AppForge has **no MCP tool to interact with the device**. The full live tool inventory is:

| Tool | Capability |
|------|-----------|
| `start_appium_session` | Open session, fetch launch-screen XML + screenshot |
| `inspect_ui_hierarchy` | Parse/return XML — operates on what was passed in or the launch page source |
| `verify_selector` | Check if a selector exists on the current screen |
| `end_appium_session` | Close session |

None of these tools drive the app. `AppiumSessionService` has an internal `executeMobile()` method and a live `driver` reference, but neither is exposed to the MCP layer.

**Impact**
- Cannot navigate past the launch/splash screen.
- Cannot test any flow that requires interaction (login, checkout, settings, etc.).
- Live session feature is effectively limited to scanning one static screen.

**Fix plan — new `perform_action` tool**
See LS-06 below.

---

### LS-05 — `inspect_ui_hierarchy` Operates On Provided XML, Not Live Session

**Symptom**
When called without arguments after an active session, `inspect_ui_hierarchy` re-parsed the stale XML that was captured at session start. It does not poll the current device state.

**Root cause**
The tool's dispatcher calls `executionService.inspectHierarchy(args.xmlDump, ...)`. If `args.xmlDump` is empty, it falls through to cached or previously provided XML. There is no path from `inspect_ui_hierarchy → appiumSessionService.getPageSource()`.

**Fix plan**
When `xmlDump` is omitted and a session is active, `inspect_ui_hierarchy` should automatically call `appiumSessionService.getPageSource()` to fetch the current live screen XML. This makes the tool behave intuitively for live sessions.

Pseudocode change in dispatcher:
```typescript
case "inspect_ui_hierarchy": {
let xml = args.xmlDump;
if (!xml && this.appiumSessionService.isSessionActive()) {
xml = await this.appiumSessionService.getPageSource();
}
const result = await this.executionService.inspectHierarchy(xml, args.screenshotBase64 ?? '');
return this.textResult(JSON.stringify(result, null, 2));
}
```

**Status**: ✅ Fixed on `feature/token-optimization`. When `xmlDump` is empty and `isSessionActive()` is true, the dispatcher now calls `appiumSessionService.getPageSource()` automatically.

---

### LS-06 — Missing `perform_action` Tool (Critical Architectural Gap)

**Symptom**
AppForge cannot follow any user instruction that requires interacting with the app (tap, type, swipe, scroll, navigate back). The AI can see the first screen and nothing more.

**Root cause**
No interaction MCP tool exists. The registered tool list contains zero action primitives.

**Fix plan — implement `perform_action`**

#### Tool schema

```jsonc
{
"name": "perform_action",
"description": "[EXECUTOR] Perform an interaction on the live Appium session (tap, type, swipe, back, screenshot). Pass captureAfter: true to get updated XML + screenshot after the action — essential for multi-step navigation flows.",
"inputSchema": {
"type": "object",
"properties": {
"action": {
"type": "string",
"enum": ["tap", "type", "clear", "swipe", "back", "home", "screenshot"],
"description": "The interaction to perform."
},
"selector": {
"type": "string",
"description": "Target element selector (e.g. '~loginButton', 'id=com.app:id/btn'). Required for tap, type, clear."
},
"value": {
"type": "string",
"description": "Text for 'type'; swipe direction ('up'|'down'|'left'|'right') for 'swipe'."
},
"captureAfter": {
"type": "boolean",
"description": "If true, return updated page source XML and screenshot after the action. Default: true."
}
},
"required": ["action"]
}
}
```

#### Service implementation (additions to `AppiumSessionService`)

```typescript
public async performAction(
action: 'tap' | 'type' | 'clear' | 'swipe' | 'back' | 'home' | 'screenshot',
selector?: string,
value?: string
): Promise<{ success: boolean; pageSource?: string; screenshot?: string }> {
this.ensureSession();
const d = this.driver!;

switch (action) {
case 'tap': {
const el = await d.$(selector!);
await el.waitForDisplayed({ timeout: 10000 });
await el.click();
break;
}
case 'type': {
const el = await d.$(selector!);
await el.waitForDisplayed({ timeout: 10000 });
await el.setValue(value ?? '');
break;
}
case 'clear': {
const el = await d.$(selector!);
await el.clearValue();
break;
}
case 'swipe': {
const dir = value ?? 'up';
const dirs: Record<string, object> = {
up: { direction: 'up' },
down: { direction: 'down' },
left: { direction: 'left' },
right: { direction: 'right' },
};
await d.execute('mobile: scroll', dirs[dir] ?? dirs['up']);
break;
}
case 'back':
await d.back();
break;
case 'home':
await d.execute('mobile: pressButton', { name: 'home' });
break;
case 'screenshot':
break; // screenshot captured below regardless
}

return {
success: true,
pageSource: await d.getPageSource(),
screenshot: await d.takeScreenshot(),
};
}
```

#### Expected output

```jsonc
{
"action": "tap",
"selector": "~loginButton",
"success": true,
"pageSource": "<hierarchy>...</hierarchy>",
"screenshot": "<base64>",
"message": "tap on ~loginButton succeeded. Page source captured after action."
}
```

#### Usage flow this unlocks

```
start_appium_session → sees launch / splash screen
perform_action tap ~continueButton captureAfter:true → navigates to login
perform_action tap ~usernameField → focuses field
perform_action type value:"user@test.com" → types email
perform_action tap ~loginButton captureAfter:true → submits, sees home screen
inspect_ui_hierarchy → reads full home screen XML
generate_cucumber_pom → AI writes tests from live context
```

---

**Status**: ✅ Fixed on `feature/token-optimization`. `performAction()` added to `AppiumSessionService`, `perform_action` tool registered in `index.ts`.

## Fix Delivery Order

| Priority | ID | Work item | File(s) |
|----------|----|-----------|---------|
| P0 | LS-06 | Add `perform_action` service method | `src/services/AppiumSessionService.ts` |
| P0 | LS-06 | Register + dispatch `perform_action` MCP tool | `src/index.ts` |
| P1 | LS-05 | Auto-fetch live XML in `inspect_ui_hierarchy` when session active | `src/index.ts` |
| P1 | LS-02 | Add driver-presence check to `check_environment` | `src/services/EnvironmentCheckService.ts` |

## Acceptance Criteria

- `perform_action tap <selector>` navigates to a new screen; returns updated XML + screenshot.
- `perform_action type <selector> value:<text>` fills an input field.
- `perform_action swipe up` scrolls the current view down.
- `inspect_ui_hierarchy` with no arguments returns live current-screen XML when a session is active.
- `check_environment` warns when the required Appium platform driver is not installed, with exact install command.
