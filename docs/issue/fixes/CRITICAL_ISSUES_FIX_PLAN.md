# Critical Issues Fix Plan - AppForge

**Date**: 2026-04-09  
**Status**: ACTIVE  
**Priority**: EXTREME - Production Blocker

---

## Executive Summary

During gold-standard-enhancements implementation, multiple critical regressions were introduced. This document outlines a systematic fix plan following the Universal Agent Working Protocol.

### Current State
- ✅ Build: **PASSING** (npm run build succeeds)
- ❌ Tests: **INFRASTRUCTURE BROKEN** (test runner config issue)
- ❌ MCP Tools: **MULTIPLE RUNTIME FAILURES**
- ⚠️ Production Readiness: **BLOCKED**

---

## Root Cause Analysis

### Category 1: Test Infrastructure Failure (IMMEDIATE FIX REQUIRED)

**Issue**: `npm test` fails with "Cannot find module '/Users/rsakhawalkar/forge/AppForge/dist/tests'"

**Root Cause**: package.json test script uses `node --test dist/tests/` which expects a directory, but Node's test runner needs a glob pattern.

**Current**: `"test": "node --test dist/tests/"`  
**Should be**: `"test": "node --test dist/tests/**/*.test.js"`

**Impact**: Cannot run test suite to validate fixes.

**Fix**: Update package.json test script (1 line change)

---

### Category 2: MCP Tool Runtime Failures (CRITICAL)

Based on liveissues.md analysis, the following MCP tools have runtime errors:

#### Issue 8: "require is not defined" in Multiple Tools
**Severity**: Medium → High (blocks inspection tools)  
**Affected Tools**: 
- check_appium_ready
- inspect_ui_hierarchy  
- execute_sandbox_code (in some contexts)

**Root Cause**: ESM/CommonJS module resolution conflict in transitive dependencies (webdriverio/appium deps using CommonJS `require()` in ESM context)

**Status in liveissues.md**: NEEDS LIVE SESSION (deferred)

**Action**: Needs live Appium session to reproduce exact stack trace. Currently DEFERRED but should be investigated.

---

#### Issue 9: generate_cucumber_pom crashes
**Severity**: Medium  
**Error**: "Cannot read properties of undefined (reading 'length')"

**Root Cause**: Missing null-checks on CodebaseAnalysisResult arrays

**Status**: ✅ **FIXED** (added `?? []` guards in TestGenerationService.generateAppiumPrompt())

**Verification Needed**: Confirm fix is complete and test exists.

---

#### Issue 10: train_on_example crashes
**Severity**: Low  
**Error**: "Cannot read properties of undefined (reading 'find')"

**Root Cause**: LearningService.getKnowledge() doesn't handle malformed JSON

**Status**: ✅ **FIXED** (added schema normalization fallback)

**Verification Needed**: Confirm fix is complete and test exists.

---

#### Issue 6: execute_sandbox_code truncation
**Severity**: Medium  
**Error**: Output truncated at 25,000 chars with "TRUNCATED" message

**Status**: ✅ **FIXED** (added filters to CodebaseAnalyzerService, updated OUTPUT INSTRUCTIONS)

**Verification Needed**: Confirm filters work correctly in practice.

---

#### Issue 3: Low diagnostic surface for MCP failures
**Severity**: Low → Medium  
**Error**: Generic timeout/error messages without structured details

**Status**: ✅ **FIXED** (ExecutionService.classifyWdioError() adds structured diagnosis)

**Verification Needed**: Test with real Appium failures.

---

### Category 3: Configuration & Setup Issues (HIGH PRIORITY)

#### MCP_ISSUES.md Findings:

1. **Placeholder profile auto-purge** - ✅ FIXED (McpConfigService removes CONFIGURE_ME)
2. **manage_users helper path** - ✅ FIXED (explicitly returns helperPath)
3. **Per-environment credential files** - ✅ FIXED (setup_project scaffolds users.{env}.json)
4. **npm install instruction** - ✅ FIXED (setup_project adds "Run npm install" to nextSteps[0])
5. **Platform-specific wdio configs** - ✅ FIXED (template prompt updated to include "both")

**Issue**: Multiple fixes marked FIXED but need verification they don't have ripple effects.

---

### Category 4: Gold-Standard Implementation Issues

**From pfixlan.md**: "83 failing tests" mentioned but actual npm test shows infrastructure failure.

**Tasks Completed per TASK-GS-08**: OUTPUT INSTRUCTIONS added to all tools.

**Potential Issue**: Adding OUTPUT INSTRUCTIONS may have exceeded 2048 char limit on some tool descriptions (GS-01 was supposed to be done first).

---

## Fix Plan (Dependency-Ordered)

### Phase 1: Restore Test Infrastructure (IMMEDIATE - 5 min)

**Goal**: Get `npm test` running so we can validate all other fixes.

**Steps**:
1. Update package.json test script to use glob pattern
2. Run npm test to get actual test failure list
3. Document actual failing tests (not the 83 number from old sessions)

**Success Criteria**: `npm test` executes and shows real test results

---

### Phase 2: Verify "FIXED" Items Don't Have Regressions (30 min)

**Goal**: Ensure all items marked FIXED in issue docs are actually working.

**Items to Verify**:
1. ✅ McpConfigService.write() auto-purges CONFIGURE_ME placeholders
   - Test: Create config with placeholder, call manage_config write, verify purge
2. ✅ manage_users returns helperPath explicitly  
   - Test: Call manage_users write, verify response includes helperPath
3. ✅ setup_project creates per-env credential files
   - Test: Call setup_project with environments, verify files created
4. ✅ generate_cucumber_pom null-check guards
   - Test: Call with empty codebase, verify no crashes
5. ✅ train_on_example schema normalization
   - Test: Corrupt learning JSON, verify graceful fallback
6. ✅ ExecutionService.classifyWdioError() structured diagnosis
   - Test: Pass ECONNREFUSED error, verify diagnosis field

**Method**: Use sandbox execute_sandbox_code or write targeted unit tests

**Success Criteria**: All 6 items pass verification, or bugs identified and fixed

---

### Phase 3: Fix Tool Description Length Violations (15 min)

**Issue**: GS-08 (Minimal Echoes) added OUTPUT INSTRUCTIONS to all tools, but GS-01 (trim to ≤2048) was supposed to be done first.

**Risk**: Some tool descriptions may exceed 2048 char limit, breaking MCP evaluation harness

**Steps**:
1. Run check script to measure all tool description lengths:
   ```bash
   node -e "const src = require('fs').readFileSync('./src/index.ts', 'utf-8'); const matches = [...src.matchAll(/description:\s*\`([\s\S]*?)\`/g)]; matches.forEach((m, i) => console.log('Tool', i+1, ':', m[1].length, 'chars'));"
   ```
2. Identify any >2048 char descriptions
3. Trim verbose sections while preserving OUTPUT INSTRUCTIONS
4. Verify npm run build still passes

**Success Criteria**: All tool descriptions ≤2048 chars

---

### Phase 4: Address Open Critical Issues (60 min)

#### 4A: Issue 8 - "require is not defined" (DEFERRED but should investigate)

**Current Status**: Marked "NEEDS LIVE SESSION"

**Action Plan**:
1. Search codebase for any remaining `require()` calls in .ts files
2. Check if webdriverio imports are using correct ESM syntax
3. Add try/catch guards around webdriverio imports with fallback error messages
4. If still failing, wrap affected tools in defensive error boundaries

**Success Criteria**: Tools don't crash with "require is not defined", or return clear error message

---

#### 4B: Issue 5 - Test execution fails with missing capabilities

**Severity**: High - BLOCKS PRODUCTION

**Current Status**: Open

**Investigation**:
1. Check ExecutionService.runTests() - how does it map config → wdio capabilities?
2. Verify mcp-config.json capabilities format matches WebDriverIO expectations
3. Add pre-flight validation that capabilities are loaded before test execution
4. Add structured error showing WHICH capabilities are missing

**Success Criteria**: run_cucumber_test either executes or returns actionable error

---

#### 4C: Issue 12 - Appium connectivity lifecycle

**Status**: Marked FIXED but needs verification

**Verification**:
1. Call run_cucumber_test without Appium server running
2. Verify diagnosis field contains "ECONNREFUSED" classification
3. Verify error message guides user to start Appium server

---

### Phase 5: Comprehensive Test Suite Validation (30 min)

**Goal**: Run full test suite and fix any remaining failures

**Steps**:
1. Run `npm test` (should work after Phase 1)
2. Categorize failures:
   - **Syntax/compile errors**: Fix immediately
   - **Schema validation errors**: Update tests to match new types
   - **Null-safety violations**: Add guards or update tests
   - **Outdated assertions**: Update or remove obsolete tests
3. Fix failures one-by-one, re-running after each
4. Document any tests that need to be updated vs bugs that need fixing

**Success Criteria**: `npm test` exits with code 0

---

### Phase 6: Ripple Audit (MANDATORY per .clinerules)

**Goal**: Ensure no breaking changes were introduced to dependent code

**Method**: Use grep/structural-brain to find all files importing changed services

**Services Changed During gold-standard-enhancements**:
- TestGenerationService (Issue 9 fix)
- LearningService (Issue 10 fix)  
- ExecutionService (Issue 3 fix)
- CodebaseAnalyzerService (Issue 6 fix)
- McpConfigService (MCP_ISSUES fixes)
- ProjectSetupService (MCP_ISSUES fixes)

**Steps**:
1. For each service, search for imports: `grep -r "from.*ServiceName" src/`
2. Review each importing file for compatibility
3. Check if any exported interfaces changed signatures
4. Add adapters/shims if breaking changes found

**Success Criteria**: No silent breaking changes; all consumers still compatible

---

### Phase 7: Knowledge Base Update (15 min)

**Goal**: Document learnings so future agents don't repeat mistakes

**Actions**:
1. Use train_on_example to record:
   - "Always fix test infrastructure before attempting fixes"
   - "Run ripple audit before marking tasks DONE"
   - "Verify FIXED items with actual tests, not assumptions"
   - "GS-01 must precede GS-08 (dependency violation caused description bloat)"
2. Update .AppForge/mcp-learning.json with session insights

---

## Implementation Order (Time-Boxed)

| Phase | Duration | Blocker | Can Parallelize |
|:------|:---------|:--------|:----------------|
| 1: Test Infrastructure | 5 min | YES | NO |
| 2: Verify FIXED Items | 30 min | NO | YES (6 items) |
| 3: Tool Description Audit | 15 min | NO | NO |
| 4: Open Critical Issues | 60 min | PARTIAL | YES (4A, 4B, 4C) |
| 5: Test Suite Validation | 30 min | NO | NO |
| 6: Ripple Audit | 20 min | NO | NO |
| 7: Knowledge Update | 15 min | NO | NO |

**Total Estimated Time**: 2h 55min (can reduce to ~2h with parallelization)

---

## Success Criteria (Exit Conditions)

1. ✅ `npm run build` exits 0
2. ✅ `npm test` exits 0 with all tests passing
3. ✅ All tool descriptions ≤2048 chars
4. ✅ All items marked "FIXED" in issue docs verified working
5. ✅ Critical open issues resolved or clearly documented as deferred
6. ✅ Ripple audit shows no silent breaking changes
7. ✅ Knowledge base updated with learnings

---

## Risk Mitigation

**Risk**: Making changes breaks more things  
**Mitigation**: Atomic commits after each phase, run build+test after each change

**Risk**: Time pressure causes shortcuts  
**Mitigation**: NO STUBS, NO PLACEHOLDERS per .clinerules rule #3

**Risk**: Missing ripple effects  
**Mitigation**: Mandatory ripple audit in Phase 6

---

## Next Steps

**IMMEDIATE ACTION**: Execute Phase 1 (Fix test infrastructure)

Once Phase 1 complete, assess actual test failure count and update this plan if needed.


## Definitive Re-verification: LLM Testing Errors vs Real MCP Issues

### Summary of Findings

After systematic re-testing with MCP server restart, I can now distinguish between my testing mistakes and actual MCP bugs:

---

## ✅ CONFIRMED MCP ISSUES (Real Bugs)

### 1. **Issue 6 – `analyzeCodebase` filter parameter crashes** ⚠️ REAL MCP BUG
- **Test sequence:**
  ```javascript
  // Works:
  await forge.api.analyzeCodebase(projectRoot);  // ✅ Returns { existingSteps: [], existingPageObjects: [9], existingUtils: [34] }
  
  // Crashes:
  await forge.api.analyzeCodebase(projectRoot, { type: 'steps' });  // ❌ "path must be string, got Array"
  ```
- **Conclusion:** The documented filter fix (`{ type: 'steps'|'pages'|'utils', searchPattern: string }`) is **broken**. When the second argument (filters object) is passed, `analyzeCodebase` internally receives an Array instead of a string for the path parameter.
- **Impact:** Cannot use filters to avoid truncation; must analyze entire codebase at once.
- **Note:** `analyzeCodebase()` without filters returns 0 steps for this project, which may indicate the step analyzer is also not working correctly OR this project's step definitions don't match the expected pattern.

### 2. **Issue 5/12 – `run_cucumber_test` WDIO capability mapping error** ⚠️ REAL MCP BUG
- **Error:**
  ```
  TypeError: Cannot read properties of undefined (reading 'alwaysMatch')
      at mapCapabilities (.../node_modules/@wdio/utils/build/node.js:437:17)
  ```
- **Root cause analysis:**
  - `wdio.conf.ts` has `capabilities: []` (empty array, valid base config)
  - `wdio.android.conf.ts` has `capabilities: [{ ... }]` (proper Android capabilities)
  - MCP's documented fix injects capabilities via CLI args: `--capabilities.platformName=Android --capabilities.appium:deviceName=...`
  - WDIO's `mapCapabilities` function expects W3C format but receives `undefined` for `w3cCaps`
- **Conclusion:** MCP's capability injection via CLI arguments is **incompatible** with this project's WDIO setup. The CLI overrides are creating a malformed capabilities structure that WDIO cannot parse.
- **Impact:** `run_cucumber_test` is completely blocked; cannot execute any tests via MCP.

### 3. **Issue 7 – Navigation mapping returns 0 screens** ✅ CONFIRMED REAL LIMITATION
- `export_navigation_map` returns empty even for a project with 9 page objects and many features.
- This is working as documented: navigation mapping requires active session exploration, not static analysis.
- **Status:** Not a bug, but a documented limitation.

---

## ✅ CONFIRMED FIXED ISSUES

### 4. **Issue 4 – Environment detection messaging** ✅ FIXED
- After MCP restart, `check_environment` now says:
  - `Android SDK: SDK found at: /Users/... (detected via common path, env var not set)`
- This matches the documented fix exactly. Previous observation was from a stale MCP process.

### 5. **Issue 9 – `generate_cucumber_pom` crash** ✅ FIXED
- Returns valid generation prompt with no TypeError.

### 6. **Issue 11 – `self_heal_test` without XML** ✅ FIXED
- Returns structured `HEAL_BLOCKED` response with clear guidance.

---

## ❌ LLM TESTING ERRORS (My Mistakes)

### 1. **Issue 6 – Misunderstanding of `analyzeCodebase` API**
- **My error:** I initially passed filters as the second parameter correctly, but then blamed the wrong thing when it crashed.
- **Reality:** The filter parameter IS broken (real MCP bug), but the base `analyzeCodebase()` call DOES work.
- **Correction:** Issue 6 is a real MCP regression in filter handling, not a testing error.

### 2. **Issue 3/12 – `diagnosis` field expectation**
- **My observation:** `run_cucumber_test` returns rich `output` and `error` but no `diagnosis` JSON field.
- **Reality:** The `diagnosis` field may be:
  - Only added for specific error patterns (not this WDIO crash)
  - Embedded in a different part of the response structure
  - Not exposed to the MCP client layer
- **Correction:** Cannot confirm if this is an MCP bug or architectural difference without seeing the server code.

---

## 🔍 UNABLE TO VERIFY (Blocked by Other Issues)

### 1. **Issue 2 – MCP RPC timeout**
- Cannot test long-running scenarios because `run_cucumber_test` crashes immediately with WDIO capability error.

### 2. **Issue 8 – "require is not defined"**
- Did not reproduce in any tool tested. May be specific to certain runtime conditions not encountered in this session.

---

## FINAL ASSESSMENT

### Real MCP Bugs Found:
1. ⚠️ **`analyzeCodebase(projectRoot, { type: 'X' })` crashes** with path/Array type error
2. ⚠️ **`run_cucumber_test` capability injection** produces malformed W3C caps that crash WDIO

### LLM Testing Mistakes:
- None significant; initial observations were mostly accurate

### Status vs `liveissues.md`:
- **Issue 4:** ✅ Fixed and verified
- **Issue 5/12:** ❌ Still broken (different error: WDIO capability mapping crash)
- **Issue 6:** ❌ Regression in filter handling (base call works, filtered call crashes)
- **Issue 7:** ⚠️ Works as designed (needs active session)
- **Issue 9:** ✅ Fixed
- **Issue 11:** ✅ Fixed

The two critical blockers for production use are:
1. `run_cucumber_test` cannot execute due to capability injection bug
2. `analyzeCodebase` filter parameter is broken, limiting codebase analysis utility