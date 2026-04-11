---

---

# ⚙️ MCP AI Conversation Workflows: Appium Edition

This document outlines the standard operational workflows when conversing with an AI powered by the AppForge server.

---

### 1. New Mobile Project Setup
**User Prompt:**
> "I want to start a new mobile test project for an Android app in the `mobile-tests/` directory."

**AI Engine Workflow:**
1.  **Scaffold**: Calls `setup_project(projectRoot: 'mobile-tests/', platform: 'Android')`.
2.  **Config**: Asks you to provide the path to your `.apk` and the name of your emulator.
3.  **Validate**: Calls `check_environment` to ensure the Appium server and Android device are reachable.
4.  **Baseline**: Creates your first `LoginPage.ts` and `login.feature` boilerplate.

---

### 2. Feature Generation & Live Context
**User Prompt:**
> "I'm on the landing screen of my app. Help me write a test that clicks the 'Sign Up' button and fills out the form."

**AI Engine Workflow:**
1.  **Live Snap**: Calls `start_appium_session` to connect to your emulator.
2.  **UI Analysis**: Calls `inspect_ui_hierarchy` to get the current XML and a visual screenshot.
3.  **Code Gen**: Calls `generate_cucumber_pom` passing the real-world XML context to find the exact `accessibility-id` for the 'Sign Up' button.
4.  **Commit**: Calls `validate_and_write` to save the new `.feature`, `.steps.ts`, and `SignUpPage.ts` files after a successful `tsc` syntax check.

---

### 3. Verification & Auto-Learning
**User Prompt:**
> "The 'Submit' button isn't being clicked correctly. Can you fix the selector?"

**AI Engine Workflow:**
1.  **Diagnose**: Calls `self_heal_test` with the failing output.
2.  **Fix**: The tool identifies that `~btn_submit` is now `~btn_save_changes`.
3.  **Verify**: Calls `verify_selector(selector: '~btn_save_changes', projectRoot: '.', oldSelector: '~btn_submit')`.
4.  **Learn**: Because the live element is visible, the tool returns a "Success" and automatically saves the fix to the project's **Brain** (`.mcp-knowledge.json`).
5.  **Inject**: Next time you generate a test, the server proactively tells the AI about this fix!

---

### 4. Legacy Migration (Espresso/XCUITest)
**User Prompt:**
> "We're moving off Espresso. Here is our old `CheckoutTest.java`. Convert it to this new Appium framework."

**AI Engine Workflow:**
1.  **Analyze**: Calls `analyze_codebase` to see what Page Objects you already have.
2.  **Migrate**: Calls `migrate_test(sourceCode: '...', sourceFramework: 'espresso')`.
3.  **Refactor**: The AI Maps `withId(R.id.cart_icon)` into `$('id=com.app:id/cart_icon')` and generates a clean Cucumber suite.
4.  **Confirm**: Calls `validate_and_write(dryRun: true)` so you can review the translation before it hits your disk.

---

### 5. CI/CD Pipeline Automation (Zero-Config)
**User Prompt:**
> "Generate a GitHub Actions workflow to run my Android suite on every PR."

**AI Engine Workflow:**
1.  **Config Read**: Directly reads `mcp-config.json` to pull your active device profiles, execution commands, and target SDKs.
2.  **Generate**: Calls `generate_ci_workflow` passing the exact environments pulled automatically (No manual input needed!).
3.  **Validate**: Checks the resulting `.yml` for accurate Appium server boot steps and saves it to `.github/workflows/`.

---

### 6. Health Checks & Memory Optimization
**User Prompt:**
> "My tests keep timing out or failing to connect to Appium. Can you check if the ports are locked up?"

**AI Engine Workflow:**
1.  **Diagnose**: Calls `get_session_metrics` to survey the active project-scoped connection pool.
2.  **Analyze**: Identifies abandoned/idle `SessionManager` locks that have breached their timeouts but haven't been successfully purged.
3.  **Resolve**: The AI explains which zombie processes or locked endpoints need to be cleared, referencing the `[AppForge]` observability logs for root cause data.

---

### 7. Big Data Analytics (The Token Optimizer Mode)
**User Prompt:**
> "Tell me how many Step Definitions we have that use legacy xpath selectors."

**AI Engine Workflow:**
1.  **Scripting**: Instead of calling `analyze_codebase` conventionally (which returns thousands of lines of JSON and overloads context limits), the AI writes a lightweight extraction script.
2.  **Execution**: Calls `execute_sandbox_code` passing the custom script.
3.  **Synthesis**: The secure V8 sandbox spins up locally, processes all AST nodes across the project, and returns *only* the aggregated metric (e.g., `{"xpathSteps": 42}`).
4.  **Report**: The AI presents the math to the user cheaply and safely!
