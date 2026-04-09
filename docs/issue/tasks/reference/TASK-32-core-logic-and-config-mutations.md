# TASK-32 — Configuration Mutations, Latency Spikes, and Logic Bugs

**Status**: TODO  
**Effort**: Medium (~2 hours)  
**Depends on**: None  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `APPFORGE_FRESH_AUDIT.md`, multiple functional defects were found surrounding configuration serialization loops, UI initialization logic, and minor parser crashes.

1. **Side-effectful Reads**: Configuration validation functions frequently mutate the config file on disk automatically when invoked.
2. **Startup Latency**: Extra heavy operations like fetching 30k elements synchronously happen during Appium Session creation unnecessarily.
3. **Logic Bugs**: Bad string formats (missing `id=`), inaccurate division timings, and unhandled JSON payloads.

---

## What to Change

### Phase 1: Pure Configuration Operations
**Location:** `src/services/McpConfigService.ts`
- **AUDIT-02**: Decouple file version upgrades from `McpConfigService.read()`. The file should strictly be mutated only within explicit writes. Create `migrateIfNeeded()` for explicit workflow upgrades.
- **AUDIT-16**: Ensure `resolvePaths()` defaults are not accidentally written to disk and locked during a read/write configuration cycle. 
- **AUDIT-01**: Verify that the `manage_config` writing route uses deep merges rather than shallow spread-operators to prevent accidental capabilities truncation.

### Phase 2: Appium and QA Logic Polish
**Location:** `src/services/AppiumSessionService.ts`, `src/services/SelfHealingService.ts`, `src/services/SummarySuiteService.ts`, `src/services/CredentialService.ts`, `src/services/EnvironmentCheckService.ts`
- **AUDIT-11**: Speed up `start_appium_session` startup by returning the screenshot correctly, but deferring heavy XML extraction strictly until `inspect_ui_hierarchy` is invoked.
- **AUDIT-10**: During `self_heal_test`, append the `"id="` prefix strictly to valid Android XML resource mappings to prevent WebdriverIO lookup failures.
- **AUDIT-03**: Remove the nested iOS bundleId checking questions inside the Appium service since `noReset` applies globally.
- **AUDIT-08**: In `manage_users`, map `getUser.ts` properly to the dynamic `paths.utilsRoot` rather than hardcoding `/utils/`.
- **AUDIT-12 / AUDIT-13**: Add a try/catch around the Android JSON parsing block inside `EnvironmentCheckService`, and fix the fast-test millisecond rounding logic inside `SummarySuiteService`.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors.
- [ ] Tools can be invoked for reads without modifying the `mcp-config.json` timestamp.
- [ ] All remaining logical inaccuracies tracked in `APPFORGE_FRESH_AUDIT.md` are accounted for.
- [ ] Change `Status` above to `DONE`.
