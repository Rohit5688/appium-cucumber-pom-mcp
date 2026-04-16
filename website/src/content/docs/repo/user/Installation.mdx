---
title: 🛠️ Installation & MCP Setup
description: Complete step-by-step guide to installing AppForge and connecting it to your AI assistant.
---

import { Steps, Tabs, TabItem, FileTree, Card, CardGrid, Aside } from '@astrojs/starlight/components';

This guide takes you from zero to a live AppForge session connected to a real Android or iOS device. Follow every section — mobile automation has more moving parts than web, so don't skip the prerequisites.

---

## ✅ Prerequisites

AppForge automates real mobile devices and emulators via Appium. The full stack requires:

### Node.js & npm

| Requirement | Minimum Version | Verify |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | `node --version` |
| **npm** | `>= 9.0.0` | `npm --version` |

### Java (Required for Android)

Appium's UIAutomator2 driver requires Java. Install [JDK 11+](https://adoptium.net/).

```bash
java -version
# Expected: openjdk version "11.x.x" or higher
```

### Android SDK (for Android Testing)

1. Install [Android Studio](https://developer.android.com/studio)
2. In Android Studio → SDK Manager, install:
   - **Android SDK Platform** (API 30+)
   - **Android SDK Build-Tools**
   - **Intel/ARM Emulator**
3. Set the `ANDROID_HOME` environment variable:

<Tabs>
  <TabItem label="macOS / Linux">
    ```bash
    # Add to ~/.bashrc or ~/.zshrc
    export ANDROID_HOME=$HOME/Library/Android/sdk
    export PATH=$PATH:$ANDROID_HOME/platform-tools
    ```
  </TabItem>
  <TabItem label="Windows">
    ```powershell
    # Run in PowerShell as Administrator
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
    $env:PATH += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
    ```
  </TabItem>
</Tabs>

### Xcode (for iOS Testing, macOS only)

Install Xcode from the Mac App Store, then:
```bash
xcode-select --install
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Appium Server

```bash
npm install -g appium
appium --version  # Should print 2.x.x

# Install the required drivers
appium driver install uiautomator2   # For Android
appium driver install xcuitest       # For iOS (macOS only)
```

---

## 📦 Step 1: Verify AppForge is Accessible

AppForge is published to npm as **`appforge`**. Verify it resolves:

```bash
npx appforge --version
```

Expected output: `appforge vX.Y.Z`

---

## 🔌 Step 2: Connect to Your AI Client

<Tabs>
  <TabItem label="Claude Desktop">
    **Config file location:**
    - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

    **Add the AppForge server:**
    ```json
    {
      "mcpServers": {
        "appforge": {
          "command": "npx",
          "args": ["-y", "appforge"]
        }
      }
    }
    ```

    **Restart Claude Desktop completely**, then in a new conversation type:
    > *"List available AppForge tools"*

    You should see 35+ tools listed.
  </TabItem>
  <TabItem label="Cursor">
    **Create `.cursor/mcp.json`** in your project root:
    ```json
    {
      "mcpServers": {
        "appforge": {
          "command": "npx",
          "args": ["-y", "appforge"]
        }
      }
    }
    ```

    Reload Cursor: `Ctrl+Shift+P` → `Developer: Reload Window`.
  </TabItem>
  <TabItem label="Cline / Other">
    In your MCP client settings:
    - **Name**: `appforge`
    - **Command**: `npx`
    - **Args**: `-y appforge`

    Save and reconnect.
  </TabItem>
</Tabs>

---

## 📱 Step 3: Start the Appium Server

In a **separate terminal**, start Appium:

```bash
appium --base-path /wd/hub
```

Keep this terminal open. You should see:
```
[Appium] Appium REST http interface listener started on http://0.0.0.0:4723
```

:::tip[Keep Appium Running]
Appium must be running before any AppForge session starts. Consider adding it as a startup script or using `appium &` in your CI pipeline.
:::

---

## 🏗️ Step 4: Initialize Your Project

In your AI chat:

> *"Initialize a new AppForge project. Use Android as the platform and configure for a Pixel 8 emulator."*

AppForge will scaffold this structure:

<FileTree>
- src/
  - features/
    - **example.feature**
  - pages/
    - **BasePage.ts**
    - **ExamplePage.ts**
  - step-definitions/
    - **example.steps.ts**
  - utils/
    - **MobileGestures.ts**
  - test-data/
    - **users.staging.json**
- **mcp-config.json**
- **wdio.conf.ts**
- **package.json**
- **tsconfig.json**
</FileTree>

---

## ⚙️ Step 5: Configure Your Device Profile

Edit `mcp-config.json` to define your device. This is the most important configuration step.

<Tabs>
  <TabItem label="Android Emulator">
    ```json
    {
      "capabilitiesProfiles": {
        "pixel8": {
          "platformName": "Android",
          "automationName": "UiAutomator2",
          "deviceName": "emulator-5554",
          "app": "./builds/app-debug.apk",
          "appPackage": "com.yourapp.package",
          "appActivity": ".MainActivity",
          "noReset": true
        }
      },
      "activeProfile": "pixel8"
    }
    ```

    **Start the emulator** before running tests:
    ```bash
    # List available AVDs
    emulator -list-avds

    # Start a specific AVD
    emulator -avd Pixel_8_API_34
    ```
  </TabItem>
  <TabItem label="iOS Simulator">
    ```json
    {
      "capabilitiesProfiles": {
        "iphone15": {
          "platformName": "iOS",
          "automationName": "XCUITest",
          "deviceName": "iPhone 15 Pro",
          "bundleId": "com.yourapp.bundle",
          "udid": "AUTO",
          "fullReset": false
        }
      },
      "activeProfile": "iphone15"
    }
    ```

    **Start the simulator** via Xcode or:
    ```bash
    xcrun simctl boot "iPhone 15 Pro"
    open -a Simulator
    ```
  </TabItem>
  <TabItem label="Real Device">
    ```json
    {
      "capabilitiesProfiles": {
        "real_android": {
          "platformName": "Android",
          "automationName": "UiAutomator2",
          "deviceName": "Pixel 8",
          "udid": "YOUR_DEVICE_UDID",
          "app": "./builds/app-release.apk",
          "noReset": true
        }
      }
    }
    ```

    Get your device UDID:
    ```bash
    adb devices   # Android
    idevice_id -l # iOS
    ```
  </TabItem>
</Tabs>

---

## ✔️ Step 6: Confirm Everything Works

> *"Run the AppForge environment check. Tell me if Appium, Android SDK, and mcp-config are valid."*

Expected output from `check_environment`:
```
✅ Node.js: v20.11.0
✅ Appium: 2.x.x (running on port 4723)
✅ UiAutomator2 driver: installed
✅ Android SDK: found at $ANDROID_HOME
✅ Device/Emulator: emulator-5554 (online)
✅ mcp-config.json: valid
```

---

## 🚧 Troubleshooting

### Appium Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `Appium server not reachable` | Server not running | Run `appium --base-path /wd/hub` in a separate terminal |
| `UIAutomator2 driver not found` | Driver not installed | Run `appium driver install uiautomator2` |
| `No device connected` | Emulator not started | Start the emulator and verify `adb devices` shows it |
| `App not found` | Wrong `.apk` path in capabilities | Use an absolute path or verify the `.apk` exists with `ls ./builds/` |
| `Appium session timeout` | Slow emulator boot | Increase `sessionStart` timeout in `mcp-config.json` to `120000` |

### Android SDK Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `ANDROID_HOME not set` | Env variable missing | Set `ANDROID_HOME` to your SDK path and restart the terminal |
| `adb: command not found` | platform-tools not in PATH | Add `$ANDROID_HOME/platform-tools` to PATH |
| `cannot install` on real device | USB debugging off | Enable USB debugging in Developer Options on the device |

### MCP Connection Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| No tools appear | Config file has JSON error | Validate your JSON at [jsonlint.com](https://jsonlint.com) |
| `command not found: npx` | Node not in PATH | Use the full path: `/usr/local/bin/npx` |
| Config saved but no change | AI client not restarted | **Fully quit and reopen** Claude Desktop / Cursor |

---

## 🧭 Next Steps

<CardGrid>
  <Card title="5-Minute Quickstart" icon="rocket">
    Run your first mobile BDD test in [5 minutes](/AppForge/repo/user/quickstart/).
  </Card>
  <Card title="MCP Config Reference" icon="setting">
    Master every `mcp-config.json` property in the [Config Reference](/AppForge/repo/technical/mcp_config_reference/).
  </Card>
</CardGrid>
