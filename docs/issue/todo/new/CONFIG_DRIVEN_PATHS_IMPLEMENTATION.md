# Config-Driven Path Implementation Plan

**Status**: IN PROGRESS  
**Goal**: Make MCP CONFIG the single source of truth for ALL project paths - NO hardcoding

## Problem Statement

Currently, paths like `src/features`, `src/pages` are hardcoded in multiple places. This violates the principle that **MCP CONFIG is the bible**. Users should be able to:
1. Leave fields empty/unfilled → automatic fallbacks to sensible defaults
2. Partially fill config (e.g., only `featuresRoot`) → other paths use defaults
3. Fully customize (e.g., `test/e2e/features` instead of `src/features`)

## Design Decision

**All paths in config are relative to PROJECT ROOT**, not `src/`.

Examples:
- Default: `"featuresRoot": "src/features"`
- Custom: `"featuresRoot": "test/e2e/scenarios"`
- No src: `"featuresRoot": "features"`

## Implementation Progress

### ✅ Step 1: Update McpConfigService
- [x] Updated `resolvePaths()` to return full paths with `src/` prefix as defaults
- [x] Added `credentialsRoot` to interface and fallback
- [x] Adjusted comments and defaults to reference `paths.credentialsRoot`

### ✅ Step 2a: Update ProjectSetupService Config Template
- [x] Updated template to use full paths (`src/features` not `features`)
- [x] Added `credentialsRoot` to template

### ✅ Step 2b: ProjectSetupService — READ and USE Config Paths
- [x] Replaced hardcoded dirs array with `paths` returned by `McpConfigService.getPaths(config)`
- [x] Staging directory scaffolding uses resolved `paths.*` values when creating directories and files
- [x] Credential scaffolding uses `paths.credentialsRoot`
- Impact: scaffolders now create directories under configured paths instead of hardcoded `src/` paths

### ✅ Step 2c: Update Scaffolding Methods (projectSetup)
All major scaffolders were updated to accept/use resolved `paths` where applicable:
- [x] `scaffoldBasePage()` — writes to `paths.pagesRoot`
- [x] `scaffoldMobileGestures()` — writes to `paths.utilsRoot`
- [x] `scaffoldMockServer()` — writes to `paths.utilsRoot`
- [x] `scaffoldLocatorUtils()` — reads/writes from `paths.locatorsRoot`
- [x] `scaffoldHooks()` — writes to `paths.stepsRoot`
- [x] `scaffoldSampleFeature()` — writes to `paths.featuresRoot`
- [x] `scaffoldMockScenarios()` — writes to `paths.testDataRoot`
- [x] `scaffoldAppiumDriver()` — writes to `paths.utilsRoot`
- [x] `scaffoldActionUtils()` — writes to `paths.utilsRoot`
- [x] `scaffoldGestureUtils()` — writes to `paths.utilsRoot`
- [x] `scaffoldWaitUtils()` — writes to `paths.utilsRoot`
- [x] `scaffoldAssertionUtils()` — writes to `paths.utilsRoot`
- [x] `scaffoldTestContext()` — writes to `paths.utilsRoot`
- [x] `scaffoldDataUtils()` — writes to `paths.utilsRoot`
Notes: These changes were implemented in `ProjectSetupService.ts` so generated projects honor config paths.

### ✅ Step 2d: Update Generated Config Files
- [x] `scaffoldWdioConfig()` and `scaffoldWdioSharedConfig()` now use `paths.featuresRoot` and `paths.stepsRoot` when building `specs` and `require` patterns.
- [x] `scaffoldCucumberConfig()` now uses configured `paths.stepsRoot` and `paths.featuresRoot`.

### ✅ Step 3: Consumer Services — partial updates
- [x] `CredentialService.ts` — updated to resolve and use `paths.credentialsRoot` for runtime file locations and gitignore entries; scaffold messages reference configured path.
- [x] `TestGenerationService.ts` — updated prompts and fallback paths to honor `paths.credentialsRoot`, and added defaults to detected paths.
- [x] `McpConfigService.ts` — documentation and defaults updated (already listed in Step 1).

### ✅ Step 4: TypeScript & Tests adjustments
- [x] Installed `@types/jest` and updated `tsconfig.json` to include `"jest"` types.
- [x] Fixed test file import that explicitly imported `@jest/globals` — tests now rely on ambient jest types.
- [x] Ran `npx tsc --noEmit` — validation passed.

### ✅ Step 5: NavigationGraphService (completed)
NavigationGraphService received a focused set of improvements to fully honor config-driven paths and robust incremental updates:

- [x] Read MCP config via `McpConfigService.getPaths()` and store resolved `paths`.
- [x] Extended discovery to honor `paths.stepsRoot`, `paths.pagesRoot`, `paths.locatorsRoot`, `paths.utilsRoot`, `paths.configRoot` (with sensible fallbacks and de-duplication).
- [x] Switched internal storage directory from `.appforge` to `.AppForge` (consistent casing with other tools).
- [x] Improved save/load serialization:
  - Map<screen, NavigationNode> → plain object on write and reconstructed to Map on read.
  - Date fields converted to ISO strings on write and restored to Date on read.
- [x] Added explicit file→signature mapping (`fileToSignatures`) to record which extracted step/method signatures came from which source file.
- [x] Hardened incremental updates:
  - On file changes, re-analyze changed files to get exact signatures.
  - Remove edges/nodes only when their recorded signatures match changed-file signatures (avoids basename false-positives).
  - Re-insert edges from re-analyzed files and update `fileToSignatures`.
- [x] Persisted `fileToSignatures` alongside the graph JSON.
- [x] File hashes (for freshness/change detection) are written to and read from the same `.AppForge` directory (file-hashes.json).
- [x] TypeScript validation passed after changes.

### ⏳ Step 6: Remaining work (TO DO)
- [x] StructuralBrainService.ts — accept projectRoot and use `McpConfigService.getPaths()` to determine scan dirs and .AppForge file location
- [x] CodebaseAnalyzerService.ts — replaced local defaults with `McpConfigService.getPaths()` and normalized detectedPaths
- [x] Scan `src/tools/` for hardcoded paths; updated `_helpers.getSkillPath` and `audit_mobile_locators` to prefer configured paths
- [x] AuditLocatorService.ts — made audit() read MCP config and build scan dirs from `paths.pagesRoot`, `paths.locatorsRoot`, `paths.testDataRoot`, `locators`, and fallback `src/<basename(paths.locatorsRoot)>`; detectArchitecture and parseYamlLocators now use config-driven candidates, dedupe, and exclude noise folders; TypeScript parsing expanded to include JS/TSM extensions controlled by config or auto-detection
- [ ] Update tests to assert files using resolved config paths rather than hardcoded `src/...` when appropriate
- [ ] Add migration logic in `migrateIfNeeded()` to upgrade older configs that used different path formats
- [ ] Add unit/integration tests:
  - default resolution
  - partial config overrides
  - fully-custom paths
  - incremental update correctness (file→signature mapping)
- [ ] Update user docs to describe new `paths.*` behavior and examples

## Summary by Priority (updated)

**COMPLETED (Now)**:
- McpConfigService, ProjectSetupService scaffolding, CredentialService, TestGenerationService
- NavigationGraphService: path refactor, discovery, .AppForge, robust save/load, incremental updates
- tsconfig.json + test import fixes; TypeScript validation

**REMAINING (High → Low)**:
- High: StructuralBrainService pathing, migration logic
- Medium: tests update, CodebaseAnalyzerService audit
- Low: tools under `src/tools/`, additional tests & docs

## Next Steps (recommended)
1. StructuralBrainService refactor (1–2 hours).
2. Update tests to assert against configured `paths.*` values (1–2 hours).
3. Add migration in `migrateIfNeeded()` and write tests for it (1 hour).
4. Add a small integration test that generates a project with a custom `mcp-config.json` and validates file locations.

## Estimated Completion
- Remaining work: ~2–4 hours (after StructuralBrainService + test updates)
- Critical path: StructuralBrainService → Test updates → Migration