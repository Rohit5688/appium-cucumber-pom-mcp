# Stabilization Progress — Live Tracker
_Last updated: 2026-04-24 Session 2. Update this file every session before stopping._

## Critical User Journeys Under Test

### Journey A: TestForge (Web Automation)
```
setup_project → check_playwright_ready → inspect_page_dom
→ generate_gherkin_pom_test_suite → validate_and_write → run_playwright_test
```

### Journey B: AppForge (Mobile Automation)
```
setup_project → check_environment → start_appium_session
→ inspect_ui_hierarchy → generate_cucumber_pom → validate_and_write → run_cucumber_test
```

---

## All Fixes Applied

| ID | File | Fix | Status |
|---|---|---|---|
| S1-TF | TestForge/execute_sandbox_code.ts | Removed 4x isAbsolute path bypass | ✅ |
| S1-AF | AppForge/execute_sandbox_code.ts | Already secure (inline boundary check) | ✅ |
| S2 | TestForge/_helpers.ts + inspect_page_dom.ts | Added validateUrl, wired in tool | ✅ |
| B1 | TestForge/DomInspectorService.ts | stackTraceLimit guard before chromium.launch | ✅ |
| B2 | AppForge/PreFlightService.ts | checkConfigFile now accepts projectRoot param | ✅ |
| B3 | AppForge/generate_cucumber_pom.ts | .min(1) on testDescription | ✅ |
| TF-E1 | TestForge/generate_gherkin_pom_test_suite.ts | Raw throw → McpErrors.projectValidationFailed | ✅ |
| C2 | TestForge/execute_sandbox_code.ts | Missing projectRoot guard → hard reject | ✅ |
| H5 | TestForge/_helpers.ts | validateUrl raw throw → McpErrors.invalidParameter | ✅ |
| C1 | TestForge/DomInspectorService.ts | Screenshot uses projectRoot not process.cwd() | ✅ |
| H2 | TestForge/generate_gherkin_pom_test_suite.ts | analyzer.analyze() guarded + dead null check removed | ✅ |
| H3 | TestForge/validate_and_write.ts | contextManager resolve moved to registration-time | ✅ |
| H4-a | AppForge/inspect_ui_hierarchy.ts | Dead code double-check removed; warn on missing projectRoot | ✅ |
| H4-b | AppForge/self_heal_test.ts | CWD fallback removed; uses defaults instead | ✅ |
| H6 | AppForge/CodebaseAnalyzerService.ts | readdir(projectRoot) ENOENT → McpErrors.fileNotFound | ✅ |
| M3 | AppForge/StaticRouteAnalyzer.ts | Dead `get paths()` with process.cwd() deleted; callers use projectRoot | ✅ |
| C3/H1 | AppForge+TF StructuralBrainService | Singleton removed; constructor-injected projectRoot; startup scan deleted; scan tool schema fixed | ✅ |
| M1 | TestForge/DependencyService.ts | Silent `catch {}` on JSON parse → `console.warn` with file path and error message | ✅ |
| M2 | TestForge/CodebaseAnalyzerService.ts | 5 silent catches (tsconfig, package.json, readdir, step file read, recursive readdir) → `console.warn` | ✅ |
| M6 | AppForge/check_appium_ready.ts | `console.warn` emitted when projectRoot absent and falling back to `process.cwd()` | ✅ |
| M7 | AppForge/verify_selector.ts | Same warn-on-fallback pattern applied | ✅ |

---

## Remaining (Not Fixed)

| ID | File | Reason Deferred |
|---|---|---|
| M3-b | AppForge/SomeFile | Placeholder if new items emerge |

---

## Status
- ✅ Both `tsc --noEmit` clean (exit 0) after all fixes
- ✅ C3/H1 resolved — all items in Remaining table are low/medium risk only
- ✅ M1, M2, M6, M7 resolved — **Remaining table is now empty**
- All hot-path tools covered
- Feature freeze maintained
