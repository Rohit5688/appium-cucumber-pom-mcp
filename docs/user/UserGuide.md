# 📱 AppForge: Ultimate User Guide

Welcome to the future of mobile automation! This guide will walk you through setting up, mastering, and troubleshooting your AppForge integration. No more fighting with brittle XPaths or complex Appium configs—let's get your mobile tests running at light speed. 🚀

---

## 🏗️ 1. Getting Started

### 🌟 60-Second Quick Start
If you're starting from scratch, the `setup_project` tool is your best friend.

1.  **Phase 1 (Config)**: Run `setup_project`. It creates a `mcp-config.json` template.
2.  **User Input**: Briefly edit the config (set your app path and device name).
3.  **Phase 2 (Scaffold)**: Run `setup_project` again. It builds:
    *   `features/`, `pages/`, `step-definitions/`, and `utils/`.
    *   `BasePage.ts`, `MobileGestures.ts`, and `MockServer.ts`.
    *   `wdio.conf.ts` (tailored to your OS).
4.  **Verification**: Run `check_environment` to ensure your drivers and Appium are ready.

---

## 🛠️ 2. The Power Tools in Your Belt

| Tool | Purpose | When to Use |
| :--- | :--- | :--- |
| `analyze_codebase` | 🔦 The Scout | Before generating new tests. Learns your Page Objects, steps, and conventions. |
| `generate_cucumber_pom`| ✍️ The Architect | Prepares instructions for the AI to build new test flows. |
| `create_test_atomically`| ⚡ The Orchestrator| **[NEW]** Validates and writes feature + steps + POM in a single atomic call. |
| `start_appium_session` | 👁️ The Visionary | Connects to a live device to fetch XML and screenshots. |
| `heal_and_verify_atomically`| 🩹 The Surgeon | **[NEW]** Finds a fix, verifies it on-device, and trains the brain in one step. |
| `audit_mobile_locators`| 🛡️ The Auditor | Checks your Page Objects for brittle selectors (XPaths vs IDs). |
| `manage_config` | ⚙️ The Driver | **[NEW]** Central tool for updating builds, credentials, and app paths. |
| `execute_sandbox_code` | 🚀 Turbo Mode | Runs local analysis to extract data without flooding token budget. |

---

## 🧪 3. Real-World Power Examples

### 🚪 A. Cross-Platform POM
The tool enforces separate logic for Android and iOS when needed, while keeping the Gherkin shared.
- `pages/LoginPage.android.ts` (using `resource-id`)
- `pages/LoginPage.ios.ts` (using `accessibility-id`)
- Shared interface to keep step definitions clean!

### 🖱️ B. Advanced Gestures
No more complex W3C action code. Use the `MobileGestures` utility.
> *"Use the `MobileGestures` utility to scroll until the 'Sign Out' button is visible."*

### 🧠 C. Self-Healing in Action
Stale locator? No problem.
1. Test fails on `~submit_btn`.
2. run `heal_and_verify_atomically`.
3. The tool finds the element has moved, verifies the fix, and auto-trains the system so it never breaks again.

---

## 🩹 4. Troubleshooting: The Error DNA Matrix 💥

| Symptom | Error DNA | The Fix 🛠️ |
| :--- | :--- | :--- |
| `Appium not reachable` | `ECONNREFUSED` | Run `check_environment` to get the exact start command. |
| `Undefined Step` | `GherkinMismatch` | Run `analyze_codebase` to refresh the step registry. |
| `Session creation failed` | `CapabilityError` | Check `mcp-config.json`. Ensure `deviceName` matches your emulator. |
| `TSC Validation Error` | `TypeScriptFail` | Use `validate_and_write` to see the exact line-number error. |
| `Token usage spike` | `ContextLeak` | Use `execute_sandbox_code` instead of full-file reads. |

---

## 📝 5. Prompting Masterclass 🤖

- **Live Context**: *"Start an Appium session, look at the current screen, and generate a login test."*
- **Migration**: *"Here is an Espresso test. Migrate it to Appium Cucumber using my existing Page Objects."*
- **Coverage**: *"Analyze my coverage gaps. What negative scenarios am I missing for the checkout flow?"*

---

> [!NOTE]
> **Pro Tip**: Use `generate_ci_workflow` to automatically get a GitHub Action that runs your Appium tests on every PR! It reads your `mcp-config.json` to configure execution commands perfectly.

**Happy Mobile Testing! 📱✨**
