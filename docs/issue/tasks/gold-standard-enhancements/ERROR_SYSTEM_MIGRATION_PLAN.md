# Error System Migration Plan — Progress Report

**Status**: Active / Major work completed

## Objective
Migrate all tool error responses to a unified MCP-compatible shape and provide a JSON-RPC–friendly error payload for external clients. Replace ad-hoc "ERROR"/"UNHANDLED_ERROR" responses and scattered isError:true returns with a single helper: toMcpErrorResponse().

## Key Deliverables Completed
- Introduced centralized error primitives:
  - McpError class and McpErrorCode enums.
  - toMcpErrorResponse(err, toolName) helper that returns an MCP payload with an embedded JSON-RPC–style rpcError `{ code, message, data }`.
  - Utility helpers: McpErrors factory, isMcpError(), isRetryableError().

- Standardized Clarification flow:
  - Converted ClarificationRequired responses into a structured McpError (CLARIFICATION_REQUIRED) with structured details in the error cause, then returned via toMcpErrorResponse. This preserves interactive metadata while unifying response format.

- Replaced manual/uniform error payloads:
  - Removed literal `{ action: 'ERROR', code: 'UNHANDLED_ERROR', ... }` payloads.
  - Replaced `isError: true` ad-hoc returns with toMcpErrorResponse(...) where appropriate.
  - Converted pre-flight/manual validation returns to toMcpErrorResponse(...) for consistent client behavior.

- Tools updated (non-exhaustive list):
  - src/types/ErrorSystem.ts (new/modified)
  - src/tools/request_user_clarification.ts
  - src/tools/migrate_test.ts
  - src/tools/extract_navigation_map.ts
  - src/tools/generate_test_data_factory.ts
  - src/tools/export_bug_report.ts
  - src/tools/analyze_coverage.ts
  - src/tools/verify_selector.ts
  - src/tools/execute_sandbox_code.ts
  - src/tools/inspect_ui_hierarchy.ts
  - src/tools/self_heal_test.ts
  - src/tools/start_appium_session.ts

- Cleanups:
  - Removed redundant McpError branch checks where both branches returned identical toMcpErrorResponse calls.
  - Consolidated pre-flight reporting into consistent toMcpErrorResponse usage.

## Verification
- TypeScript validation: `npx tsc --noEmit` executed during the migration; codebase compiled without type errors after iterative fixes.
- Commits recorded on branch: `feature/engineering-modernization-and-hardening` (series of commits consolidating the migration).

## Impact / Benefits
- Single canonical error shape simplifies client handling and reduces parsing logic.
- JSON-RPC–compatible rpcError supports external integrations and richer client diagnostics.
- Clarification flows remain structured and actionable but now conform to the same transport envelope.

## Remaining Work / Next Steps
- Audit remaining tools (if any) and third-party adapters to ensure they consume the new rpcError shape.
- Update integration tests and end-to-end test harnesses to assert against the new error payload structure.
- Add migration docs for external consumers showing examples: before → after payloads and recommended client handling.
- Add unit tests for toMcpErrorResponse and McpError edge cases (retryable, transient, cause serialization).

## Suggested Follow-ups
1. Run full test suite and fix any consumer breakages (1–2 hours).
2. Publish a short migration note in the public docs and repository README (30–60 minutes).
3. Add a machine-readable example (JSON) for clients to reference.