# TASK-28 — Analysis Tools & CI Generator Polish

**Status**: TODO  
**Effort**: Small (~1 hour)  
**Depends on**: Nothing directly, but better done after Tier 7  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Based on the Production Readiness Review (`2.md`), several analysis tools and the CI generator have minor hardcoded limitations or logical gaps that reduce their reliability in diverse projects. 

1. **audit_mobile_locators**: Fails to find locators on `yaml-locators` architecture projects because it only scans TS files.
2. **audit_utils**: Uses a hardcoded checklist of only 4 methods, giving a misleadingly low "coverage" score for fully featured test suites.
3. **generate_ci_workflow**: Hardcodes `iPhone 14`, `npx cucumber-js`, and `reports/` instead of dynamically reflecting the user's `mcp-config.json`.

---

## What to Change

### Phase 1: Support YAML Locators in Audit
**File:** `c:\Users\Rohit\mcp\AppForge\src\services\AuditLocatorService.ts` (or equivalent service)
- If the project architecture is `yaml-locators` (or if `locators/*.yaml` exist), parse these YAML files.
- Classify locators similarly to TS files (`~` prefix = stable acc-id, `//` = brittle xpath).
- Add these parsed locators to the per-file breakdown and Health Score.

### Phase 2: Expand Utility Coverage Checklist
**File:** `c:\Users\Rohit\mcp\AppForge\src\services\AuditUtilsService.ts`
- Expand the 4 hardcoded methods (`dragAndDrop`, `scrollIntoView`, `assertScreenshot`, `handleOTP`) to include common Appium essentials like `waitForElement`, `tap`, `swipe`, `switchContext`, etc. 
- Ensure the grading metric clearly indicates this is a "Core Recommended Utilities Checklist" rather than a strict mathematical coverage percentage.

### Phase 3: Dynamic CI Workflow Generation
**File:** `c:\Users\Rohit\mcp\AppForge\src\services\ProjectSetupService.ts` (or where `generate_ci_workflow` is handled)
- Replace the hardcoded `iPhone 14` with the `deviceName` from the first capabilities profile in `mcp-config.json`.
- Replace `npx cucumber-js` with the `project.executionCommand` from config (or default to `npx wdio run wdio.conf.ts`).
- Replace the hardcoded `reports/` path with `reporting.outputDir` from the config.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors.
- [ ] `audit_mobile_locators` returns accurate results for YAML-backed projects.
- [ ] `audit_utils` grades against an expanded, realistic checklist.
- [ ] `generate_ci_workflow` uses values dynamically pulled from `mcp-config.json`.
- [ ] Change `Status` above to `DONE`.
