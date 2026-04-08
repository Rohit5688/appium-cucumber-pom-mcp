# Fix: ANDROID_HOME Detection in MCP Environment

## Issue
MCP server reported "ANDROID_HOME unset" and environment "not ready" despite:
- Appium running successfully
- Android device connected
- iOS simulator booted
- `adb` command working (device detected)

## Root Cause
The MCP server process only checks `process.env.ANDROID_HOME`, which contains the environment variables of the **MCP server process** itself, not the user's shell environment. 

When the MCP server is launched (e.g., by VS Code or another MCP client), it may not inherit `ANDROID_HOME` even if it's properly set in the user's `.bashrc`, `.zshrc`, or system environment.

## Solution
Implemented a **multi-tier detection mechanism** in `EnvironmentCheckService.checkAndroidSdk()`:

### Detection Strategy (in order)

1. **Process Environment Variables** (existing behavior)
   - Check `process.env.ANDROID_HOME`
   - Check `process.env.ANDROID_SDK_ROOT`

2. **Detect from `adb` Location** (NEW - fallback #1)
   - If `adb` command is available in PATH, determine its location
   - Extract SDK root from adb path: `$ANDROID_HOME/platform-tools/adb`
   - Verify it's a valid SDK directory (contains `platform-tools/` and `platforms/`)

3. **Common Installation Paths** (NEW - fallback #2)
   - macOS: `~/Library/Android/sdk`, `/usr/local/share/android-sdk`
   - Windows: `%LOCALAPPDATA%\Android\Sdk`, `%PROGRAMFILES%\Android\Sdk`
   - Linux: `~/Android/Sdk`, `/opt/android-sdk`
   - Check each path for validity (contains `platform-tools/`)

### Benefits

- ✅ **Works when ANDROID_HOME unset in MCP process** - Most common case
- ✅ **Leverages working `adb`** - If device is connected, adb must be in PATH
- ✅ **Falls back to standard locations** - Works for typical Android Studio installations
- ✅ **Helpful messages** - Indicates when SDK was detected via fallback
- ✅ **Graceful degradation** - Still provides clear error if SDK truly not found

## Changes Made

### Modified Files
- `src/services/EnvironmentCheckService.ts` - Enhanced `checkAndroidSdk()` method

### New Files
- `src/tests/EnvironmentCheckService.android-home.test.ts` - Comprehensive test suite

## Test Results

All 6 test cases pass:
- ✔ Detects ANDROID_HOME from process.env when set
- ✔ Detects Android SDK from adb location when ANDROID_HOME not in env
- ✔ Tries common paths when adb detection fails
- ✔ Doesn't crash when all detection methods fail
- ✔ Includes helpful message when SDK detected via fallback
- ✔ Handles both platform scenarios correctly

## Example Output

### Before Fix
```
❌ Android SDK: ANDROID_HOME / ANDROID_SDK_ROOT not set
```

### After Fix (when detected via adb)
```
✅ Android SDK: SDK detected via adb: /Users/user/Library/Android/sdk (ANDROID_HOME not in MCP env)
```

### After Fix (when detected via common path)
```
✅ Android SDK: SDK detected at: /Users/user/Library/Android/sdk (ANDROID_HOME not in MCP env)
```

## Migration Notes

No migration required. The fix is backward compatible:
- Existing behavior unchanged when ANDROID_HOME is properly set in process env
- Additional fallback mechanisms only activate when needed
- User-facing error messages remain clear and actionable

## Security Considerations

- Uses `execSync` with `which`/`where` commands (safe, no user input)
- File path validation before filesystem checks
- No shell interpolation of untrusted data
- Directory structure validation (must contain `platform-tools/` and `platforms/`)