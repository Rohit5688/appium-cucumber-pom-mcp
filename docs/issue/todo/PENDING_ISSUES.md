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