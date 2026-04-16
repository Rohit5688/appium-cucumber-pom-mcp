<p align="center">
  <img src="docs/readme-logo.png" width="400" alt="AppForge Logo">
</p>

# 🏗️ AppForge | Mobile Automation MCP Server

A production-grade Model Context Protocol (MCP) server that empowers AI Assistants (like Claude, Gemini, or Antigravity) to act as expert **Mobile Automation Engineers**. 

This server bridges the gap between natural language test intent and executable, strictly-typed **Appium + WebdriverIO + Cucumber (BDD)** test suites using the **Page Object Model (POM)** architecture. It goes beyond simple code generation by offering **live device introspection, self-healing locators, test coverage analysis, and cross-platform native test migration.**

---

## ⚡ 60-Second Quick Start: The "Buy Milk" Demo

Want to see AppForge in action immediately? Copy and paste these three prompts into your AI client (Cursor, Claude Desktop, etc.) to generate and run a real mobile test.

1.  **Prompt 1**: *"Check if my mobile environment is ready (Android/iOS)."*
2.  **Prompt 2**: *"I want to test the TodoMVC web app in a mobile browser. Create a test that adds 'Buy Milk', 'Clean Room', and 'Feed Cat', then verifies the count is 3."*
3.  **Prompt 3**: *"Now run the test and show me the results."*

**What happens?** AppForge will check your Appium setup, generate a typed Page Object, write the Gherkin feature, and execute the test on your connected emulator/simulator. Zero manual configuration required.

---

## 🌟 Core Capabilities

### 1. 🏗️ Intelligence-Driven Scaffolding
- Complete Appium/Cucumber `Node.js` project generation.
- Generates `tsconfig.json`, `cucumber.js`, `wdio.conf.ts`, `BasePage.ts`, and `MobileGestures.ts`.
- Configures Android UIAutomator2 and iOS XCUITest profiles out-of-the-box.

### 2. 🧠 Smart Test Generation
- Reads plain-English feature requests and outputs Gherkin `.feature` files alongside TypeScript Step Definitions and strictly-typed Page Objects.
- **AST-Powered Reuse**: Uses `ts-morph` to deeply scan your existing steps and page methods, aggressively preventing code duplication.
- **Platform-Aware**: Enforces `.android.ts` and `.ios.ts` split-POM design for cross-platform apps.

### 3. 📱 Live Device Introspection (Vision + XML)
- **Live Appium Connection**: Start a session with a connected Android emulator or iOS simulator.
- **Context-Aware Prompts**: Feed live device XML hierarchies and Base64 Vision Screenshots into the LLM context, ensuring the AI writes locators for elements that *actually exist* on the screen.

### 4. 🧰 Automated Self-Healing
- **Failure Analysis**: Interprets WebdriverIO stack traces and Appium errors.
- **Auto-Update**: Suggests fallback and optimal locators (prioritizing `accessibility-id`).
- **Auto-Learning**: Successfully verified heals are saved to a `.mcp-knowledge.json` brain. The MCP proactively injects this localized team knowledge into future generation prompts so the AI never makes the same mistake twice.

### 5. 🛠️ Advanced Tooling
- **Test Migration**: Convert legacy Espresso (Java), XCUITest (Swift), or Detox (JS) test files into Appium Cucumber TypeScript.
- **Coverage Analysis**: Heatmap metrics of your `.feature` footprint to find untested screens (including automated suggestions for Negative Scenario pathing and TalkBack/VoiceOver accessibility coverage).
- **Security & Hardening**: Built-in dry-run modes, atomic file backups before overwrites, AST syntax validation (`tsc --noEmit`), and safety audits catching `eval()` or leaked `.env` secrets.

---

## ⚡ For AI Agents Working on This Project

**🚨 MANDATORY READING BEFORE STARTING ANY WORK:**

1. **Onboarding Guide**: [`docs/user/Onboarding.md`](docs/user/Onboarding.md)
   - Step-by-step verification and configuration questionnaire.
2. **User Guide**: [`docs/user/UserGuide.md`](docs/user/UserGuide.md)
   - 60-second quick start and core tool reference.
3. **Prompt Cheatbook**: [`docs/user/APPFORGE_PROMPT_CHEATBOOK.md`](docs/user/APPFORGE_PROMPT_CHEATBOOK.md)
   - Battle-tested AI prompts for setup, generation, and healing.
4. **Technical Reference**: [`docs/technical/MCP_CONFIG_REFERENCE.md`](docs/technical/MCP_CONFIG_REFERENCE.md)
   - authoritative schema reference for `mcp-config.json`.

**Key Principle**: Use **Atomic Orchestrators** for all creation and healing tasks. Favor **Turbo Mode** (`execute_sandbox_code`) for codebase analysis.

---

## 📦 Installation & Setup

1. **Prerequisites**:
   * Node.js v18+
   * Custom MCP Client host (Cursor, Antigravity, Claude Desktop, etc.)
   * Java JDK / Android Studio / Xcode (depending on target platform)
   * Appium 2.x CLI globally installed (`npm install -g appium`)

### 2. 🔌 Bootstrapping the Server

Add the local server to your MCP Client settings:

```json
{
  "mcpServers": {
    "appforge": {
      "command": "node",
      "args": ["/path/to/AppForge/dist/index.js", "--transport", "stdio"]
    }
  }
}
```

> [!TIP]
> This server also supports **SSE transport** via `--transport sse --port 3100`.

---

## 🛠️ MCP Tool Reference (33 Exposes)

### 🏗️ Project Setup & Maintenance
* `setup_project`: Two-phase scaffolding for directory structure and dependencies.
* `upgrade_project`: Idempotent config migration and baseline file restoration.
* `manage_config`: Dynamic updates to `mcp-config.json` (build injection, platform swapping).
* `check_environment`: Comprehensive system health audit (Node, Appium, SDKs, Devices).

### ✍️ Atomic Generation
* `create_test_atomically` **[RECOMMENDED]**: Validates, lints, and writes Features + POM + Steps in one call.
* `generate_cucumber_pom`: Builds the contextual AI prompt with live UI snapshots.
* `execute_sandbox_code` **[TURBO]**: Runs V8-isolated scripts for fast project analysis (98% token savings).
* `migrate_test`: Translates Espresso, XCUITest, or Detox tests into Appium Cucumber.

### 🩹 Atomic Healing
* `heal_and_verify_atomically` **[RECOMMENDED]**: Diagnoses failures via **Error DNA**, finds candidates, and verifies the best fix live.
* `self_heal_test`: Heuristic-based locator repair using live UI context and memory.
* `verify_selector`: Live validation of a proposed selector strategy.

### 🏃 Execution & Perception
* `run_cucumber_test`: Async/Sync test execution with sanitized terminal output.
* `check_test_status`: Polling mechanism for background test jobs.
* `inspect_ui_hierarchy`: Captures simplified UI XML and visual screenshots for AI context.
* `start_appium_session`: Establishes driver connection with project-scoped pooling.

---

## 📝 Example AI Prompts

> *"Generate a new Checkout test suite using `create_test_atomically`. Use the live Appium session XML to find the button IDs."*

> *"My login test failed. Use `heal_and_verify_atomically` to diagnose the Error DNA and apply a verified fix."*

> *"Using Turbo Mode, count every Page Object that still uses XPath and suggest a refactoring plan."*

---

## 🔒 Safety & Security
- **Atomic Operations**: All writes are validated via `tsc --noEmit` before commitment.
- **V8 Sandbox**: turbo analysis is isolated and network-blocked.
- **Credential Guards**: Automatic `.gitignore` management for secure user roles.

*(Built for enterprise scale AI workflows by abstracting mobile configuration and technical debt.)*
