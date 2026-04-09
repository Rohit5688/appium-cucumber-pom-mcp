# Sequential Fix Plan - Priority Order

Here's the complete fix list in the order they should be tackled, with dependencies and time estimates:
if the issue you find in test and not in actual code leave as it is. The tests are old the code and requirements changed after that.
review the code changes done, check if they are satisfactory or not and fix gaps if any

---

## ✅ PHASE 1: CRITICAL BUGS (Week 1 - Must Fix First)

These are **blocking issues** that break core functionality. Fix these before touching gold-standard integration.

### 1. Fix YAML Locator Parsing (Priority: P0)

**Time**: 4-6 hours  
**Files**: `src/services/AuditLocatorService.ts`  
**Tests**: `AuditLocatorService.issue11.test.ts`, `AuditLocatorService.issue18.test.ts`  
**Why First**: 22 tests failing, core feature completely broken

**Tasks**:

- [ ] Add YAML parsing for `//` xpath selectors
- [ ] Add YAML parsing for `:id/` resource-id selectors
- [ ] Add YAML parsing for `id=` prefix selectors
- [ ] Add YAML parsing for CSS class selectors (`.classname`)
- [ ] Add YAML parsing for hash ID selectors (`#id`)
- [ ] Fix quoted/unquoted value handling (use StringMatcher from GS-03)
- [ ] Fix health score calculation
- [ ] Fix markdown report generation
- [ ] Verify all 26 YAML tests pass

---

### 2. Fix Valid Locator Generation (Priority: P0)

**Time**: 3-4 hours  
**Files**: `src/services/ExecutionService.ts`  
**Tests**: `ExecutionService.issue15.test.ts`  
**Why Second**: 9 tests failing, breaks test generation

**Tasks**:

- [ ] Generate accessibility-id selectors with `~` prefix
- [ ] Generate resource-id selectors with `id=` prefix
- [ ] Generate valid XPath selectors for text attributes
- [ ] Fix quote escaping in XPath (double quotes in text)
- [ ] Fix selector priority order (accessibility-id > resource-id > xpath)
- [ ] Handle iOS `name` attribute correctly
- [ ] Generate class-based XPath as last resort
- [ ] Never generate invalid `*[attribute]` selectors
- [ ] Verify all 12 locator strategy tests pass

---

### 3. Fix FileWriterService Staging Mechanism (Priority: P0)

**Time**: 5-7 hours  
**Files**: `src/services/FileWriterService.ts`, `src/services/FileStateService.ts`  
**Tests**: `FileWriterService.issue12.test.ts`  
**Why Third**: 8 tests failing, file safety broken

**Tasks**:

- [ ] Fix staging directory workflow (files must NOT be written until validation passes)
- [ ] Implement proper rollback on TypeScript validation failure
- [ ] Clean up `.mcp-staging/` directory after validation (success or failure)
- [ ] Implement dry-run mode correctly
- [ ] Add backup/recovery information to success response
- [ ] Fix message clarity (validation failure vs successful write)
- [ ] Ensure atomic writes (all files or none)
- [ ] Verify all 11 FileWriter tests pass

---

### 4. Fix manage_users / CredentialService (Priority: P0)

**Time**: 3-4 hours  
**Files**: `src/tools/manage_users.ts`, `src/services/CredentialService.ts`  
**Tests**: `manage_users.test.ts`  
**Why Fourth**: 7 tests failing (100%), user management broken

**Tasks**:

- [ ] Fix testDataRoot configuration reading from mcp-config.json
- [ ] Fix file path resolution (use testDataRoot, not hardcoded `src/test-data`)
- [ ] Fix directory creation logic
- [ ] Fix helper file generation with correct relative paths
- [ ] Fix environment-based file naming (users.staging.json, users.production.json)
- [ ] Ensure no phantom directories created at project root
- [ ] Verify all 7 manage_users tests pass

---

## 🔒 PHASE 2: SECURITY FIXES (Week 1-2 - High Priority)

These are **security vulnerabilities** that must be fixed before production deployment.

### 5. Fix Shell Injection Edge Cases (Priority: P1)

**Time**: 4-5 hours  
**Files**: `src/utils/SecurityUtils.ts`, `src/utils/ShellSecurityEngine.ts`, `src/services/ExecutionService.ts`  
**Tests**: `CB1.shell-injection.test.ts`, `CB2.directory-traversal.test.ts`, `ExecutionService.edgecases.test.ts`, `ExecutionService.test.ts`  
**Why Fifth**: 20 security tests failing

**Tasks**:

- [ ] Add newline character validation to `validateSpecificArgs` (reject `\n`, `\r`, `\r\n`)
- [ ] Add `overrideCommand` validation (reject shell metacharacters)
- [ ] Fix Windows path handling in `validateFilePath`
- [ ] Fix absolute path handling (decide: accept or reject - tests expect acceptance for executables)
- [ ] Fix path normalization edge cases
- [ ] Add Windows-style traversal detection (`..\\`, `C:\\..`)
- [ ] Fix `validateProjectRoot` for paths with legitimate special chars (spaces, hyphens)
- [ ] Ensure execFile is used instead of execSync everywhere
- [ ] Verify all 20+ security tests pass

---

### 6. Fix RefactoringService & UtilAuditService (Priority: P1)

**Time**: 2-3 hours  
**Files**: `src/services/RefactoringService.ts`, `src/services/UtilAuditService.ts`  
**Tests**: `RefactoringService.issue12.test.ts`, `RefactoringService.issue13.test.ts`, `UtilAuditService.test.ts`, `UtilAuditService.issue20.test.ts`  
**Why Sixth**: 4 tests failing, quality tooling broken

**Tasks**:

- [ ] Fix unused method detection in RefactoringService
- [ ] Fix util function analysis in UtilAuditService
- [ ] Verify 4 tests pass

---

### 7. Fix ProjectSetupService Platform Imports (Priority: P2)

**Time**: 1-2 hours  
**Files**: `src/services/ProjectSetupService.ts`  
**Tests**: `ProjectSetupService.issue16.test.ts`  
**Why Seventh**: 2 tests failing, iOS/Android separation broken

**Tasks**:

- [ ] Fix wdio.conf.ts platform detection
- [ ] Fix iOS/Android import separation in generated config
- [ ] Verify 2 tests pass

---

## 🔗 PHASE 3: GOLD-STANDARD INTEGRATION (Week 2-3 - Complete Implementation)

Now integrate the gold-standard features that were created but not wired up.

### 8. Integrate ErrorSystem (GS-05)

**Time**: 3-4 hours  
**Files**: All services (30+ files)  
**Why Eighth**: Foundation for all other services

**Tasks**:

- [ ] Update all services to throw `McpError` instead of generic `Error`
- [ ] Add missing error codes for YAML parsing, locator audit, etc.
- [ ] Remove old error files: `ErrorFactory.ts`, `ErrorHandler.ts`, `Errors.ts`
- [ ] Update all tools to catch and serialize `McpError`
- [ ] Verify error responses are JSON-RPC compliant
- [ ] Write tests for McpError serialization

---

### 9. Integrate RetryEngine (GS-06)

**Time**: 2-3 hours  
**Files**: `src/services/AppiumSessionService.ts`, `src/services/ExecutionService.ts`, `src/services/FileWriterService.ts`  
**Why Ninth**: Depends on ErrorSystem (retryable flag)

**Tasks**:

- [ ] Export default retry policies (APPIUM_SESSION_POLICY, FILE_OPERATION_POLICY, NETWORK_POLICY)
- [ ] Wrap `AppiumSessionService.startSession()` with retry
- [ ] Wrap file write operations with retry
- [ ] Wrap network calls with retry
- [ ] Add retry logging (attempts, delays)
- [ ] Write tests for retry behavior

---

### 10. Integrate FileGuard (GS-04)

**Time**: 2 hours  
**Files**: `src/tools/*` (all file reading tools), `src/services/ExecutionService.ts`  
**Why Tenth**: Prevents wasted tokens on binary files

**Tasks**:

- [ ] Add FileGuard.isBinary() check before reading files in all tools
- [ ] Return McpError with BINARY_FILE_REJECTED code
- [ ] Test with .png, .ipa, .apk files
- [ ] Write FileGuard unit tests

---

### 11. Integrate FileSuggester (GS-18)

**Time**: 1-2 hours  
**Files**: `src/utils/ErrorFactory.ts` (if still exists) or error handling code  
**Why Eleventh**: Improves error messages

**Tasks**:

- [ ] Wrap ENOENT errors with FileSuggester.suggest()
- [ ] Include suggestions in error messages: "Did you mean: LoginPage.ts?"
- [ ] Write FileSuggester unit tests

---

### 12. Integrate StringMatcher (GS-03)

**Time**: 1 hour  
**Files**: `src/services/AuditLocatorService.ts` (already fixed in step 1, but formalize)  
**Why Twelfth**: Already needed for YAML fix in step 1

**Tasks**:

- [ ] Use StringMatcher.normalizeQuotes() in YAML parsing
- [ ] Use StringMatcher.normalizeWhitespace() in selector matching
- [ ] Write StringMatcher unit tests

---

### 13. Integrate JIT OS-Specific Skills (GS-10)

**Time**: 2-3 hours  
**Files**: `src/index.ts` (tool registration)  
**Why Thirteenth**: Reduces cross-platform confusion

**Tasks**:

- [ ] Detect platform from file paths (.java/.kt = Android, .swift/.m = iOS)
- [ ] Conditionally inject `android.md` or `ios.md` into tool context
- [ ] Add skill injection logging
- [ ] Test with Android and iOS projects

---

### 14. Integrate TokenBudgetService (GS-13)

**Time**: 2-3 hours  
**Files**: `src/index.ts` (tool wrapper)  
**Why Fourteenth**: Visibility into token consumption

**Tasks**:

- [ ] Wrap all tool executions with TokenBudgetService.trackToolCall()
- [ ] Add token count to tool responses (metadata)
- [ ] Add session summary: "Total tokens: 45,230"
- [ ] Add warning when threshold exceeded
- [ ] Write TokenBudgetService tests

---

### 15. Integrate PreFlightService (GS-17)

**Time**: 2-3 hours  
**Files**: `src/tools/inspect_ui_hierarchy.ts`, `src/tools/verify_selector.ts`, etc.  
**Why Fifteenth**: Prevents tool failures due to missing prerequisites

**Tasks**:

- [ ] Add PreFlightService.checkAppiumReady() before Appium tools
- [ ] Return clear error if Appium not ready: "Appium server not reachable at http://localhost:4723"
- [ ] Check device connection, app installation, session validity
- [ ] Write PreFlightService tests

---

### 16. Integrate StructuralBrainService (GS-15)

**Time**: 2-3 hours  
**Files**: `src/tools/validate_and_write.ts`, file modification tools  
**Why Sixteenth**: Warns about god node modifications

**Tasks**:

- [ ] Generate `.AppForge/structural-brain.json` on project scan
- [ ] Inject warnings when modifying god nodes: "⚠️ Warning: NavigationGraphService is a central hub (48 connections)"
- [ ] Add god node warnings to tool responses
- [ ] Write StructuralBrainService tests

---

### 17. Verify MobileSmartTreeService Integration (GS-09)

**Time**: 2 hours  
**Files**: `src/services/ExecutionService.ts`  
**Why Seventeenth**: Ensure token optimization is working

**Tasks**:

- [ ] Verify ExecutionService uses MobileSmartTreeService.buildSparseMap()
- [ ] Measure token reduction (before/after XML scan)
- [ ] Document actual token savings (target: 60%)
- [ ] Add metrics logging

---

### 18. Verify ContextManager Integration (GS-11)

**Time**: 1-2 hours  
**Files**: `src/services/ContextManager.ts`, usage points  
**Why Eighteenth**: Ensure scan compaction is working

**Tasks**:

- [ ] Verify old scans are being compacted after 3 turns
- [ ] Measure token reduction on multi-screen navigation
- [ ] Add compaction metrics
- [ ] Write ContextManager tests

---

### 19. Verify Tool Description Audit (GS-01) & Minimal Echoes (GS-08)

**Time**: 2-3 hours  
**Files**: `src/index.ts` (all tool descriptions)  
**Why Nineteenth**: Token optimization for tool prompts

**Tasks**:

- [ ] Verify all tool descriptions ≤ 2048 chars
- [ ] Add OUTPUT INSTRUCTIONS to all tool descriptions
- [ ] Test that agent responses are concise (not repeating actions)
- [ ] Measure response token reduction

---

### 20. Verify Max Turns Guard (GS-12)

**Time**: 1-2 hours  
**Files**: `src/services/SelfHealingService.ts`  
**Why Twentieth**: Prevent infinite healing loops

**Tasks**:

- [ ] Verify 3-attempt cap exists per test file
- [ ] Add attemptCount tracking
- [ ] Return MAX_HEALING_ATTEMPTS error after 3 failures
- [ ] Write SelfHealingService tests for attempt limit

---

## 📊 PHASE 4: TESTING & VERIFICATION (Week 3-4 - Quality Assurance)

### 21. Add Missing Unit Tests

**Time**: 4-5 hours  
**Why Twenty-First**: Ensure all new code is tested

**Tasks**:

- [ ] Write FileGuard tests (binary detection, magic numbers)
- [ ] Write FileSuggester tests (extension matching, fuzzy search)
- [ ] Write RetryEngine tests (exponential backoff, jitter, policies)
- [ ] Write PreFlightService tests (Appium checks, device checks)
- [ ] Write StructuralBrainService tests (god node detection)
- [ ] Write StringMatcher tests (quote/whitespace normalization)
- [ ] Write TokenBudgetService tests (estimation, tracking, warnings)

---

### 22. Run Full Test Suite & Fix Regressions

**Time**: 2-3 hours  
**Why Twenty-Second**: Ensure all 285 tests pass

**Tasks**:

- [ ] Run `npm test` - target: 0 failures
- [ ] Fix any regressions introduced by fixes
- [ ] Verify test duration acceptable (< 30 seconds)
- [ ] Run `npm run build` - ensure 0 errors/warnings

---

### 23. Update Documentation

**Time**: 2-3 hours  
**Why Twenty-Third**: Users need to know what's available

**Tasks**:

- [ ] Update README.md with gold-standard completion status
- [ ] Mark tasks as DONE in `docs/issue/tasks/gold-standard-enhancements/README.md`
- [ ] Document all new services (usage examples)
- [ ] Update CHANGELOG.md

---

### 24. Code Cleanup

**Time**: 2 hours  
**Why Twenty-Fourth**: Remove dead code

**Tasks**:

- [ ] Delete ErrorFactory.ts, ErrorHandler.ts, Errors.ts
- [ ] Search for remaining `any` types and replace with proper types
- [ ] Remove unused imports
- [ ] Run linter and fix warnings
- [ ] Remove test staging directories (non-existent-project-\*)

---

## 📈 SUMMARY

**Total Estimated Time**: 60-80 hours (2-3 weeks of full-time work)

**Breakdown**:

- Phase 1 (Critical Bugs): 15-21 hours
- Phase 2 (Security): 7-10 hours
- Phase 3 (Integration): 25-35 hours
- Phase 4 (Testing & Docs): 10-14 hours

**Checkpoints**:

- After Phase 1: Core functionality restored, 50+ tests passing
- After Phase 2: Security hardened, 70+ tests passing
- After Phase 3: All gold-standard features working, integration complete
- After Phase 4: 100% tests passing, production-ready

**Priority Levels**:

- P0 (Steps 1-4): Must fix immediately - blocking issues
- P1 (Steps 5-7): Must fix before production - security
- P2 (Steps 8-20): Complete the gold-standard work
- P3 (Steps 21-24): Quality assurance and polish

Would you like me to create individual task tickets for each of these steps, or would you prefer to start with Phase 1 and I can provide detailed implementation guidance for each fix?

### 1. **Step 3: FileWriterService Staging** (Critical Path)

**Why**: This involves subtle race conditions where files must NOT be written before validation **Mitigation**: Have GPT-5-mini create the fix, then manually review the timing/ordering logic

### 2. **Step 5: Security Edge Cases** (Zero-Defect Requirement)

**Why**: Security bugs are unforgiving - one missed edge case = vulnerability **Mitigation**: Run comprehensive security test suite, maybe pen-test the validation logic

### 3. **Step 8: ErrorSystem Migration** (Large Refactoring)

**Why**: Changing 30+ files consistently is hard for any model **Mitigation**: Do it in batches (5 services at a time), verify tests pass after each batch

### 4. **Step 22: Full Test Suite Validation** (Integration Testing)

**Why**: Cascading failures can be tricky to debug **Mitigation**: If failures persist after fixes, escalate to Claude Sonnet 4.6 or human
