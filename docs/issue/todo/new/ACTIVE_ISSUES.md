# ✅ AppForge Active Issues — All Resolved

**Last Updated**: 2026-04-09
**Consolidated from**: `liveissues.md`, `MCP_ISSUES_VERIFICATION_RESULTS.md`, `MCP_ISSUES.md`, and `PENDING_ISSUES.md`.

---

## ✅ Issue 1: Non-Blocking Test Execution (Formerly L2) — FIXED

- **Root Cause**: `run_cucumber_test` blocked the MCP HTTP socket synchronously. Appium emulator boot + W3C negotiation takes 70-120s, exceeding the ~60s client socket timeout. The LLM lost all test output, blinding the verification loop.
- **User Note**: Forget whole-suite runs. The blocker was the LLM verifying a **single test it just wrote** timing out.
- **Fix**:
  - Introduced an in-memory **Job Queue** (`Map<string, TestJob>`) in `ExecutionService`.
  - `run_cucumber_test` now defaults to `runAsync: true` — fires in background, returns `{ status: "started", jobId }` immediately.
  - New **`check_test_status`** tool polls the queue with optional server-side `waitSeconds` sleep (max 55s, safe inside the 60s socket window).
  - Sync mode preserved via `runAsync: false` for CI/short runs.
- **Commit**: `feat(execution): non-blocking job queue for run_cucumber_test with check_test_status polling`

---

## ✅ Issue 2: Utility Wrapper Coverage Gaps (Formerly L13) — DEFERRED (Good-to-Have)

- **User Note**: "good to have" — not blocking.
- Missing methods: `waitForElementVisible`, `waitForElementClickable`, `waitForElementGone`, `assertElementExists`, `typeText`, `clearText`, `switchToWebView`, `switchToNativeApp`, `takeScreenshot`.
- Can be addressed in a future scaffolding template update pass.

---

## ✅ Issue 3: Navigation Mapping Empty Without Active Session (Formerly L7) — FIXED

- **Root Cause**: `export_navigation_map` only rendered the live session cache — it never called `extractNavigationMap()` which performs static PageObject + step file analysis.
- **User Note**: "the call happened on a new repo where nothing was written" — so even static analysis yields nothing.
- **Fix**:
  - `export_navigation_map` now calls `extractNavigationMap(projectRoot)` before rendering (static analysis of all PageObjects + step defs, no session needed).
  - `NavigationGraphService.rebuildGraphFull()` now calls `buildSeedMapFromConfig()` when static analysis finds 0 nodes.
  - Seed map reads `mcp-config.json` for the app name and scaffolds a 3-node conceptual graph: `AppEntry → Login → Home` with `confidence: 0.3` so the LLM always has an actionable framework.
  - `mapSource` field tracks `'static' | 'live' | 'seed'` and is returned in the response with a descriptive note.
- **Commit**: `feat(navigation): static analysis + seed map fallback for export_navigation_map`

---

## 📊 Final Status

| Issue | Priority | Status |
|-------|----------|--------|
| L2 — MCP RPC Timeout (verify loop) | High | ✅ Fixed |
| L7 — Navigation Map empty | Low | ✅ Fixed |
| L13 — Utility coverage gaps | Low | ⏳ Deferred (good to have) |

**All production-blocking issues resolved.** AppForge is stable for the core LLM-driven test-write → verify → heal workflow.


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
