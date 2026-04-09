# MCP Tool — Issues (tool-only)

This file lists issues observed that are specifically about the AppForge / MCP tooling (not project-specific configuration). Fixed items are marked "Status: Fixed".

---

## Issue 1 — Environment variable propagation in MCP process

- Severity: High
- Observed: `check_environment` reported ANDROID_HOME/ANDROID_SDK_ROOT unset while the shell environment had them set.
- Reproduce:
  1. Export ANDROID_HOME in shell.
  2. Run MCP `check_environment` without restarting the MCP/AppForge process.
- Key log:

```
Android SDK: ANDROID_HOME / ANDROID_SDK_ROOT not set
```

- Suggested fix:

```bash
# Short-term: restart AppForge/MCP process so it inherits updated shell env
# Long-term: add an env-reload endpoint or allow mcp-config.json overrides for SDK paths
```

- Status: Fixed (user restarted MCP/AppForge; subsequent `check_environment` returned ready)
- Notes: Recommend documenting that MCP requires restart to pick up shell env changes.

---

## Issue 2 — MCP RPC timeout on large test runs

- Severity: Medium
- Observed: MCP reported `MCP error -32001: Request timed out` during a full `run_cucumber_test` operation.
- Reproduce: Run a large/full test run via `run_cucumber_test` (many specs/workers) causing long-running execution.
- Key log:

```
MCP error -32001: Request timed out
```

- Suggested fix:
  - Increase MCP request timeout for long-running operations.
  - Support streaming stdout/stderr back to the client instead of waiting for full completion.
  - Allow chunked execution (batch specs) or a keepalive mechanism.
- Status: Open
- Notes: This impacts reliability for large suites; recommended as priority for MCP ops.

---

## Issue 3 — Low diagnostic surface for MCP-executed failures

- Severity: Low
- Observed: When test runs fail (e.g., underlying CLI errors, missing files), MCP returns a short error/hint instead of structured error details.
- Reproduce: Trigger a failure in `run_cucumber_test` (missing app, capability mismatch, or webdriver errors) and observe MCP response.
- Example observed behavior: Raw runner errors appear in logs but MCP response is a generic timeout or hint.
- Suggested fix:
  - Return structured error payload: { errorType, exitCode, stdoutSnippet, stderrSnippet, hint }
  - Include links or exact config values MCP used (env, command, workingDir).
- Status: **FIXED 2026-04-09** — Implemented `ExecutionService.classifyWdioError(output)` which parses raw `stderr` and attaches a structured `diagnosis` JSON key to the tool result for well-known Appium/wdio crash patterns.
- Notes: Improves developer troubleshooting and reduces context switching.

---

## Issue 4 — MCP environment detection messaging inconsistency

- Severity: Low
- Observed: `check_environment` sometimes reports "SDK detected at: /path (ANDROID_HOME not in MCP env)" which is confusing.
- Reproduce: Run `check_environment` in different states (before/after MCP restart) and note messaging.
- Suggested fix:
  - Make messages deterministic and explicit: e.g., "SDK found at X (via probe)" vs "ANDROID_HOME missing in MCP process env".
- Status: Open
- Notes: Minor UX improvement for clearer outputs.

---

## Issue 5 — Test execution fails with missing capabilities error

- Severity: High
- Observed: `run_cucumber_test` fails immediately with "Missing capabilities, exiting with failure" even when mcp-config.json contains valid capabilities.
- Reproduce:
  1. Run `run_cucumber_test` with any tag (e.g., `@sample`)
  2. Execution fails within seconds with capabilities error
- Key log:

```
ERROR @wdio/cli:launcher: Missing capabilities, exiting with failure
Spec Files: 0 passed, 0 total (0% completed)
```

- Analysis: The MCP tool may not be properly passing capabilities from mcp-config.json to the WebDriverIO execution context, or there's a mismatch between the config format and what WebDriverIO expects.
- Suggested fix:
  - Verify capabilities mapping between mcp-config.json format and WebDriverIO config
  - Add validation step before test execution to ensure capabilities are properly loaded
  - Provide better error messaging indicating which specific capabilities are missing
- Status: Open
- Impact: Critical - prevents any test execution through MCP
- Notes: This is a blocker for production use as tests cannot be executed via MCP tools.

---

## Issue 6 — Codebase analysis output truncation

- Severity: Medium
- Observed: `execute_sandbox_code` with `analyzeCodebase()` returns truncated output when analyzing large codebases.
- Reproduce:
  1. Run `execute_sandbox_code` with `forge.api.analyzeCodebase()` on a project with many step definitions
  2. Output gets cut off at ~25000 characters with "TRUNCATED" message
- Key log:

```
... [TRUNCATED — response exceeded 25000 chars. Tip: narrow your script's return value to reduce output]
```

- Analysis: The MCP response has a character limit that can be exceeded by large codebase analysis results.
- Suggested fix:
  - Implement pagination or chunked responses for large outputs
  - Add filtering parameters to `analyzeCodebase()` to limit scope
  - Provide summary view with option to drill down into specific files/sections
- Status: **FIXED 2026-04-09** — Implemented scope `filters` (`{ type: 'pages'|'steps'|'features'|'utils', searchPattern: string }`) directly inside `CodebaseAnalyzerService.analyze()`. Updated `execute_sandbox_code` instructions to guide the LLM to use `filters`, `array.slice()`, or `array.map()` to narrow results before serialization, protecting the agent's context from token explosion while adhering to the 25,000 character limit.
- Impact: Medium - limits usefulness for large projects
- Notes: Affects code generation quality as full context may not be available.

---

## Issue 7 — Navigation mapping returns empty for existing projects

- Severity: Low
- Observed: `export_navigation_map` returns empty navigation data even for projects with existing tests and page objects.
- Reproduce:
  1. Run `export_navigation_map` on a project with existing feature files and page objects
  2. Returns "Known screens: 0" and empty Mermaid diagram
- Analysis: Navigation mapping may only work with active sessions or requires specific data collection during test execution.
- Suggested fix:
  - Add static analysis capability to infer navigation from existing step definitions and page objects
  - Document requirement for active session or specific workflow to populate navigation data
  - Provide option to manually seed navigation map from existing test artifacts
- Status: Open
- Impact: Low - reduces usefulness of navigation mapping feature
- Notes: Feature may require session-based exploration to be effective.

---

## Issue 8 — MCP runtime error: "require is not defined"

- Severity: Medium
- Observed: Several MCP tool calls (check_appium_ready, inspect_ui_hierarchy, execute_sandbox_code, etc.) returned the raw error:

```
Error:
require is not defined
```

- Reproduce:
  1. Call check_appium_ready or inspect_ui_hierarchy via MCP.
  2. Observe the "require is not defined" error in the MCP response.
- Suggested fix:
  - Ensure the MCP execution environment supports the module system used by the tool code (CommonJS vs ESM), or bundle/transpile tools appropriately.
  - Add defensive error handling to return structured error payloads instead of uncaught exceptions.
- Status: **NEEDS LIVE SESSION — Deferred 2026-04-09**
- Notes: Root cause requires runtime ESM inspection. Static analysis shows all MCP source files use `import` (not `require`). Error likely surfaces from a transitive CommonJS dependency inside webdriverio/appium under certain import paths. To reproduce: start Appium, call `check_appium_ready`, capture the raw Node.js stack trace from stderr. Will be diagnosed next live session.

## Issue 9 — Code generation (generate_cucumber_pom) crashes

- Severity: Medium
- Observed: `generate_cucumber_pom` failed with "Cannot read properties of undefined (reading 'length')".
- Reproduce:
  1. Call `generate_cucumber_pom` with a standard testDescription/testName.
  2. Observe the TypeError in MCP response.
- Analysis: Likely missing null-checks when accessing arrays or lists produced by codebase analysis.
- Suggested fix:
  - Add input validation and guard clauses for undefined values returned from analysis.
  - Return a clear validation error indicating which context data is missing.
- Status: **FIXED 2026-04-09** — Added `?? []` null-coalesce guards on all `CodebaseAnalysisResult` arrays in `TestGenerationService.generateAppiumPrompt()`. Arrays: `existingStepDefinitions`, `existingPageObjects`, `existingUtils`, and inner `steps` / `publicMethods`.

- Severity: Low
- Observed: `train_on_example` returned "Cannot read properties of undefined (reading 'find')" when invoked.
- Reproduce:
  1. Call `train_on_example` with a valid issuePattern and solution.
  2. Observe the TypeError in MCP response.
- Suggested fix:
  - Add defensive input validation in the training pipeline.
  - Provide structured validation errors when required fields are missing or malformed.
- Status: **FIXED 2026-04-09** — `LearningService.getKnowledge()` now normalizes the JSON result: checks `typeof raw === 'object'` and `Array.isArray(raw.rules)`, falls back to `{ version: '1.0.0', rules: [] }` on any schema drift.

- Observed: `train_on_example` accepted a sample rule and returned ruleId: `rule-20260408-01`.
- Action: Rule saved to MCP learning store. Consider verifying via export_team_knowledge.

## Issue 11 — self_heal_test blocked without XML / inspect tools failing

- Severity: Low
- Observed: `self_heal_test` returned HEAL_BLOCKED with message "No XML hierarchy available" when no active session or cached XML was present. Attempts to call inspect_ui_hierarchy failed earlier due to runtime errors (see Issue 8).
- Reproduce:
  1. Call `self_heal_test` with test output but without an active session or xmlDump.
  2. Observe HEAL_BLOCKED and guidance to start a session.
- Suggested fix:
  - Allow callers to pass xmlDump directly as fallback.
  - Cache recent XML snapshots and expose them for healing requests.
  - Improve error guidance to list required preconditions explicitly.
- Status: Open

## Issue 12 — run_cucumber_test: Appium connectivity and lifecycle issues

- Severity: High
- Observed: `run_cucumber_test` runs reported both "Missing capabilities" and later failed with ECONNREFUSED when Appium was not reachable. Errors included:

```
ERROR @wdio/cli:launcher: Missing capabilities, exiting with failure
...
WebDriverError: Request failed with error code ECONNREFUSED when running "http://localhost:4723/session"
```

- Reproduce:
  1. Run `run_cucumber_test` without ensuring Appium server is running / capabilities validated.
  2. Observe immediate failure with Missing capabilities or ECONNREFUSED.
- Suggested fix:
  - Validate capabilities and configuration before launching test workers.
  - Auto-start or verify Appium server availability and stream its logs into the MCP response.
  - Improve error payload to include which capability or connection check failed.
- Status: **FIXED 2026-04-09** — Addressed along with Issue 3. `ECONNREFUSED` and `Missing capabilities` are now explicitly classified in the `diagnosis` field, eliminating the generic error block and clearly identifying the missing config/service.
- Impact: Critical — blocks automated test execution via MCP.

## Issue 13 — Utility wrapper coverage gaps reported by audit_utils

- Severity: Medium
- Observed: `audit_utils` reported ~46% coverage with many missing helper methods (waitForElement, scrollIntoView, assertText, handleOTP, etc.).
- Reproduce:
  1. Run `audit_utils` against the project root.
  2. Observe `missingMethods` list and actionable suggestions.
- Suggested fix:
  - Implement the missing wrapper utilities listed by audit_utils.
  - Add unit/integration tests for the helpers and include them in CI.
- Status: Open

---

## Production Readiness Assessment

### ✅ Production Ready Features

- **Configuration management**: `manage_config` works reliably for reading/writing project settings
- **Environment checks**: `check_environment` provides comprehensive system validation
- **Code quality analysis**: `audit_utils`, `audit_mobile_locators`, and `suggest_refactorings` provide valuable insights
- **CI/CD generation**: `generate_ci_workflow` produces working GitHub Actions workflows
- **Workflow guidance**: `workflow_guide` provides clear step-by-step instructions

### ⚠️ Requires Fixes Before Production

- **Test execution**: Critical blocker preventing test runs (Issue #5)
- **Large project support**: Output truncation limits scalability (Issue #6)

### 📋 Recommended Pre-Production Actions

1. **Fix test execution capabilities issue** - highest priority blocker
2. **Implement response pagination** for large outputs
3. **Add integration tests** for core MCP tool workflows
4. **Document limitations and workarounds** for known issues
5. **Create troubleshooting guide** for common failure scenarios

---

## Recommendations for MCP roadmap (tool-side)

- Add an env-reload or config-override mechanism to avoid mandatory MCP restarts after shell env changes.
- Support streaming logs / incremental progress for long-running operations.
- Improve structured error responses from MCP tool endpoints.
- Document known behaviors (env propagation, recommended timeouts, recommended commands to run via MCP).
- **Fix capabilities mapping for test execution** (critical for production readiness)
- **Implement response pagination** to handle large codebase analysis
- **Add static navigation analysis** to populate navigation maps from existing artifacts





