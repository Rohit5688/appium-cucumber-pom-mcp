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

## Locating Elements in iOS XML

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
