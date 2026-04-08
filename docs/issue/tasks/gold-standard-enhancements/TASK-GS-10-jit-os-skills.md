# TASK-GS-10 — JIT OS-Specific Skills (Android/iOS Context Injection)

**Status**: DONE  
**Effort**: Medium (~60 min)  
**Depends on**: Nothing — standalone skill files + index.ts hook  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Without platform-specific guidance, LLMs often cross-contaminate selectors:
- Suggesting `XCUIElementTypeButton` (iOS class) for Android tests
- Using `UIAutomator2` syntax on iOS projects
- Recommending `testID` (React Native concept) for native Android

**Solution**: Create `android.md` and `ios.md` skill files and inject the relevant one into the context only when the agent is working on a platform-specific file path.

---

## What to Create

### File: `src/skills/android.md` (NEW)

```markdown
# Android Mobile Testing Skills — AppForge Reference

## Selector Priority (Use in This Order)

1. **accessibility-id** (`~`) — Most stable, survives UI refactors
   ```javascript
   $('~loginButton')
   ```

2. **resource-id** (`id=`) — Good if IDs are stable
   ```javascript
   $('id=com.myapp:id/login_btn')
   // Short form (if unique): $('id=login_btn')
   ```

3. **UIAutomator2** (`-android uiautomator`) — Powerful for complex queries
   ```javascript
   $('-android uiautomator', 'new UiSelector().text("Login").className("android.widget.Button")')
   ```

4. **xpath** — Last resort only
   ```javascript
   $('//android.widget.Button[@text="Login"]')
   ```

## Android Class Names

| UI Concept | Android Class |
|:-----------|:-------------|
| Button | `android.widget.Button` |
| Text input | `android.widget.EditText` |
| Text label | `android.widget.TextView` |
| Image | `android.widget.ImageView` |
| List | `android.widget.ListView` |
| Scroll | `android.widget.ScrollView` |
| Toggle | `android.widget.Switch` |
| Checkbox | `android.widget.CheckBox` |

## Common Mistakes to Avoid

- ❌ `XCUIElementTypeButton` — iOS only, does not exist on Android
- ❌ `testID` — React Native prop, unreliable in native Android XML
- ❌ `accessibilityLabel` — iOS naming, Android uses `content-desc`
- ❌ `bundleId` — iOS concept, use `appPackage` + `appActivity` on Android
- ❌ `$('@login')` — This is iOS predicate syntax, use `$('~login')` for accessibility-id

## Android Capabilities Template

```json
{
  "platformName": "Android",
  "automationName": "UIAutomator2",
  "deviceName": "emulator-5554",
  "appPackage": "com.myapp",
  "appActivity": ".MainActivity",
  "noReset": true
}
```

## Locating Elements in XML

In Appium XML output, look for:
- `content-desc` → use as accessibility-id: `~content-desc-value`
- `resource-id` → use as id: `id=full.resource.id`
- `text` → use in xpath: `@text="value"`

## Self-Healing Priority

When a locator fails, try in this order:
1. Same `content-desc` with different class
2. Same `text` attribute with UIAutomator
3. Same position relative to parent container
4. Screenshot-based visual matching (last resort)
```

---

### File: `src/skills/ios.md` (NEW)

```markdown
# iOS Mobile Testing Skills — AppForge Reference

## Selector Priority (Use in This Order)

1. **accessibility-id** (`~`) — Most stable across iOS versions
   ```javascript
   $('~loginButton')
   ```

2. **iOS Predicate String** (`-ios predicate string`) — Powerful native queries
   ```javascript
   $('-ios predicate string', 'name == "Login" AND type == "XCUIElementTypeButton"')
   ```

3. **iOS Class Chain** (`-ios class chain`) — For specific hierarchy traversal
   ```javascript
   $('-ios class chain', '**/XCUIElementTypeStaticText[`label == "Login"`]')
   ```

4. **xpath** — Last resort only
   ```javascript
   $('//XCUIElementTypeButton[@name="Login"]')
   ```

## iOS Class Names (XCUIElement Types)

| UI Concept | XCUIElement Type |
|:-----------|:----------------|
| Button | `XCUIElementTypeButton` |
| Text input | `XCUIElementTypeTextField` |
| Secure input | `XCUIElementTypeSecureTextField` |
| Static text | `XCUIElementTypeStaticText` |
| Image | `XCUIElementTypeImage` |
| Table | `XCUIElementTypeTable` |
| Scroll view | `XCUIElementTypeScrollView` |
| Switch | `XCUIElementTypeSwitch` |
| Navigation bar | `XCUIElementTypeNavigationBar` |

## Common Mistakes to Avoid

- ❌ `android.widget.Button` — Android class, not valid on iOS
- ❌ `UIAutomator2` as automationName — Use `XCUITest` for iOS
- ❌ `resource-id` — Android concept, iOS uses `accessibilityIdentifier`
- ❌ `appPackage` / `appActivity` — Android-only, use `bundleId` for iOS
- ❌ `content-desc` — Android XML attribute, iOS uses `name` or `label`

## iOS Capabilities Template

```json
{
  "platformName": "iOS",
  "automationName": "XCUITest",
  "deviceName": "iPhone 15",
  "udid": "device-udid-here",
  "bundleId": "com.myapp.ios",
  "wdaLocalPort": 8100,
  "noReset": true
}
```

## Locating Elements in iOS iOS XML

In Appium XML output, look for:
- `name` attribute → accessibility-id: `~name-value`
- `label` attribute → predicate: `label == "value"`
- `value` attribute → predicate: `value == "value"`
- `type` attribute → class chain or predicate type filter

## Self-Healing Priority

When a locator fails, try in this order:
1. Same `name` attribute with different type
2. Same `label` with iOS predicate
3. Visual position within parent NavigationBar/TabBar
4. Screenshot-based visual matching (last resort)
```

---

## What to Update

### File: `src/index.ts`

Add a platform detection helper and inject the relevant skill into tool descriptions or context when file paths indicate a platform:

```typescript
import * as fs from 'fs';
import * as path from 'path';

// Platform skill content (loaded once at startup)
const ANDROID_SKILL = fs.readFileSync(
  path.join(__dirname, 'skills/android.md'),
  'utf-8'
);
const IOS_SKILL = fs.readFileSync(
  path.join(__dirname, 'skills/ios.md'),
  'utf-8'
);

/**
 * Detects platform from file path hints.
 * Returns 'android', 'ios', or null if unknown.
 */
function detectPlatformFromPath(filePath: string): 'android' | 'ios' | null {
  const lower = filePath.toLowerCase();
  if (lower.includes('android') || lower.includes('apk')) return 'android';
  if (lower.includes('ios') || lower.includes('ipa') || lower.includes('xctest')) return 'ios';
  return null;
}

/**
 * Returns the relevant skill content for a tool call, or empty string.
 */
function getPlatformSkill(args: any): string {
  // Check multiple arg patterns for file/screen paths
  const pathHints = [
    args?.filePath, args?.testPath, args?.screenName, args?.appPath
  ].filter(Boolean).join(' ');

  const platform = detectPlatformFromPath(pathHints);
  if (platform === 'android') return `\n\n---\n${ANDROID_SKILL}`;
  if (platform === 'ios') return `\n\n---\n${IOS_SKILL}`;
  return '';
}
```

Inject `getPlatformSkill(args)` into tool output for:
- `generate_cucumber_pom` — append to returned content
- `self_heal_test` — prepend as context
- `inspect_ui_hierarchy` — append selector guidance

---

## Verification

1. Run `npm run build` — skill files must be accessible at runtime:
   ```bash
   ls src/skills/
   # Should show: android.md  ios.md
   ```

2. Test platform detection manually:
   ```typescript
   console.log(detectPlatformFromPath('/tests/android/LoginTest.ts')); // 'android'
   console.log(detectPlatformFromPath('/tests/ios/LoginTest.ts'));     // 'ios'
   console.log(detectPlatformFromPath('/tests/shared/util.ts'));       // null
   ```

3. Verify that calling `generate_cucumber_pom` with an Android file path includes Android skill content in the response context.

---

## Done Criteria

- [x] `src/skills/android.md` created with selector priority, class names, mistakes, capabilities
- [x] `src/skills/ios.md` created with selector priority, class names, mistakes, capabilities
- [x] `detectPlatformFromPath()` helper added to `src/index.ts`
- [x] `getPlatformSkill()` injected into at least 3 relevant tools
- [x] Skill files included in build output (check `tsconfig.json` for asset copying)
- [x] `npm run build` passes with zero errors
- [x] Change `Status` above to `DONE`

---

## Notes

- **JIT = Just In Time** — skills are loaded at startup but injected only when relevant
- **Path-based detection is sufficient** — no need for session state for this optimization
- **Build note**: If skills directory isn't copied to dist/, update build script or use `__dirname` relative path with proper dist output
- **Zero cost when irrelevant** — if no platform detected, no tokens wasted on skill injection
