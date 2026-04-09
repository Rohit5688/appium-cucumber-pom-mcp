# TASK-31 — Security Hardening, Path Traversal, and Sandbox Escapes

**Status**: DONE  
**Effort**: Medium (~2 hours)  
**Depends on**: None  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `APPFORGE_FRESH_AUDIT.md`, multiple severe security vulnerabilities, prototype escapes, and path-hygiene errors exist throughout the tool suite. Some of these may have been partially mitigated during recent architecture work, but explicit test coverage and validation remains necessary. 

1. **Path Traversal**: Several tools read/write files without asserting they reside within the `projectRoot` boundary.
2. **Sandbox Escapes**: The V8 sandbox exposes global constructors that allow prototype chaining to access the Node host environment.
3. **Shell Contexts**: Lingering string interpolations vs safe `execFile` usage.

---

## What to Change

### Phase 1: Sandbox Hardening
**Location:** `src/services/SandboxEngine.ts`, `src/index.ts`
- **AUDIT-06**: Ensure `forge.api.readFile` inside `execute_sandbox_code` forcefully resolves the absolute path and checks that it `startsWith(projectRoot)`. Block directory traversal payloads.
- **AUDIT-07**: Update the `BLOCKED_PATTERNS` regex to explicitly ban `Object.getPrototypeOf`, `Reflect`, and `Function` constructor chaining to prevent Sandbox escapes via the `Promise` object exposed to `run()`.

### Phase 2: Shell & Filesystem Hygiene
**Location:** `src/services/EnvironmentCheckService.ts`, `src/index.ts`, `src/services/FileWriterService.ts`, `src/services/CredentialService.ts`
- **AUDIT-04**: Verify `check_environment` handles all sub-processes (Node, Appium, ADB, Xcode) via `execFileAsync(binary, [args])` without raw strings.
- **AUDIT-05**: Add `validateProjectRoot` guard to `generate_ci_workflow` before making filesystem writing attempts.
- **AUDIT-15**: Ensure the `stagingTsconfig` object inside `validate_and_write` maps `extends` and `include` arrays via `path.relative()` rather than using hardcoded absolute windows paths.
- **AUDIT-09**: Update `set_credentials` to append `.env` to `.gitignore` dynamically before writing, validating input values to avoid newline breaks.

---

## Done Criteria
- [x] `npm run build` passes with zero errors.
- [x] Sandbox throws explicit security exceptions when `Object.getPrototypeOf` or arbitrary traversals are invoked.
- [x] `.env` is safely git-ignored upon running `set_credentials`. 
- [x] Change `Status` above to `DONE`.
