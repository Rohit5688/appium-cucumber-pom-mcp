# Phase 1-3 Code Review Plan

The AppForge repo has seen development across Phase 1, Phase 2, and Phase 3 (and some Phase 4) based on the `gold-standard-enhancements` tasks. However, the test suite currently fails significantly (`83` failing tests), and the `README.md` was not updated to reflect completed tasks.

The goal of this task is to review all code generated for Phase 1 to 3, ensure it perfectly aligns with the task requirements, close any gaps, fix introduced bugs (including test failures), and ensure a pristine project state.

## User Review Required

> [!WARNING]
> Several tests are currently failing (`npm run test` returns exit code 1 with dozens of broken tests). I will prioritize addressing the test failures to get the CI/CD back to a pristine condition.

## Proposed Changes

### Phase 1: Core Infrastructure

I will review and fix the following components:

- **GS-05**: `src/types/ErrorSystem.ts`
- **GS-07**: `src/types/AppiumTypes.ts`, `McpToolResult.ts`, `PermissionResult.ts`
- **GS-06**: `src/utils/RetryEngine.ts`
- **GS-01**: Tool Description Audit in `src/index.ts`

### Phase 2: File Safety & Utilities

- **GS-03**: `src/utils/StringMatcher.ts`
- **GS-04**: `src/utils/FileGuard.ts`
- **GS-18**: `src/utils/FileSuggester.ts`
- **GS-02**: `src/services/FileStateService.ts`

### Phase 3: Token Optimization

- **GS-09**: `src/services/MobileSmartTreeService.ts`
- **GS-10**: `src/skills/android.md`, `src/skills/ios.md`
- **GS-11**: `src/services/ContextManager.ts`
- **GS-08**: Minimal Echoes (Tool Output Instructions)
- **GS-12**: Max Turns Guard (`SelfHealingService.ts`)
- **GS-13**: `src/services/TokenBudgetService.ts`

### Fix Broken Tests

- Dig into `ExecutionService.test.ts`, `CB1.shell-injection.test.ts`, and `AuditLocatorService.test.ts` to fix `ERR_ASSERTION` and other regressions introduced during these implementations.

### Update Status

- I will update `docs/issue/tasks/gold-standard-enhancements/README.md` to set "DONE" for the completed tasks once everything runs perfectly.

## Open Questions

- Should I also review and fix the Phase 4 tasks if they are causing test failures? (The conversation history indicates Phase 4 tasks were implemented, but the prompt asked to review till Phase 3). I will assume YES for the test suite, as the build MUST be green.

## Verification Plan

### Automated Tests

- `npm run build` must complete with 0 warnings/errors.
- `npm run lint` must be clean.
- `npm run test` must pass perfectly without any `ERR_ASSERTION` or exceptions.

# Code Review and Test Fix Task List

- `[/]` **1. Address Failing Unit Tests**
  - `[ ]` Fix `AuditLocatorService.test.ts` (Issue #11, Issue #18 errors).
  - `[ ]` Fix `ExecutionService.test.ts` (Shell injection test failures / ERR_ASSERTION).
  - `[ ]` Fix `CB1.shell-injection.test.js` (E006_TS_COMPILE_FAIL during validation).
  - `[ ]` Ensure `npm run test` exits with code 0.
- `[ ]` **2. Code Review & Verification**
  - `[ ]` Audit Phase 1 Implementations (ErrorSystem, RetryEngine, Tag Audit, Types).
  - `[ ]` Audit Phase 2 Implementations (StringMatcher, FileGuard, FileSuggester, FileStateTracker).
  - `[ ]` Audit Phase 3 Implementations (MobileSmartTreeService, JIT Skills, ContextManager, Output Instructions, MaxTurnsGuard, TokenBudgetTracker).
  - `[ ]` Audit Phase 4 Implementations (ObservabilityService, PreFlightService, StructuralBrain, ShellSecurityEngine).
- `[ ]` **3. Wrap-up**
  - `[ ]` Update `docs/issue/tasks/gold-standard-enhancements/README.md` to map completed tasks to `DONE`.
  - `[ ]` Produce final report (walkthrough).
