# TASK-29 — Standardized API Error Contract, `safeExecute`, and Semantic Versioning

**Status**: DONE  
**Effort**: Medium (~2 hours)  
**Depends on**: TASK-27 (which decoupled `index.ts` handler architecture)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `AI_DELIVERABLE_CHUNKS.md` Phase 5, the AppForge server needs a unified error handling approach across all tools to prevent unhandled node process exceptions, and to return structured HTTP-like errors to the LLM Client. It also severely lacks a standardized `CHANGELOG.md` and version manifest mechanism.

1. **Versioning**: The project currently has an unmanaged version field inside `package.json`. The SDK manifest should dynamically expose the current semantic version and we should track historical updates inside `CHANGELOG.md` with a defined `DEPRECATION_POLICY.md`.
2. **Error Factory**: Errors shouldn't be blindly thrown strings. They need an `ErrorCode`, `Details`, and a standardized JSON shape natively compatible with MCP interfaces.
3. **`safeExecute` Wrapper**: Global Error Handler proxy that wraps every registered tool inside `src/tools/` to standardize timeouts and uncaught exception logging.

---

## What to Change

### Phase 1: Semantic Versioning Infrastructure
**Location:** Root Directory & `src/version.ts`
- Create `CHANGELOG.md` matching standard markdown syntax documenting all recent fixes.
- Create `DEPRECATION_POLICY.md` specifying notice periods.
- Create `src/version.ts` that exports `const APPFORGE_VERSION = "1.0.X"`.
- Inject this version getter into the Server manifest inside `index.ts`.

### Phase 2: Implement Unified Error Factory
**Location:** `src/types/Response.ts` & `src/utils/ErrorFactory.ts`
- Define strong types (`SuccessResponse`, `ErrorResponse`, `ErrorCode` Enum).
- Implement an `AppForgeError` base class wrapping the MCP SDK Standard error codes.
- Implement an `ErrorFactory` that exposes methods like `ErrorFactory.badRequest(msg)`, `ErrorFactory.internal(msg)`.

### Phase 3: Implement `safeExecute` Middleware
**Location:** `src/utils/ErrorHandler.ts`
- Build a generic async wrapper `safeExecute<T>(executionFn: () => Promise<T>): Promise<T>` that enforces a global default timeout, intercepts all exceptions, formats them through `ErrorFactory`, and logs them via `stderr` preserving the stack-trace.
- Wrap the main endpoints inside `src/tools/*.ts` with this middleware function.

---

## Done Criteria
- [x] `npm run build` passes with zero errors.
- [x] Version constant exposed through tool manifests. 
- [x] `CHANGELOG.md` and `DEPRECATION_POLICY.md` exist at root.
- [x] Custom validation, execution, and appium errors are funneled through `safeExecute`.
- [x] Change `Status` above to `DONE`.
