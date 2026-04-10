# Implementation Plan: Gold Standard Remediation & RCA

This plan identifies why the "Gold Standard" implementation failed to prevent basic issues and outlines the technical steps to bridge the gap between requirements and reality.

## Root Cause Analysis (RCA)

### 1. The "Isolation" Trap

**Observation**: `PreFlightService` (GS-17) exists but `run_cucumber_test` doesn't use it.
**Root Cause**: Tasks were scoped as "create service X" but didn't explicitly list every tool handler in `index.ts` that needed a guard. Agents took the narrowest path to completion.

### 2. Template Inconsistency

**Observation**: `setup_project` (GS-09) produces `wdio.conf.ts` with incorrect spec paths.
**Root Cause**: The scaffolding engine uses static string templates that were never updated to consult `mcp-config.json` paths (e.g., `featuresRoot`). The templates are "Frozen in Time."

### 3. Verification Myopia

**Observation**: Issue 8 reports "require is not defined" (ESM/CJS mismatch).
**Root Cause**: Build checks (`npm run build`) succeeded because the code is syntactically valid TypeScript, but it was never executed in the target environment (MCP runtime) which has specific module resolution constraints.

---

## Proposed Remediation Map

### Phase 1: The "Grand Integration" (Logic Repair)

We must revisit every "Gold Standard" service and ensure it is wired into ALL tool handlers, not just a few.

#### [MODIFY] [index.ts](file:///c:/Users/Rohit/mcp/AppForge/src/index.ts)

- Guard `run_cucumber_test` with `PreFlightService`.
- Wire `TokenBudgetService` into every tool start/end event.
- Ensure `ObservabilityService` captures actual CLI error outputs for better diagnostics.

### Phase 2: Template Synchronization (Scaffold Repair)

#### [MODIFY] [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) (or equivalent)

- Update code-gen templates to dynamically inject paths from `mcp-config.json`.
- Ensure new projects include the "Gold Standard" `getUser.ts` helper by default.

### Phase 3: Infrastructure Hardening

#### [MODIFY] [ExecutionService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ExecutionService.ts)

- Fix the environment variable propagation bug by enforcing a reload/inheritance of shell environment before spawning child processes.
- Fix raw JSON replacement brittleness by implementing a JSON-aware mutation API (as suggested in MCP_ISSUES.md).

---

## Verification Plan

### Automated Tests

1. **Integration Test**: Run `npx appforge setup_project` followed by `npx appforge check_appium_ready`.
2. **Build Test**: Ensure `npm run build` passes after rewire.

### Manual Verification

1. Verify that `mcp-config.json` placeholders are cleared or flagged during setup.
2. Confirm that `run_cucumber_test` gives a clear "Appium not found" error instead of a stack trace.
