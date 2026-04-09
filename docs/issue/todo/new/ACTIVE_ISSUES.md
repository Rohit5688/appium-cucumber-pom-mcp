# 🔴 Active AppForge Issues

**Last Updated**: 2026-04-09
**Consolidated from**: `liveissues.md`, `MCP_ISSUES_VERIFICATION_RESULTS.md`, `MCP_ISSUES.md`, and `PENDING_ISSUES.md`. All previously documented critical blockers and scaffolding bugs have successfully been resolved and verified.

---

## 🏗️ Architecture & Server Reliability

### Issue 1: MCP RPC Timeout on Large Test Runs (Formerly L2)

- **Problem:** The MCP client (e.g., Claude Desktop, Cline) enforces an unconfigurable RPC timeout (typically 2-5 minutes). When running extensive end-to-end regression suites via `run_cucumber_test`, the execution blocks until completion, causing the client to error out with an aggressive timeout drop, despite the server-side limits being extended.
- **Current Workaround:** Scope test runs carefully using cucumber `@tag` expressions to reduce run time.
- **Proper Solution Needed:**
  - Refactoring `run_cucumber_test` into an asynchronous/background execution model that immediately returns a `jobId`.
  - Introducing a new polling tool (`check_test_status`) or leveraging SSE progress mechanisms so the agent can check in on test state without blocking an active connection.
- **user note**
  - forget about running whole suite, user can do that without using mcp. The covern is the timeout happens when LLM is trying to verify the test built and timeout happens. Our focus should be only on that.

---

## 🛠️ Code Generation & Scaffolding

### Issue 2: Utility Wrapper Coverage Gaps (Formerly L13)

- **Problem:** When bootstrapping the project for the user via `setup_project`, the generated template files provide only ~59% coverage of core Appium functionality.
- **Impact:** Useful testing functions are often not native to the setup, requiring the LLM to write boilerplate raw Appium code inside test definitions.
- **Missing Methods List:**
  - `waitForElementVisible`
  - `waitForElementClickable`
  - `waitForElementGone`
  - `assertElementExists`
  - `typeText`
  - `clearText`
  - `switchToWebView`
  - `switchToNativeApp`
  - `takeScreenshot`
- **Proper Solution Needed:** Add these standard Appium helpers into the master Template Engine inside `ProjectSetupService` or the `./src/skills/` directory scaffold.
  **user note**
  good to have

---

## 🗺️ Logical Enhancements

### Issue 3: Navigation Mapping Empty Without Active Session (Formerly L7)

- **Problem:** Calling `export_navigation_map` returns an empty array when run statically on a repository.
- **Impact:** It natively relies entirely on the dynamic session state of visited PageObjects from an active Appium connection.
- **Proper Solution Needed:** Add a static analysis fallback mode. The tool should parse `.feature` flows and existing PageObject patterns (using `CodebaseAnalyzerService`) to extrapolate and infer the static screen-to-screen navigation map without needing to execute a test suite first.
  **user note**
  the call happened on new repo where nothing was written. Think how we can create map to make it easier, we have the graphify reference for that.
