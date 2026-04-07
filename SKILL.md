---
name: appforge
description: The Unified Mobile Automation OS. Autonomous project lifecycle, structural awareness, self-healing, migration, and enterprise security.
trigger: /appforge
---

# 🛡️ AppForge: The Unified Mobile Automation OS

AppForge is a comprehensive engine for mobile automation (Appium + Cucumber). It is built for **Enterprise Scale**, providing structural governance, autonomous healing, and advanced security.

## 🧭 Core Architectural Workflows
*When performing any task, use the `workflow_guide` tool first. Follow these exact sequences:*

### 1. 🏗️ `new_project`: Zero-to-One
1.  `check_environment`: Verify Node, Appium, Android SDK/Xcode.
2.  `setup_project`: Scaffold BasePage, Features, Steps, and Hooks.
3.  `manage_config`: Set `deviceName`, `appPath`, and cloud credentials.
4.  `inject_app_build`: Link your `.apk` or `.ipa` to the configuration.
5.  `start_appium_session`: Confirm successful device handshake.

### 2. 📝 `write_test`: BDD Generation
1.  `execute_sandbox_code`: Scan codebase for existing steps/patterns.
2.  `export_navigation_map`: Visualize the POM graph to find reusable pages.
3.  `inspect_ui_hierarchy`: Snapshot the target screen XML for locator extraction.
4.  `generate_cucumber_pom`: Build the Feature, Steps, and Page Object.
5.  `validate_and_write`: Enforce TS types and Gherkin syntax before commit.

### 3. 🩹 `run_and_heal`: Outcome-Driven Maintenance
1.  `run_cucumber_test`: Execute and capture JSON failure reports.
2.  `self_heal_test`: Analyze failure + Live XML to find candidate fixes.
3.  `verify_selector`: Test the candidates in a **Sandbox REPL** first.
4.  `train_on_example`: Commit the fix to the model's memory to avoid regression.

## 🛠️ Complete Feature Registry (35+ Tools)

### Discovery & Inspection
- `inspect_ui_hierarchy`: Context-aware XML tree inspection with `#ref` tagging.
- `export_navigation_map`: Mermaid representation of the entire app flow.
- `get_session_health`: Real-time device metrics (CPU, Mem, Latency).

### Security & Compliance
- `redact()`: Used automatically in all logs to strip PII and sensitive tokens.
- `set_credentials`: Stores cloud-provider keys in a secure host-agnostic vault.
- `audit_utils`: Ensures all logic follows `Logger` and structured error standards.

### Migration & Upgrades
- `migrate_test`: Ports Espresso/XCUITest -> Appium with logic-preservation.
- `upgrade_project`: Safely bumps dependencies and refactors deprecated Appium APIs.

### AI Training & Logic
- `train_on_example`: Feeds specific team patterns back into the generation engine.
- `verify_selector`: REPL tool to test locators on live devices without re-running tests.

## 🧠 The Structural Brain Protocol
AppForge maintains a **Structural Brain** (`.AppForge/structural-brain.json`) to prevent "Brain Fog" and Token Bloat.

> [!IMPORTANT]
> **Warm-Start Check**: Before starting a task, ANY agent must run `python build_appforge_graph.py`.
> **Cohesion Check**: Any file with a Cohesion Score **< 0.2** is a maintenance risk. Do not add code to it; split it into separate Page Objects instead.

## 🪙 Token Optimization & Context
Mobile UI XML trees can be massive (>200KB). AppForge uses:
- **Depth Truncation**: Only extracting the elements the user actually sees.
- **Reference Tagging**: Mapping complex XPaths to simple `#ref1`, `#ref2` IDs for the LLM.

---
*Refer to docs/APPFORGE_PROMPT_CHEATBOOK.md for the 35KB specialized prompt library.*
