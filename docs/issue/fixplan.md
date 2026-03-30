# AppForge Production Readiness Hardening

This document outlines the proposed fixes for the 14 functional bugs identified in the recent QA audit (`docs/issue/1.md` and `docs/issue/2.md`). Resolving these issues will eliminate systemic loops, prevent critical crashes in execution and environment checks, and improve the reliability of analysis tools.

## User Review Required

Please review the proposed architectural fixes below. Many of the blocks are currently caused by the misuse of `Questioner.clarify()`. The overarching strategy is to replace mid-flight blocking clarifications with either Pre-Flight schema validation (e.g. `forceWrite` boolean parameters) or non-recursive informational logs/warnings. 

> [!WARNING]
> Replacing `Questioner.clarify()` with warnings or error returns will change how errors are surfaced to the LLM agent using the MCP server, replacing interactive console loops with explicit structured error or warning messages.

## Proposed Changes

---

### Execution & Environment Services

#### [MODIFY] `src/services/EnvironmentCheckService.ts`
- **Issue 5:** Remove `Questioner.clarify()` for Appium 1.x detection. Ensure the tool gracefully continues and reports a warning with the `fixHint`.
- **Issue 6:** Remove `Questioner.clarify()` when no Android device is detected to avoid unreachable dead code. The check will cleanly return a `status: 'fail'` with an actionable `fixHint`.

#### [MODIFY] `src/services/ExecutionService.ts`
- **Issue 10a:** Fix `TypeError: Cannot read properties of undefined` by safely accessing `config?.project?.executionCommand`.
- **Issue 7:** If `executionCommand` is omitted and no override is passed, the tool will gracefully fallback to checking for `wdio.conf.ts` or `wdio.conf.js` instead of getting stuck in a `CLARIFICATION_REQUIRED` loop.

#### [MODIFY] `src/services/AppiumSessionService.ts`
- **Issue 4:** Ensure `appium:noReset = true` gets applied *before* `resolveCapabilities()` checks run, to prevent iOS users using only a `bundleId` getting blocked.

---

### Setup & Config Services

#### [MODIFY] `src/index.ts` (AppForgeServer)
- **Issue 8:** Update `inject_app_build` schema to accept a `forceWrite?: boolean` parameter.
- **Issue 10b:** Update `run_cucumber_test` schema to accept an `overrideCommand?: string` parameter, passing it into the handler.
- **Issue 9c:** Update `inspect_ui_hierarchy` handler so that if `xmlDump` isn't provided, `source` is correctly labelled as `"live"` instead of `"provided"`.

#### [MODIFY] `src/services/McpConfigService.ts`
- **Issue 8:** Update `updateAppPath()` to accept `forceWrite`. Instead of throwing `Questioner.clarify()` when a path does not exist, it will log a warning and proceed if `forceWrite` is true.

#### [MODIFY] `src/services/ProjectMaintenanceService.ts`
- **Issue 3:** Remove `Questioner.clarify()` in `upgradeProject()`. Replace with a standard `logs.push('ℹ️ Custom paths will be preserved')` informational log.

---

### Analysis & Reporting Services

#### [MODIFY] `src/services/AuditLocatorService.ts`
- **Issue 11:** Implement YAML locator parsing. When `yaml-locators` architecture is detected, read `.yaml` files in the locators directory to identify selectors and correctly measure brute (`//`) vs stable (`~`) locators, preventing 0-locator results.

#### [MODIFY] `src/services/SummarySuiteService.ts`
- **Issue 13:** Fix Cucumber JSON parsing logic so scenarios (nested within `feature.elements`) are counted and durations summed properly, instead of incorrectly counting `features.length`.

#### [MODIFY] `src/services/CodebaseAnalyzerService.ts`
- **Issue 14a:** Update `listFilesWithExtensions` to explicitly ignore Python/AI virtual environments such as `.venv` and `crew_ai`. This prevents glob pollution when discovering YAML locator files.

---

### Generation Services

#### [MODIFY] `src/services/TestGenerationService.ts`
- **Issue 14b:** Double-check and correct mis-encoded Windows-1252 symbols (`ΓåÆ` → `→` and `ΓÇô` → `—`) in the system prompt template.
- **Issue 14c:** Warn or fallback gracefully when `paths.pagesRoot` provided in `mcp-config.json` doesn't match actual Page Object locations (like `utils/`).

#### [MODIFY] `src/services/InspectUiHierarchyService.ts` (or equivalent file handling inspection)
- **Issue 9a:** Ensure `screenshot` data from the active session is properly attached to the return object instead of hard-coding an empty string.
- **Issue 9b:** Improve XML parsing mapped items to extract `value=` to `.text` and standardise `x/y/width/height` attributes into `.bounds`.

#### [MODIFY] `src/services/CiWorkflowService.ts`
- **Issue 16:** Leverage project config (`options`) to insert the correct `deviceName`, test execution command, and report path into the generated `.github/workflows/appium-tests.yml` templates, rather than hardcoding static values.

## Open Questions
- For **Issue 12** (`suggest_refactorings` false positives) and **Issue 15** (`self_heal_test` prompt return), these are marked as High/Medium effort and architectural changes. Should I prioritise fixing them in this exact sprint, or focus exclusively on the Must Fix / High Severity list outlined above first?
 
## Verification Plan
1. **Automated Analysis:** Locally parse YAML files using `execute_sandbox_code` script testing to verify AST and YAML detection paths are correct.
2. **Review Code Diffs:** Perform diff reviews on the modifications addressing loops to ensure no unreachable pathways persist.
3. **TypeScript Build:** Run `npm run build` or TS compilation checks internally to ensure all schema definitions compile successfully.
