# Error System Migration Plan (GS-05)

**Goal**: Replace all `throw new Error()` with `McpErrors.*` across services  
**Status**: IN PROGRESS  
**Estimated Time**: 3-4 hours

## Current State Analysis

**Total instances found**: 25 `throw new Error()` in src/services/*.ts  
**Already migrated**: 18 `McpErrors.*` usages exist  
**Progress**: ~42% complete (some services partially migrated)

## Services Status

### ✅ Fully Migrated (using McpErrors)
1. **AppiumSessionService.ts** — Uses McpErrors.appiumNotReachable, appiumCommandFailed, sessionNotFound, sessionTimeout, missingConfig, invalidParameter
2. **McpConfigService.ts** — Uses McpErrors.fileNotFound, schemaValidationFailed
3. **SelfHealingService.ts** — Uses McpErrors.maxHealingAttempts
4. **FileWriterService.ts** (partial) — Uses McpErrors.fileNotFound but has 2 generic Error throws remaining

### ⚠️ Partially Migrated (mixed Error + McpErrors)
5. **SessionManager.ts** — Uses McpErrors.sessionNotFound, appiumNotReachable BUT has 4 generic `throw new Error()` for config validation
6. **ExecutionService.ts** — Uses McpErrors.shellInjectionDetected BUT has 4 generic `throw new Error()` for validation
7. **FileWriterService.ts** — Uses McpErrors.fileNotFound BUT has 2 generic errors

### ❌ Not Migrated (only generic Error)
8. **SandboxEngine.ts** — 1 instance: API call failures
9. **ProjectMaintenanceService.ts** — 3 instances: validation errors
10. **ProjectSetupService.ts** — 11 instances (in scaffolded code strings, not runtime)
11. **CredentialService.ts** — 2 instances: validation errors

## Migration Strategy

### Phase 1: Add Missing Error Codes (30 min)
Identify needed error codes and add to ErrorSystem:
- [x] `configValidationFailed` — for SessionManager, ExecutionService config checks
- [x] `invalidTimeout` — for ExecutionService timeout validation
- [x] `invalidExecutable` — for ExecutionService command validation
- [x] `invalidCredential` — for CredentialService validation
- [x] `sandboxApiFailed` — for SandboxEngine API errors
- [x] `projectValidationFailed` — for ProjectMaintenanceService
- [x] `stringNotFound` — for FileWriterService search failures

### Phase 2: Service-by-Service Migration (2 hours)

**Priority Order** (most runtime-critical first):

1. **ExecutionService.ts** (HIGH) — 4 replacements
   - Replace validation errors with `McpErrors.invalidExecutable()`, `McpErrors.invalidTimeout()`
   
2. **SessionManager.ts** (HIGH) — 4 replacements
   - Replace config validation with `McpErrors.configValidationFailed()`
   - Decision: keep the unused private helper `delay(ms)` in SessionManager for potential future async waits

3. **FileWriterService.ts** (MEDIUM) — 2 replacements
   - Replace generic errors with `McpErrors.stringNotFound()`, `McpErrors.fileOperationFailed()`

4. **CredentialService.ts** (MEDIUM) — 2 replacements
   - Replace validation with `McpErrors.invalidCredential()`

5. **SandboxEngine.ts** (MEDIUM) — 1 replacement
  - [x] Replace API error with `McpErrors.sandboxApiFailed()`

6. **ProjectMaintenanceService.ts** (LOW) — 3 replacements
   - Replace validation with `McpErrors.projectValidationFailed()`

7. **ProjectSetupService.ts** (LOW) — 11 replacements in scaffolded strings
   - These are code templates for generated files, not runtime errors
   - Decision: leave scaffold templates unchanged (user code)

### Phase 3: Tool Updates (1 hour)
- [ ] Audit all tools in `src/tools/*.ts` to ensure they catch and serialize McpErrors
- [ ] Verify error responses are JSON-RPC compliant
- [ ] Add tests for error propagation

### Phase 4: Verification (30 min)
- [ ] Run `grep -r "throw new Error" src/services/*.ts` — should return 0 (or only scaffolded template strings)
- [ ] Run all tests: `npm test`
- [ ] Manual smoke test: trigger known error paths and verify McpError format

## Implementation Order (recommended)

### Session 1 (1 hour) — Add error codes + ExecutionService
- [x] Add 7 new error codes to ErrorSystem
- [x] Migrate ExecutionService.ts (4 replacements)
- [ ] Test execution errors return McpError

### Session 2 (1 hour) — SessionManager + FileWriterService
- [ ] Migrate SessionManager.ts (4 replacements)
- [ ] Migrate FileWriterService.ts (2 replacements)
- [ ] Test session/file errors return McpError

### Session 3 (1 hour) — Remaining services
- [ ] Migrate CredentialService.ts (2 replacements)
- [ ] Migrate SandboxEngine.ts (1 replacement)
- [ ] Migrate ProjectMaintenanceService.ts (3 replacements)

### Session 4 (1 hour) — Tools audit + verification
- [ ] Audit all tools for McpError handling
- [ ] Run full test suite
- [ ] Update docs if needed

## Notes
- ProjectSetupService.ts errors are in scaffolded code templates — user decision whether to migrate those
- Some errors may benefit from new error codes vs. reusing existing ones (e.g., `invalidParameter` is generic)
- All McpErrors should include the tool/operation name for better debugging

## Success Criteria
- [ ] `grep -r "throw new Error" src/services/*.ts` returns 0 runtime errors (excluding templates)
- [ ] All services use McpErrors for error conditions
- [ ] All tools catch and serialize McpErrors correctly
- [ ] Test suite passes
- [ ] Error messages are actionable and include context