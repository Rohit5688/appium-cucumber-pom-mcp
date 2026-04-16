---
title: 🔧 Troubleshooting
description: Comprehensive error reference for AppForge — every common mobile automation failure with root cause and fix.
---

import { Tabs, TabItem, Card, CardGrid } from '@astrojs/starlight/components';

Mobile automation has more failure surfaces than web automation. This page covers every common error — from device boot failures to Appium session timeouts — with verified fixes.

:::tip[Self-Diagnosis First]
Run `"Check the AppForge environment and report all failures"` in your AI chat. The `check_environment` tool automatically identifies 80% of setup issues including Appium reachability, SDK paths, and device availability.
:::

---

## 🔌 MCP Connection Failures

### No AppForge tools appear in the AI client

| Cause | Fix |
| :--- | :--- |
| JSON syntax error in config | Validate at [jsonlint.com](https://jsonlint.com) — check for trailing commas |
| Config file at wrong path | See exact OS paths in the [Installation guide](/AppForge/repo/user/installation/) |
| AI client not fully restarted | Quit completely (not just close window), then reopen |
| npx cache serving old version | `npm cache clean --force`, then restart client |

---

### `spawn npx ENOENT`

**Fix**: Use the absolute path:
```json
{
  "mcpServers": {
    "appforge": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "appforge"]
    }
  }
}
```

Find your path: `which npx` (macOS/Linux) or `(Get-Command npx).Source` (PowerShell).

---

## 📱 Appium & Device Failures

These are the most common class of failures in mobile automation.

### `Appium server not reachable at http://127.0.0.1:4723`

**Cause**: Appium is not running, or is running on a different port.

**Fix**:
1. Start Appium in a separate terminal: `appium --base-path /wd/hub`
2. Verify it's listening: `curl http://127.0.0.1:4723/wd/hub/status`
3. If using a custom port, update `mcp-config.json`:
   ```json
   { "appiumUrl": "http://127.0.0.1:4900/wd/hub" }
   ```

:::caution[Always Keep Appium Running]
AppForge does not start Appium for you. Appium must be running in a separate terminal before any session starts.
:::

---

### `No device found` / `Device offline`

**Android**:
```bash
adb devices
# Expected: "emulator-5554   device"
# If you see "offline": unplug and replug the USB cable, or cold-boot the emulator
```

**iOS**:
```bash
xcrun simctl list devices | grep Booted
# If nothing: open Xcode → Simulator, or run: xcrun simctl boot "iPhone 15 Pro"
```

**Fix for emulator not starting**:
```bash
# Check available AVDs:
emulator -list-avds

# Start with ARM/x86 flag explicitly:
emulator -avd Pixel_8_API_34 -no-snapshot-load
```

---

### `Could not start a new session` / `SessionNotCreatedException`

This is the most common error. The cause is almost always in the capability profile.

| Failure message | Cause | Fix |
| :--- | :--- | :--- |
| `App not found at path` | `.apk` / `.ipa` path wrong | Use an **absolute path** in `app` capability |
| `appPackage not installed` | App not on the device | Install first: `adb install ./builds/app-debug.apk` |
| `automationName not recognized` | Driver not installed | `appium driver install uiautomator2` |
| `Device is locked` | Device screen locked | Unlock manually or set `appium:autoGrantPermissions: true` |
| `Unsupported platform version` | OS version mismatch | Check `platformVersion` matches the device/emulator |
| `WebDriverAgentRunner` failed (iOS) | XCUITest bootstrap broken | Run `appium doctor --xcuitest` and follow the output |

**Quick diagnostic**: Run `"Check the Appium session health"` — the `check_appium_ready` tool will pinpoint the exact capability mismatch.

---

### `UIAutomator2 driver is not installed`

```bash
appium driver install uiautomator2
# Then verify:
appium driver list --installed
```

---

### Session starts but app doesn't launch

**Symptoms**: Appium session created successfully but the home screen shows instead of the app.

| Cause | Fix |
| :--- | :--- |
| Wrong `appPackage` | Get correct package: `adb shell pm list packages \| grep [appname]` |
| Wrong `appActivity` | Get correct activity: `adb logcat \| grep "START"` while launching manually |
| `noReset: true` with a stale state | Set `noReset: false` for a clean session, then switch back |

---

### Appium session takes > 60 seconds to start

**Cause**: Emulator is slow on first boot.

**Fix**:
```json
// mcp-config.json
{
  "capabilitiesProfiles": {
    "myDevice": {
      "appium:newCommandTimeout": 120,
      "appium:androidDeviceReadyTimeout": 120
    }
  }
}
```

---

## 🧪 Test Generation Failures

### `generate_cucumber_pom` returns empty output

**Cause**: The UI hierarchy XML was empty or returned no interactive elements.

**Fix**:
```
"Inspect the current UI hierarchy live on the device, then generate the Page Object for [ScreenName]"
```

The `inspect_ui_hierarchy` tool (no args) fetches the live XML from the connected device. If the screen is still loading, wait and retry.

---

### Generated locators fail immediately

**Symptom**: `"NoSuchElementException"` on the first run of a freshly generated test.

**Cause**: XPath or resource-ID locators are fragile and the element hierarchy changed.

**Fix** — always use accessibility IDs:
```
"Re-generate the Page Object for [ScreenName], but use only accessibility IDs and avoid XPaths"
```

Enforce this project-wide:
```
"Train AppForge to always prefer accessibility-id over XPath for all future generations"
```

See the [Locator Priority table in the User Guide](/AppForge/repo/user/userguide/#locator-priority).

---

### Step definitions not found (undefined steps)

**Cause**: The feature file references steps that don't exist in `step-definitions/`.

**Fix**:
```
"Analyze the project structure and report any step definition gaps"
```

The `analyze_codebase` tool will list all undefined steps and suggest the missing implementation files.

---

## 🔬 Test Execution Failures

### `run_cucumber_test` returns immediately with no output

**Cause**: The command in `mcp-config.json` `executionCommand` is wrong, or `node_modules` not installed.

**Fix**:
```bash
# In the project root:
npm install

# Verify the execution command manually:
npx wdio run wdio.conf.ts
```

If it works manually but not via MCP, check that `projectRoot` in `mcp-config.json` is an **absolute path**.

---

### `run_cucumber_test` times out (async job never completes)

**Cause**: Test is waiting on an element that never appears — device interaction hung.

**Fix Protocol**:
1. Run `"Check the test job status"` — `check_test_status` shows if the job is genuinely still running
2. If truly hung: kill the wdio process — `pkill -f wdio` (macOS/Linux) or `taskkill /IM "node.exe" /F` (Windows)
3. Increase timeout in `mcp-config.json`: `"timeoutMs": 300000` (5 minutes)

---

### Element found but click has no effect

**Cause**: Element is overlaid by another element (modal, loading spinner), or coordinates are mapped to a different screen region.

**Fix**:
1. Check for overlays: `"Inspect the UI hierarchy — are there any overlaying elements?"` 
2. Use `waitForSelector` before clicking:
   ```gherkin
   # In the feature file — add a visible wait
   When I wait for the login button to be visible
   And I tap the login button
   ```

---

### Gestures not working (swipe, scroll, pinch)

**Cause**: Coordinates are absolute pixels but the device DPI is different.

**Fix**: Use **percentage-based** coordinates, not absolute:
```typescript
// ❌ Brittle — breaks on different screen sizes
await driver.touchAction([{action: 'moveTo', x: 500, y: 1800}]);

// ✅ Resilient — percentage of screen
await MobileGestures.swipeUp(driver, 0.8);  // 80% down to top
```

Run `"Regenerate the gesture code for [FeatureName] using percentage-based coordinates"`.

---

## 🔧 Self-Healing Failures

### `self_heal_test` finds no candidates

**Cause**: The XML hierarchy was not passed to the healer, or the element is genuinely gone.

**Protocol**:
```
1. "Inspect the current UI hierarchy live on the device"
2. "Self-heal the failing selector '[old-selector]' using the XML you just captured"
```

Always provide fresh XML — never reuse a snapshot from a previous session.

---

### Healed selector works once but breaks on the next run

**Cause**: Dynamic resource-IDs that change per-launch.

**Fix**: After healing, ask for a more stable alternative:
```
"The healed selector uses a dynamic resource-id. Find a stable accessibility-id or content-desc alternative"
```

---

## 📊 Token & Performance Issues

### `Token budget exhausted` mid-session

**Fix protocol**:
1. Start a **new AI conversation** (resets context window)
2. Always lead with: `"Load the AppForge structural brain"` — uses Turbo Mode, not raw file reads
3. Work screen-by-screen — never ask to "analyze all page objects at once"

See the [Token Optimizer guide](/AppForge/repo/technical/tokenoptimizer/) for the full prevention strategy.

---

### UI hierarchy XML is huge (> 500KB)

**Cause**: Complex screens with many nested views.

**Fix**: Filter the XML in the sandbox before sending to the LLM:
```
"Get the UI hierarchy but filter to only show interactive elements (buttons, inputs, checkboxes)"
```

The `inspect_ui_hierarchy` tool supports element-type filtering.

---

## 🆘 Getting More Help

If this page doesn't resolve your issue:

1. **Check the session log**: Open `mcp-logs/viewer.html` — every tool call, capability profile, and error is captured.
2. **Run Appium doctor**: `appium doctor --android` or `appium doctor --ios` for a full environment diagnosis.
3. **File a GitHub issue**: [github.com/ForgeTest-AI/AppForge](https://github.com/ForgeTest-AI/AppForge/issues) — include the session log and the output of `check_environment`.
