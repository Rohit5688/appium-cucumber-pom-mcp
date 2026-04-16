# 🚀 Execution & Self-Healing

AppForge provides a complete, autonomous loop for mobile test execution: it drives live devices, analyzes failures via "Error DNA", and heals broken locators atomically.

---

## 🏃 1. Test Execution

### `run_cucumber_test` (Async & Sync)
Fires a Node subprocess to execute `npx wdio run wdio.conf.ts`. 

- **Async Mode (Default)**: Returns a `jobId` immediately. Use `check_test_status` to poll for completion. This prevents MCP timeouts during long test runs.
- **Sync Mode**: Use for very short runs (<30s). Returns the full output log directly.

### `check_test_status`
Polls the background test job. When complete, returns the status and a path to the generated Cucumber report.

---

## 🩹 2. Self-Healing Workflow

When a test fails because a locator is broken (e.g., `~submit_btn` was renamed), AppForge uses **Atomic Orchestration** to fix it instantly.

### `heal_and_verify_atomically` [RECOMMENDED]
The primary surgeon for broken tests. In a single call, it:
1.  **Diagnoses**: Analyzes the error using **Error DNA** to see if it's a locator failure.
2.  **Analyzes**: Fetches live UI XML and finds replacement candidates with a confidence score.
3.  **Verifies**: Immediately tests the best candidate on the live device.
4.  **Trains**: Auto-learns the fix into the project brain if verification passes.

### `self_heal_test` (Analysis Only)
If you want to manually review candidates before verifying, use this tool to get a list of replacement suggestions without interacting with the device.

---

## 🧬 3. Error DNA Classification

AppForge automatically classifies test failures to guide the healing process:

| DNA Code | Meaning | AI Action |
| :--- | :--- | :--- |
| `LocatorNotFound` | The selector is missing from the UI. | Triggers `heal_and_verify_atomically`. |
| `ActionFailed` | Element exists but isn't clickable or interactable. | Retries with scroll/wait or suggests a move. |
| `AssertionFail` | The app state is wrong (e.g. wrong text). | No healing; reports as an application bug. |
| `SessionTimeout` | Driver lost connection to Appium/Device. | Triggers `check_environment` and session reboot. |

---

## 👁️ 4. Live Inspection

Use these tools to gather context **BEFORE** writing new code or when manual debugging is needed.

- **`start_appium_session`**: Establishing the driver connection.
- **`inspect_ui_hierarchy`**: Captures a simplified UI tree and a visual screenshot.
- **`verify_selector`**: Sanity check to see if an element is visible/enabled right now.

---

## 🧠 5. Project Brain & Knowledge Base

Every successful atomic heal is saved to `.mcp-knowledge.json`. The server proactively injects these "learned rules" into future prompts, ensuring:
- **Zero-Repeat Errors**: The AI never tries a known-broken selector twice.
- **Adaptive Generation**: New tests use the most stable locators found during healing.
