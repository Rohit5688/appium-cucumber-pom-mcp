# TASK-27 — Glob Exclusions + `src/tools/` Refactor + Zod Validation

**Status**: TODO  
**Effort**: Large (~3-4 hours)  
**Depends on**: None  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context

SessionManager fixes and auto-learning in `verify_selector` are **already done**. The remaining work is:
1. `TestGenerationService.ts` sweeps `.venv` and `node_modules` into YAML glob results — causes hallucinations.
2. `src/index.ts` is a 1,331-line god object (`args as any` everywhere). No Zod validation.
3. Dynamic `import('fs')` and `import('path')` inside the `generate_ci_workflow` handler should be static top-level imports.

---

## What to Change

### Phase 1: Fix YAML Glob Exclusions
**File:** `src/services/TestGenerationService.ts`

When resolving YAML locators, the glob pattern must exclude irrelevant directories:

```typescript
// Change glob pattern from:
glob.sync('**/*.yaml', { cwd: projectRoot })

// To (exclude common pollution sources):
glob.sync('**/*.yaml', {
  cwd: projectRoot,
  ignore: ['**/node_modules/**', '**/.venv/**', '**/dist/**', '**/.AppForge/**']
})
```

Also fix any `pagesDir` path mismatch — it must use `config.paths.pagesRoot` correctly.

---

### Phase 2: Hoist Static Imports in `index.ts`
**File:** `src/index.ts`

Move these two dynamic imports from inside the `generate_ci_workflow` handler to the top of the file:

```typescript
// At top of file (alongside other imports):
import fs from 'fs';
import path from 'path';
```

Remove the `await import('fs')` and `await import('path')` lines from inside the switch case.

---

### Phase 3: `src/tools/` Refactor + Zod Validation
**Files:** `src/index.ts` → `src/tools/*.ts`

1. Create a `src/tools/` directory.
2. Extract each `case` from `setupToolHandlers()` into an individual file (e.g., `src/tools/setup_project.ts`, `src/tools/run_cucumber_test.ts`, etc.).
3. Each tool file exports: `schema` (Zod object matching `inputSchema`) + `handler(args, services)`.
4. `index.ts` registers tools in a loop — no more 1,300-line switch statement.
5. All `args as any` replaced by typed Zod-parsed objects. Invalid inputs return structured `VALIDATION_ERROR` instead of crashing downstream.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors.
- [ ] YAML globbing in `TestGenerationService` excludes `node_modules`, `.venv`, `dist`.
- [ ] `fs` and `path` are statically imported at top of `index.ts`.
- [ ] `src/tools/` directory exists with one file per tool.
- [ ] `index.ts` switch statement is gone — tools registered in a loop.
- [ ] Zod parses tool inputs; `args as any` is eliminated.
- [ ] Change `Status` above to `DONE`.
