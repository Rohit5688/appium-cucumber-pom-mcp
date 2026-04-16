# ⚙️ AppForge Conversation Workflows

This document outlines the standard operational workflows when conversing with an AI powered by the AppForge server.

---

### 1. New Mobile Project Setup (Two-Phase)
**User Prompt:**
> "I want to start a new mobile test project for an Android app in the `mobile-tests/` directory."

**Workflow:**
1.  **Phase 1 (Config)**: Calls `setup_project`. It creates a `mcp-config.json` template with `CONFIGURE_ME` placeholders.
2.  **Phase 2 (Scaffold)**: After you fill the config, calls `setup_project` again to build the `BasePage`, `MobileGestures`, and directory structure.
3.  **Validate**: Calls `check_environment` to ensure the Appium server and Android device are reachable.

---

### 2. Atomic Feature Generation
**User Prompt:**
> "I'm on the landing screen. Help me write a test that clicks 'Sign Up' and fills the form."

**Workflow:**
1.  **Live Snap**: Calls `start_appium_session` + `inspect_ui_hierarchy` to get the real-world XML and screenshot.
2.  **Context**: Calls `generate_cucumber_pom` passing the UI context.
3.  **Atomic Write**: Calls `create_test_atomically`. This validates the Gherkin and TypeScript syntax, then writes the `.feature`, `.steps.ts`, and `SignUpPage.ts` in a single atomic call to ensure consistency.

---

### 3. Atomic Self-Healing
**User Prompt:**
> "The 'Submit' button isn't being clicked correctly. Can you fix it?"

**Workflow:**
1.  **Diagnose**: Calls `inspect_ui_hierarchy`.
2.  **Heal & Verify**: Calls `heal_and_verify_atomically`. This:
    - Analyzes the XML to find the moved element.
    - Proposes replacement candidates.
    - Immediately tests the best candidate on the live device.
    - Trains the project's internal brain if successful.
3.  **Update**: The AI updates your Page Object file with the verified selector.

---

### 4. Legacy Migration (Espresso/XCUITest)
**User Prompt:**
> "We're moving off Espresso. Here is our old `CheckoutTest.java`. Convert it to this framework."

**Workflow:**
1.  **Analyze**: Calls `analyze_codebase` to see existing Page Objects.
2.  **Migrate**: Calls `migrate_test(sourceCode: '...', sourceFramework: 'espresso')`.
3.  **Write**: Calls `validate_and_write` to save the converted suite.

---

### 5. CI/CD Pipeline Automation
**User Prompt:**
> "Generate a GitHub Actions workflow to run my Android suite."

**Workflow:**
1.  **Config Read**: Calls `manage_config(operation='read')` to pull active device profiles.
2.  **Generate**: Calls `generate_ci_workflow` passing the extracted platform and command details.
3.  **Commit**: Saves the `.yml` to `.github/workflows/`.

---

### 6. Turbo Mode (Token Optimization)
**User Prompt:**
> "Tell me how many Step Definitions we have that use legacy xpath selectors."

**Workflow:**
1.  **Turbo Script**: The AI writes a lightweight script using `forge.api.searchFiles`.
2.  **Execute**: Calls `execute_sandbox_code` passing the script.
3.  **Synthesis**: The secure V8 sandbox processes all nodes and returns *only* the aggregated metric (e.g., `{"xpathCount": 42}`).

---

### 7. Workflow Guidance (The "Meta" Tool)
**User Prompt:**
> "How do I add a new test case to this project?"

**Workflow:**
1.  **Guide**: Calls `workflow_guide(workflow='write_test')`.
2.  **Execute**: The tool returns the exact sequence of tool calls needed (Audit -> Generate -> Orchestrate).
