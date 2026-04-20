# AppForge God-Node Decentralization Plan

## Background

Following the successful 9-phase refactoring of TestForge, this document applies the identical **Facade + Delegates** pattern to AppForge. Analysis reveals the following god-node hierarchy:

| Service                     | Lines     | Methods | Dependents | Verdict                                          |
| --------------------------- | --------- | ------- | ---------- | ------------------------------------------------ |
| `ProjectSetupService.ts`    | **2,180** | 118     | 5          | 🔴 Critical — 8 embedded classes                 |
| `NavigationGraphService.ts` | **1,379** | 135     | 5          | 🔴 Critical — all-in-one graph engine            |
| `ExecutionService.ts`       | **940**   | 15      | 7          | 🟠 High — test runner + UI inspector merged      |
| `McpConfigService.ts`       | **674**   | 22      | **30**     | 🟠 High — most-connected hub in entire system    |
| `TestGenerationService.ts`  | **672**   | 9       | 4          | 🟡 Medium — prompt builder mixed with formatters |
| `AuditLocatorService.ts`    | **453**   | 8       | 3          | 🟡 Medium — YAML + TS parsers co-located         |

> **What AppForge already has (ahead of TestForge at Phase 9):**
>
> - `src/container/ServiceContainer.ts` — Lazy DI container ✅
> - `src/container/registrations.ts` — All factory registrations ✅
> - `src/index.ts` — Already 265 lines (lean) ✅ — skip TestForge Phase 9 equivalent.

> **Facade Contract Rule:** Every original service file becomes a thin orchestrator. It keeps its exact same public API. No callers change. The ServiceContainer registration entries stay identical.

---

## Pre-Work: Backup & Ripple Audit

1. Create `AppForge/backups-pre-refactor/` and copy all 6 god-node files verbatim.
2. After each phase: `npx tsc --noEmit`
3. After each phase: `python build_appforge_graph.py`

---

## Phase 1: `ProjectSetupService.ts` — The Multi-Class Monolith

**Current:** 2,180 lines with 8 embedded classes: `ProjectSetupService`, `MobileGestures`, `MockServer`, `LoginPage`, `AppiumDriver`, `ActionUtils`, `GestureUtils`, `WaitUtils`, `AssertionUtils`.

**Target:** `ProjectSetupService.ts` → ~300 lines (pure orchestrator).

### [NEW] `src/services/setup/ProjectScaffolder.ts`

- `setup()` body (lines 16–262)
- `scanConfigureMe()` (line 357)

### [NEW] `src/services/setup/ConfigTemplateManager.ts`

- `scaffoldPackageJson()` (line 382)
- `scaffoldTsConfig()` (line 442)
- `scaffoldCucumberConfig()` (line 474)
- `scaffoldMcpConfig()` (line 1100)
- `scaffoldGitignore()` (line 1084)
- `generateConfigTemplate()` (line 263)

### [NEW] `src/services/setup/WdioConfigBuilder.ts`

- `scaffoldWdioConfig()` (line 1172)
- `scaffoldWdioSharedConfig()` (line 1299)
- `scaffoldWdioAndroidConfig()` (line 1346)
- iOS equivalents (lines 1346–2180)

### [NEW] `src/services/setup/TestScaffolder.ts`

- `scaffoldSampleFeature()` (line 832)
- `scaffoldSampleSteps()` (line 850)
- `scaffoldHooks()` (line 785)
- `scaffoldBasePage()` (line 494)
- `scaffoldLoginPage()` (line 883)
- `scaffoldLocatorUtils()` (line 723)

### [NEW] `src/services/setup/UtilTemplateWriter.ts`

- `scaffoldMobileGestures()` (line 519)
- `scaffoldMockServer()` (line 621)

> Note: `MobileGestures`, `MockServer`, etc. are backtick _template strings_ inside these scaffold methods — not live service classes. They remain as strings inside `UtilTemplateWriter`.

### [NEW] `src/services/setup/DocScaffolder.ts`

- `scaffoldMcpConfigReference()` (line 923)
- `scaffoldPromptCheatbook()` (line 947)
- `scaffoldMcpDocs()` (line 971)

### [MODIFY] `src/services/ProjectSetupService.ts`

Becomes a ~300-line facade calling the 6 delegates above.

**Verification:** `setup_project` tool on a fresh empty directory — full scaffold succeeds.

---

## Phase 2: `NavigationGraphService.ts` — All-In-One Graph Engine

**Current:** 1,379 lines — XML parsing, static code scanning, graph algorithms, file change detection, Mermaid export, and persistence in a single class.

**Target:** `NavigationGraphService.ts` → ~200 lines (public API + lifecycle only).

### [NEW] `src/services/nav/XmlElementParser.ts`

- `extractElementsFromXml()` (515), `parseAttributes()` (537), `extractStableElements()` (549)
- `generateScreenSignature()` (509), `inferScreenName()` (555), `normalizeScreenName()` (572), `mergeElements()` (576)

### [NEW] `src/services/nav/GraphPathFinder.ts`

- `findShortestPath()` (611), `dfs()` (234), `convertPathToSteps()` (677)
- `calculatePathConfidence()` (698), `estimatePathDuration()` (718)
- `calculatePathQuality()` (1266), `identifyRiskFactors()` (1336)

### [NEW] `src/services/nav/StaticRouteAnalyzer.ts`

- `analyzeStepDefinitions()` (360), `analyzePageObjects()` (377)
- `extractNavigationPatterns()` (394), `extractPageObjectNavigationMethods()` (425)
- `isNavigationStep()` (450), `buildNavigationGraph()` (460)
- `inferScreenConnection()` (475), `inferActionType()` (500)
- `findStepDefinitionFiles()` (753), `findPageObjectFiles()` (785)
- `getLineNumber()` (817), `extractFunctionBody()` (821)

### [NEW] `src/services/nav/GraphPersistence.ts`

- `loadGraph()` (909), `saveGraph()` (950), `isGraphFresh()` (988)
- `detectChangedFiles()` (1022), `computeFileHashes()` (1063), `saveFileHashes()` (1088)
- `updateGraphIncremental()` (1102), `rebuildGraphFull()` (1175), `buildSeedMapFromConfig()` (1205)

### [NEW] `src/utils/MermaidExporter.ts`

- `exportMermaidDiagram()` (316), `addGraphNode()` (846)

### [MODIFY] `src/services/NavigationGraphService.ts`

~200-line facade retaining the full public API.

**Verification:** `export_navigation_map` and `extract_navigation_map` tools return correct output.

---

## Phase 3: `ExecutionService.ts` — Test Runner + UI Inspector

**Current:** 940 lines mixing test execution, UI hierarchy inspection, tag matching, and async job management.

**Target:** `ExecutionService.ts` → ~250 lines.

### [NEW] `src/services/execution/TestRunner.ts`

- `runTest()` (266) — 212-line main runner
- `runTestAsync()` (863), `buildCommand()` (108), `newJobId()` (87)

### [NEW] `src/services/execution/TagMatcher.ts`

- `validateTagExpression()` (97), `matchesTags()` (232), `countScenarios()` (176)

### [NEW] `src/services/execution/UiHierarchyInspector.ts`

- `inspectHierarchy()` (478) — 126-line method
- `extractStepKeywords()` (604), `findElementsByKeywords()` (638)

### [NEW] `src/services/execution/ReportParser.ts`

- `parseReport()` (792), `resolveTimeout()` (701), `detectProjectTimeout()` (743)

### [MODIFY] `src/services/ExecutionService.ts`

~250-line facade routing all public method calls to the 4 delegates.

**Verification:** `run_cucumber_test`, `inspect_ui_hierarchy`, `check_test_status` — all functional.

---

## Phase 4: `McpConfigService.ts` — Most-Connected Hub (30 Dependents)

> ⚠️ **CAUTION:** McpConfigService has 30 dependent files. Facade must preserve 100% of the public API — zero signature changes, zero method renames.

**Current:** 674 lines — schema definition (~235 lines), read/write, migration, accessors, build profiles.

**Target:** `McpConfigService.ts` → ~250 lines (accessors + thin read/write).

### [NEW] `src/services/config/ConfigSchema.ts`

- Lines 1–234: `McpConfig` type definitions and shape
- `generateSchema()` (333), `ensureSchema()` (370)

### [NEW] `src/services/config/ConfigMigration.ts`

- `migrateIfNeeded()` (254) — 79-line migration chain

### [NEW] `src/services/config/BuildProfileManager.ts`

- `setBuildProfile()` (554), `activateBuild()` (564), `getActiveBuild()` (584), `deleteJsonKey()` (595)

### [MODIFY] `src/services/McpConfigService.ts`

~250-line facade — all 22 public methods retained with identical signatures, delegating schema/migration to sub-services.

> ⚠️ After Phase 4, immediately run `npx tsc --noEmit` across the entire codebase. Fix any of the 30 dependents before Phase 5.

**Verification:** `manage_config` (read/write/preview), `setup_project` — all pass.

---

## Phase 5: `TestGenerationService.ts` — Prompt Builder + Context Builder

**Current:** 672 lines — `generateAppiumPrompt()` alone is 309 lines, plus navigation context builders and architecture rule generators mixed in.

**Target:** `TestGenerationService.ts` → ~200 lines.

### [NEW] `src/services/generation/AppiumPromptBuilder.ts`

- `generateAppiumPrompt()` body (lines 27–335)
- `getArchitectureRules()` (524), `estimateTokens()` (514)

### [NEW] `src/services/generation/NavigationContextBuilder.ts`

- `generateNavigationContext()` (336), `generateBasicNavigationGuidance()` (410)
- `inferTargetScreen()` (471), `isNavigationStep()` (498)
- `buildKnownScreenMap()` (615), `resolvePagesDir()` (657)

### [MODIFY] `src/services/TestGenerationService.ts`

~200-line facade assembling prompt from delegates.

**Verification:** `generate_cucumber_pom` tool returns valid feature + step files.

---

## Phase 6: `AuditLocatorService.ts` — YAML + TS Parser Merge

**Current:** 453 lines — YAML parsing, TypeScript parsing, architecture detection, and Markdown report generation co-located.

**Target:** `AuditLocatorService.ts` → ~120 lines.

### [NEW] `src/services/audit/YamlLocatorParser.ts`

- `parseYamlLocators()` (175), `classifyEntry()` (350)

### [NEW] `src/services/audit/TypeScriptLocatorParser.ts`

- `parseTypeScriptLocators()` (265), `detectArchitecture()` (118)
- `findFilesRecursive()` (331), `listFiles()` (434)

### [NEW] `src/utils/LocatorReportGenerator.ts`

- `generateMarkdownReport()` (385)

### [MODIFY] `src/services/AuditLocatorService.ts`

~120-line orchestrator delegating to the 3 above.

**Verification:** `audit_mobile_locators` tool returns full Markdown health report.

---

## Summary: Expected Size Reductions

| Service                  | Before          | After (Facade) | New Delegates    | Lines Extracted  |
| ------------------------ | --------------- | -------------- | ---------------- | ---------------- |
| `ProjectSetupService`    | 2,180           | ~300           | 6 files          | ~1,880           |
| `NavigationGraphService` | 1,379           | ~200           | 5 files          | ~1,179           |
| `ExecutionService`       | 940             | ~250           | 4 files          | ~690             |
| `McpConfigService`       | 674             | ~250           | 3 files          | ~424             |
| `TestGenerationService`  | 672             | ~200           | 2 files          | ~472             |
| `AuditLocatorService`    | 453             | ~120           | 3 files          | ~333             |
| **Total**                | **6,298 lines** | **~1,320**     | **23 new files** | **~4,978 lines** |

---

## Done Criteria

- [x] Phase 1 — `ProjectSetupService` ≤ 300 lines, `setup_project` passes end-to-end
- [x] Phase 2 — `NavigationGraphService` ≤ 200 lines, nav tools pass
- [x] Phase 3 — `ExecutionService` ≤ 250 lines, runner + hierarchy tools pass
- [x] Phase 4 — `McpConfigService` ≤ 250 lines, **all 30 dependent files compile clean**
- [x] Phase 5 — `TestGenerationService` ≤ 200 lines, generation tool passes
- [x] Phase 6 — `AuditLocatorService` ≤ 120 lines, audit tool passes
- [x] `npx tsc --noEmit` → 0 errors on full codebase
- [x] `python build_appforge_graph.py` — no file with > 15 connections

## Out of Scope

- No new capabilities added during this phase
- `McpConfigService` public API: zero signature changes (30 callers protected)
- All deferred GS tasks (GS-09 to GS-24) remain deferred

---

# GLOBAL STRUCTURAL REFACTORING (Final)

✅ **COMPLETED** — All services organized into domain-driven subdirectories.

| Domain | Services |
|---|---|
| **analysis** | CodebaseAnalyzer, CoverageAnalysis, Observability, StructuralBrain, SummarySuite |
| **audit** | AuditLocator, UtilAudit |
| **collaboration** | BugReport, CiWorkflow, Learning |
| **config** | Credential, McpConfig, TokenBudget |
| **execution** | AppiumSession, Execution, MobileSmartTree, SandboxEngine, SelfHealing, SessionManager |
| **generation** | FewShotLibrary, GeneratedCodeValidator, HybridPromptEngine, TestGeneration |
| **io** | FileState, FileWriter |
| **nav** | NavigationGraph |
| **setup** | EnvironmentCheck, PreFlight, ProjectMaintenance, ProjectSetup |
| **system** | ContextManager, Orchestration, SystemState |
| **test** | Migration, Refactoring, TestData |

**Verification:** 
- `npx tsc --noEmit` confirms clean imports after deep refactoring (ignoring pre-existing `any` types).
- `src/container/registrations.ts` updated to current paths.
- `src/index.ts` updated to current paths.
- All original monolithic services preserved in `backups-pre-refactor/`.

