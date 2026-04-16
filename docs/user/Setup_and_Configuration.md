---
title: ⚙️ Setup & Configuration
description: Deep-dive into AppForge project structure, mcp-config.json anatomy, the Forge Session Viewer, and observability infrastructure.
---

import { FileTree, Tabs, TabItem, Card, CardGrid } from '@astrojs/starlight/components';

This guide covers everything that happens after you connect AppForge to your AI client — how the project is structured, how the configuration brain works, and how to audit every session.

---

## 📁 Project Structure

When you initialize an AppForge project with `setup_project`, this is the canonical directory layout:

<FileTree>
- src/
  - features/
    - **login.feature**
    - **onboarding.feature**
  - pages/
    - **BasePage.ts**
    - **LoginPage.ts**
    - **OnboardingPage.ts**
  - step-definitions/
    - **login.steps.ts**
    - **onboarding.steps.ts**
  - utils/
    - **MobileGestures.ts**
    - **WaitHelpers.ts**
  - test-data/
    - **users.staging.json**
    - **users.prod.json**
- builds/
  - **app-debug.apk** ← your app binary
- mcp-logs/
  - **session-2024-01-15.jsonl** ← auto-generated
  - **viewer.html** ← zero-install log viewer
- **.AppForge/**
  - **mcp-learning.json** ← AI knowledge store
  - **structural-brain.json** ← project map cache
- **mcp-config.json** ← central brain
- **wdio.conf.ts**
- **package.json**
- **tsconfig.json**
- **.env** ← credentials (gitignored)
</FileTree>

:::caution[Never Commit These]
`.env`, `users.prod.json`, and `mcp-logs/` should always be in your `.gitignore`. AppForge never adds them to git, but verify this in inherited projects.
:::

---

## 🗂️ `mcp-config.json` Anatomy

The config file is the single source of truth for AppForge. It is loaded at the start of every tool call. Use `manage_config` to modify it — never edit it manually while a session is active.

### Full Schema Reference

```json
{
  "schemaVersion": "2.0",
  "platform": "android",
  "currentEnvironment": "staging",
  "environments": ["local", "staging", "prod"],

  "appiumUrl": "http://127.0.0.1:4723/wd/hub",

  "capabilitiesProfiles": {
    "pixel8_emu": {
      "platformName": "Android",
      "automationName": "UiAutomator2",
      "deviceName": "emulator-5554",
      "app": "./builds/app-debug.apk",
      "appPackage": "com.myapp",
      "appActivity": ".MainActivity",
      "noReset": true,
      "appium:newCommandTimeout": 120,
      "appium:androidDeviceReadyTimeout": 90
    },
    "iphone15_sim": {
      "platformName": "iOS",
      "automationName": "XCUITest",
      "deviceName": "iPhone 15 Pro",
      "bundleId": "com.myapp.bundle",
      "fullReset": false
    }
  },

  "activeProfile": "pixel8_emu",

  "dirs": {
    "features": "src/features",
    "pages": "src/pages",
    "stepDefinitions": "src/step-definitions",
    "testData": "src/test-data",
    "locatorsRoot": "src/pages",
    "architectureNotesPath": "docs/architecture.md"
  },

  "executionCommand": "npx wdio run wdio.conf.ts",

  "timeouts": {
    "sessionStart": 90000,
    "testRun": 300000,
    "healingMax": 3
  },

  "credentials": {
    "strategy": "users-json",
    "file": "src/test-data/users.staging.json"
  },

  "tags": ["@smoke", "@regression", "@android", "@ios"],

  "basePageClass": "src/pages/BasePage",
  "customWrapperPackage": null,

  "reporting": {
    "outputDir": "mcp-logs",
    "format": "jsonl"
  }
}
```

### Field Reference

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `schemaVersion` | `string` | `"2.0"` | Config schema version. Used during `upgrade_project` to detect migration needs. |
| `platform` | `"android" \| "ios" \| "both"` | `"android"` | Default platform for generation and execution tools. |
| `currentEnvironment` | `string` | `"staging"` | Active environment. Determines which `users.{env}.json` file is loaded. |
| `environments` | `string[]` | `["staging"]` | All available environment names. |
| `appiumUrl` | `string` | `"http://127.0.0.1:4723/wd/hub"` | Full URL of the Appium server. Change if running on a custom port or remote host. |
| `capabilitiesProfiles` | `object` | — | Named device capability profiles. Add as many as needed for different device/OS combinations. |
| `activeProfile` | `string` | — | Key from `capabilitiesProfiles` to use for the current session. Switch with `manage_config { operation: "activate_build" }`. |
| `dirs.features` | `string` | `"src/features"` | Relative path to `.feature` files. |
| `dirs.pages` | `string` | `"src/pages"` | Relative path to Page Object Model files. |
| `dirs.stepDefinitions` | `string` | `"src/step-definitions"` | Relative path to Cucumber step definitions. |
| `dirs.testData` | `string` | `"src/test-data"` | Relative path to test data fixtures. |
| `dirs.locatorsRoot` | `string` | `"src/pages"` | Root scanned by `audit_mobile_locators`. |
| `dirs.architectureNotesPath` | `string` | — | Optional Markdown file with domain knowledge for AI context. |
| `executionCommand` | `string` | `"npx wdio run wdio.conf.ts"` | Command used by `run_cucumber_test`. Override for `yarn`, custom scripts, etc. |
| `timeouts.sessionStart` | `number` (ms) | `90000` | Max wait for Appium to boot and app to launch. Increase for slow emulators. |
| `timeouts.testRun` | `number` (ms) | `300000` | Max total test suite duration before timeout. |
| `timeouts.healingMax` | `number` | `3` | Max self-healing retry loops per failing locator. |
| `credentials.strategy` | `"users-json" \| "env" \| "none"` | `"users-json"` | How test credentials are loaded. |
| `credentials.file` | `string` | — | Path to users JSON (when strategy is `users-json`). |
| `tags` | `string[]` | `["@smoke"]` | Default Cucumber tags used during generation. |
| `basePageClass` | `string` | `"src/pages/BasePage"` | Relative path to base class. Generated pages `extend` this class. |
| `customWrapperPackage` | `string \| null` | `null` | npm package name for a custom base page (e.g., `@myorg/mobile-helpers`). |
| `reporting.outputDir` | `string` | `"mcp-logs"` | Directory for session logs and reports. |
| `reporting.format` | `"jsonl"` | `"jsonl"` | Log format. JSONL is consumed by the Forge Session Viewer. |

---

## 🔀 Switching Device Profiles

You never need to edit `mcp-config.json` manually to switch devices:

```
"Switch the active AppForge profile to 'iphone15_sim'"
```

This calls `manage_config({ operation: "activate_build", buildName: "iphone15_sim" })` internally, updating only the `activeProfile` key via deep merge — leaving all other settings intact.

---

## 🌍 Multi-Environment Credentials

The `users-json` strategy loads credentials from `src/test-data/users.{env}.json`:

```json
// users.staging.json
{
  "admin": {
    "username": "admin@staging.myapp.com",
    "password": "StagingPass123!",
    "role": "admin"
  },
  "readonly": {
    "username": "viewer@staging.myapp.com",
    "password": "ViewerPass123!",
    "role": "readonly"
  }
}
```

Reference in tests with the typed `getUser()` helper generated by `manage_users`:
```typescript
import { getUser } from '../test-data/users';
const admin = getUser('admin');  // { username, password, role }
```

---

## 📊 Forge Session Viewer

Every AppForge session automatically writes a `.jsonl` log to `mcp-logs/`. Open `mcp-logs/viewer.html` in any browser — no server, no install required.

### What It Shows

| Column | Description |
| :--- | :--- |
| **Timestamp** | When the tool call occurred |
| **Tool Name** | Which MCP tool was invoked |
| **Input** | The parameters passed (credentials masked) |
| **Output** | The returned data or error |
| **Token Estimate** | Approximate tokens consumed by this call |
| **Duration** | Execution time in ms |

### Filtering Logs

The viewer supports real-time filtering:
- By tool name — e.g., show only `start_appium_session` calls
- By status — show only errors
- By session date — compare runs across days

### Using Logs for Debugging

When a test fails mysteriously:
1. Open `mcp-logs/viewer.html`
2. Filter to the failing session
3. Find the `inspect_ui_hierarchy` call — the XML snapshot shows exactly what the device state was
4. Find the `run_cucumber_test` call — the output contains the full Appium error stack

---

## 🔒 Security Architecture

<CardGrid>
  <Card title="Local-First" icon="shield-check">
    All raw data (source code, XML hierarchies, credentials) stays on your machine. Only anonymized summaries reach the AI.
  </Card>
  <Card title="Credential Vaulting" icon="lock">
    `.env` and `users.*.json` are never included in MCP tool outputs or logs. Only typed references are exposed.
  </Card>
  <Card title="Path Sandboxing" icon="puzzle">
    All file operations are resolved against `projectRoot`. Traversal via `..` is rejected at the MCP handler level.
  </Card>
  <Card title="Secret Scanning" icon="warning">
    `validate_and_write` runs a regex scan for hardcoded passwords, API keys, and tokens before any file write.
  </Card>
</CardGrid>

---

## 🧠 The Structural Brain

AppForge maintains `.AppForge/structural-brain.json` — a cached project map that persists between sessions.

**Contents**:
- All discovered Page Object classes and methods
- Navigation graph (which screens connect to which)
- Learned healing rules from `train_on_example`
- Token usage history per session

**Reset the brain** if it becomes stale after a large refactor:
```
"Reset the AppForge structural brain and rebuild from scratch"
```

This deletes `.AppForge/structural-brain.json`. The next tool call rebuilds it automatically via Turbo Mode analysis.

---

## Related Pages

- [Master Tool Reference](/AppForge/api/toolreference/) — all 35+ tools with parameters
- [MCP Config Reference](/AppForge/repo/technical/mcp_config_reference/) — field-by-field schema detail
- [Troubleshooting](/AppForge/repo/user/troubleshooting/) — when things go wrong
