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
