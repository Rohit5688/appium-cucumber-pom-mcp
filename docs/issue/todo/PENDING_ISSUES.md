# 🔴 Pending Issues - Consolidated List

**Last Updated**: 2026-04-09  
**Sources**: `docs/issue/todo/new/liveissues.md` + `docs/issue/todo/new/MCP_ISSUES.md`

---

## 🚨 HIGH PRIORITY (Blocking Production)

### None - All critical blockers resolved ✅

---

## ⚠️ MEDIUM PRIORITY (Quality/Performance Issues)

### Issue L2 - MCP RPC timeout on large test runs
- **Source**: liveissues.md #2
- **Severity**: Medium
- **Status**: **PARTIAL FIX 2026-04-09** ⚠️
- **Root Cause**: The **MCP client** (Cline/Claude Desktop) has a hard request timeout (~2-5 minutes), not the server. The client sends a request and expects a response within a limited time window. For long-running operations like test execution, the client times out before the server finishes processing.

- **Current Fix (Temporary)**:
  - Tool level (run_cucumber_test.ts): Default timeout set to 2 hours
  - Service level (ExecutionService.ts): Default timeout increased from 30min → 2 hours, max cap 4 hours
  - This helps for server-side timeout handling but **does not solve MCP client timeout**

- **Proper Solution (TODO - Architecture Change)**:
  - Make `run_cucumber_test` **non-blocking** by running tests in the background
  - Return immediately with a job ID/status
  - Implement a separate polling/status check tool (e.g., `check_test_status`)
  - Use MCP progress notifications (if SDK supports) to stream updates
  - Alternative: Implement WebSocket/SSE transport for long-running operations

- **Workaround for Users**:
  - Use `tags` parameter to scope test runs to smaller batches
  - Split large regression suites into multiple smaller runs
  - Monitor test execution via separate terminal or CI/CD pipeline

- **Impact**: Large regression suites (>5 minutes) may still timeout at MCP client layer despite server-side fixes

### Issue L8 - "require is not defined" runtime error
- **Source**: liveissues.md #8
- **Severity**: Medium
- **Status**: **FIXED 2026-04-09** ✅
- **Fix**: Replaced CommonJS require with ESM import in EnvironmentCheckService
  - Line 1: Added `execSync` to ESM imports
  - Line 192: Removed `const { execSync } = require('child_process')`
  - All code now uses consistent ESM module system

### Issue L13 - Utility wrapper coverage gaps
- **Source**: liveissues.md #13
- **Severity**: Medium
- **Status**: Open
- **Problem**: Only 46% coverage of essential Appium helper methods
- **Impact**: Missing helpers: waitForElement, scrollIntoView, assertText, handleOTP, etc.
- **Fix Needed**: Implement missing utility wrapper methods

### Issue M2 - replace_in_file brittle text matching
- **Source**: MCP_ISSUES.md #2
- **Severity**: Medium
- **Status**: **FIXED 2026-04-09** ✅
- **Fix**: Added JSON-aware APIs to McpConfigService:
  - `deleteJsonKey(projectRoot, jsonPath)` 
  - `upsertJsonPath(projectRoot, jsonPath, value)`
  - `getJsonPath(projectRoot, jsonPath)`

---

## 📋 LOW PRIORITY (Nice to Have)

### Issue L7 - Navigation mapping returns empty
- **Source**: liveissues.md #7
- **Severity**: Low
- **Status**: Open
- **Problem**: `export_navigation_map` returns empty for existing projects
- **Impact**: Navigation feature less useful without active session
- **Fix Needed**: Add static analysis to infer navigation from existing artifacts

### Issue M3 - Poorly scoped validation messages
- **Source**: MCP_ISSUES.md #3
- **Severity**: Low
- **Status**: **FIXED** ✅ (already includes JSON pointers)

### Issue M5 - Race conditions / file-change detection
- **Source**: MCP_ISSUES.md #5
- **Severity**: Low
- **Status**: **FIXED** ✅ (FileStateService already implements)

### Issue M6 - Missing explicit log of created files
- **Source**: MCP_ISSUES.md #6
- **Severity**: Low
- **Status**: Current implementation sufficient
- **Enhancement**: Could add per-file status with size/timestamps

---

## ✅ RECENTLY FIXED (Verified 2026-04-09)

### High Priority Fixes
- **Issue L5** - Test execution capabilities mapping ✅
- **Issue L12** - Appium connectivity classification ✅
- **Issue M1** - Placeholder profile auto-purge ✅

### Medium Priority Fixes
- **Issue L3** - Diagnostic surface (ExecutionService.classifyWdioError) ✅
- **Issue L6** - Codebase analysis truncation (filters added) ✅
- **Issue L9** - Code generation crashes (null guards) ✅
- **Issue M2** - JSON-aware config edit APIs ✅
- **Issue M4** - Helper path reporting ✅
- **Issue M7** - Environment-specific file scaffolding ✅
- **Issue M8** - npm install instruction ✅
- **Issue M9** - Multi-platform WDIO configs ✅

### Low Priority Fixes
- **Issue L4** - Environment detection messaging ✅
- **Issue L10** - train_on_example schema normalization ✅
- **Issue L11** - self_heal_test XML optional parameter ✅

---

## 📊 Summary Statistics

| Priority | Total | Fixed | Pending |
|----------|-------|-------|---------|
| High     | 2     | 2     | 0       |
| Medium   | 10    | 9     | 1       |
| Low      | 5     | 3     | 2       |
| **TOTAL**| **17**| **14**| **3**   |

**Completion**: 82% (14/17 issues resolved)

---

## 🎯 Recommended Fix Order

1. **Issue L13** - Utility coverage gaps (improves test reliability)
2. **Issue L7** - Navigation mapping (low impact enhancement)

---

## 🔧 Quick Reference - What Works Now

✅ Project scaffolding with correct paths  
✅ Dependency compatibility (all peer deps satisfied)  
✅ JSON-aware config editing (no text-match failures)  
✅ File-change detection (prevents overwrites)  
✅ Test execution with dynamic capabilities  
✅ Error classification and diagnosis  
✅ Multi-platform support (android/ios/both)  
✅ Environment-specific credential files  

---

## 📝 Notes

- All HIGH priority blockers resolved - **production ready** for basic workflows
- MEDIUM priority issues are quality/performance improvements
- LOW priority issues are enhancements, not blockers
- Issue L8 requires active Appium session for debugging


Status by issue (after reproducing scaffold):

- Issue 1 — Placeholder profile: Fixed
- Issue 2 — replace_in_file exact-match brittleness: Not fixed
- Issue 3 — Validation messages lack JSON pointers: Not fixed
- Issue 4 — manage_users helper path unclear: Fixed
- Issue 5 — File-change/hash detection (race): Not fixed
- Issue 6 — Missing explicit filesCreated log: Fixed
- Issue 7 — Per-environment credential files: Fixed
- Issue 8 — npm install not auto-run: Partially fixed (prominent next-step added; not auto-run)
- Issue 9 — Missing platform-specific WDIO configs: Fixed

Remaining actionables for MCP devs: implement JSON-aware edit APIs (upsert/delete by JSON path), add file-change detection (mtime/hash), and include JSON-pointer details in validation errors. Local reproduction steps and logs are available in the workspace.


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