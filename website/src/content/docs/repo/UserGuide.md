---
title: "📱 AppForge: Ultimate User Guide"
---

import { Steps } from '@astrojs/starlight/components';

Welcome to the future of mobile automation! This guide will walk you through setting up, mastering, and troubleshooting your AppForge integration. No more fighting with brittle XPaths or complex Appium configs—let's get your mobile tests running at light speed. 🚀

---

## 🏗️ 1. Getting Started

### 🌟 New Project: From Zero to "Green" in 60 Seconds
If you're starting from scratch, follow these steps to scaffold your framework.

<Steps>

1. **Run the Tool**: Call `setup_project` with an empty directory.
2. **What Happens?**: 
    - Creates `features/`, `pages/`, `step-definitions/`, and `utils/` folders.
    - Installs `webdriverio`, `@cucumber/cucumber`, and `ts-morph`.
    - Scaffolds `tsconfig.json` and WebdriverIO configs.
    - Generates `BasePage.ts`, `MobileGestures.ts`, and `MockServer.ts`.
    - Creates a starter `mcp-config.json` with Android/iOS profiles.
3. **Next Step**: Run `npx wdio run wdio.conf.ts` to see the example pass!

</Steps>

### 🔄 Existing Project: Bring the Magic to Your Code
Already have a WebdriverIO project? We'll adapt to *you* instantly.

<Steps>

1. **Run Analysis**: Call `analyze_codebase`.
2. **Self-Healing Upgrade**: The MCP server will automatically detect your patterns and apply missing configurations.
3. **Zero-Config Maintenance**: The `upgrade_project` tool ensures your dependencies stay up-to-date with current standards.

</Steps>

---

## 🛠️ 2. The Power Tools in Your Belt

| Tool | Purpose | When to Use |
| :--- | :--- | :--- |
| `analyze_codebase` | 🔦 The Scout | Before generating new tests. Learns your Page Objects, steps, and conventions. |
| `generate_cucumber_pom` | ✍️ The Architect | When you have a new requirement. It prepares system instructions. |
| `validate_and_write` | ✅ The Builder | After code generation to validate TypeScript/Gherkin and write files. |
| `start_appium_session` | 👁️ The Visionary | Connect to a live device for 100% accurate locators and XML. |
| `self_heal_test` | 🩹 The Doc | Analyzes and fixes broken locators automatically. |
| `verify_selector` | ✅ The Verifier | Checks selector visibility and learns working fixes into the brain. |
| `audit_mobile_locators` | 🛡️ The Auditor | Checks Page Objects against 20 key Appium methods for quality. |
| `manage_users` | 👥 The Team Lead | Manages test credentials across environments with typed helpers. |
| `analyze_coverage` | 📈 The Strategist | Identifies coverage gaps and suggests missing scenarios. |
| `migrate_test` | 🚚 The Mover | Translates Espresso/XCUITest/Detox tests into Appium Cucumber. |
| `execute_sandbox_code` | ⚡ The Optimizer | Runs JS locally for silent, token-efficient data extraction. |

---

## 🧪 3. Real-World Power Examples

### 🚪 A. Cross-Platform POM (The Pro Way)
The tool enforces separate logic for Android and iOS when needed, while keeping the Gherkin shared.

**1. Generate the Page Object:**
Ask the AI: *"Create a Login page for both platforms."*

**2. What you get:**
- `pages/LoginPage.android.ts` (using `resource-id`)
- `pages/LoginPage.ios.ts` (using `accessibility-id`)
- Shared interface to keep step definitions clean!

### 🖱️ B. Advanced Gestures: Swipe & Scroll
No more complex W3C action code. Use our `MobileGestures` utility.

**Scenario**: Scroll down a settings list.
```gherkin
Scenario: Find Version Info
  Given I am on the "Settings" screen
  When I scroll down until I see "Version"
  Then I verify "Version" is displayed
```

**Implementation Tip**:
The AI will automatically use `MobileGestures.swipeUp()` or `scrollIntoView()` methods generated during setup.

---

## 🩹 4. Troubleshooting: The "Squash the Bug" Matrix 💥

| Symptom | Probable Root Cause | The Fix 🛠️ |
| :--- | :--- | :--- |
| `Appium not reachable` | Server not running. | Run `check_environment` for exact start-up commands. |
| `Undefined Step` | Regex mismatch. | Run `analyze_codebase` and re-sync step files. |
| `Session creation failed` | Profile mismatch. | Check `mcp-config.json` profiles & booted device. |
| `TSC Validation Error` | Syntax error in POM. | Use `validate_and_write` with `dryRun: true` to see the error. |
| `Context Length Exceeded` | Output dump too large. | Use `execute_sandbox_code` for data extraction. |

---

## 📝 5. Prompting Masterclass: How to Talk to the AI 🤖

### 📗 A. Live Context is King
*   **Prompt**: *"Start an Appium session, look at the current screen, and generate a login test based on what you see."*

### 📗 B. Migration Requests
*   **Prompt**: *"Here is an Espresso test `LoginActivityTest.java`. Please migrate it to Appium Cucumber using my existing Page Objects."*

### 📗 C. Coverage Strategy
*   **Prompt**: *"Analyze the coverage for my project. What negative scenarios am I missing for the checkout flow?"*

---

## ✅ 6. The "Dos & Don'ts" of AI Prompting

| Do 👍 | Don't 👎 |
| :--- | :--- |
| **Provide Profile Names**: Say *"Use the 'pixel8' profile"* to save time. | **Hardcode Credentials**: Use `manage_users` and `.env` files. |
| **Mention Accessibility**: Ask for A11y checks to trigger `content-desc` validation. | **Manual Rewrites**: Let the AI heal so the "system brain" learns. |

---

> [!TIP]
> **Pro Tip**: Use `generate_ci_workflow` to automatically get a GitHub Action that runs your Appium tests on every PR! It will dynamically intercept your `mcp-config.json` to properly configure execution.

**Happy Mobile Testing! 📱✨**