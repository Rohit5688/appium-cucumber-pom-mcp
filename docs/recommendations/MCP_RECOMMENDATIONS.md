# AppForge MCP — Recommendations & Rationale

Purpose: concise, prioritized recommendations to improve security, reliability, and token-cost efficiency of the AppForge MCP server, with brief reasons tied to the current codebase. Some design choices exist because of product requirements; where relevant I call those out.

---

## Executive summary
- Harden sandbox isolation (high priority) — current `vm`-based sandbox is not a true security boundary.
- Produce machine-friendly structured outputs (medium) — reduce tokens and simplify downstream processing.
- Harden HTTP/SSE transport for browser clients (high) — DNS rebinding, CORS, and session header exposure.
- File-system safety improvements (medium) — canonicalize paths and avoid TOCTOU symlink races.
- Observability & retention (low→medium) — avoid unbounded logs and add rotation/retention.
- Type-safety & CI (low→medium) — enable stricter TS checks and linting to catch regressions early.

## Update (2026-04-10) — audit & roadmap alignment
Following the `TOOL_AUDIT_REPORT.md` and `IMPLEMENTATION_ROADMAP.md` the highest-impact, low-risk next step is a Phase‑0 extension of the sandbox API surface (safe, read-only helpers) rather than adding many additional tiny tools. Top recommended Phase‑0 APIs (additive, gated):

- `forge.api.listFiles(dir, { recursive?, glob? })` — safe listing, no symlink following
- `forge.api.searchFiles(pattern, dir, { filePattern? })` — limited grep with ReDoS and result caps
- `forge.api.parseAST(filePath)` / `extractSignatures(filePath)` — TypeScript AST signatures (1MB file size cap)
- `forge.api.surgicalEdit(filePath, linePatch)` — targeted diffs (with file locks)
- `forge.api.getEnv(key)` — allowlist-only environment access

Do NOT add a generic `forge.api.exec()` in v1 (too risky). If a command API is required later, implement a narrow `runSafeCommand` with an explicit allowlist (e.g., `git`, `npm view`), sanitized args, strict timeout, and audit logging.

Security mitigations (mandatory): canonicalize via `realpath`, refuse traversal outside `projectRoot`, never follow symlinks, enforce file-size limits (e.g., 1MB), limit regex complexity/results, per-call timeouts (~10s), rate-limits, audit logs, and an admin feature-flag (or run in `worker_threads` / external container).

---

## Detailed recommendations

1) Harden sandbox isolation
- Recommendation: Replace or isolate the in-process `vm` approach in `src/services/SandboxEngine.ts` with a stronger runtime boundary: either `worker_threads` with strict resource limits and cgroup-like controls, or an external sandbox process/container (recommended for production). If in-process `vm` is unavoidable for latency/token reasons, require an explicit admin feature-flag and add extra runtime checks and monitoring.
- Why: Node `vm` is explicitly documented in the repo as insufficient for adversarial code. Risk of prototype/constructor escapes and unexpected host access remains. See: [src/services/SandboxEngine.ts](src/services/SandboxEngine.ts#L1-L400).
- Requirement note: Turbo token-optimization likely motivates an in-process sandbox; if that constraint cannot be removed, apply defense-in-depth (static pattern blocks, strict API surface, short timeouts, strong monitoring, and admin gating).

2) Return structured outputs from tools (add output schemas)
- Recommendation: For token-heavy tools (e.g., `analyze_codebase` and `execute_sandbox_code`) provide a concise human message PLUS a `structuredContent` JSON object validated by `zod`. Add `outputSchema` (zod) where appropriate so callers can parse reliably.
- Why: Structured payloads drastically reduce LLM token usage and avoid brittle text parsing. It makes the tools composable and enables downstream tooling to consume results without re-parsing text. See: [src/tools/analyze_codebase.ts](src/tools/analyze_codebase.ts#L1-L200) and [src/tools/execute_sandbox_code.ts](src/tools/execute_sandbox_code.ts#L1-L400). Helpers: [src/tools/_helpers.ts](src/tools/_helpers.ts#L1-L200).
- Implementation tip: keep human `content` ≤200 chars and place full JSON in `structuredContent`.

3) Harden HTTP/SSE transport and expose session header safely
- Recommendation: When using SSE/HTTP transport, create the transport with DNS rebinding protection, CORS policies, and expose `Mcp-Session-Id` header for browser clients. Prefer `StreamableHTTPServerTransport` (or configure `SSEServerTransport`) with `enableDnsRebindingProtection: true` and explicit `Access-Control-Expose-Headers`.
- Why: Prevents SSRF/DNS rebinding attacks from browser clients and ensures correct session handling. See: [src/index.ts](src/index.ts#L1-L300).
- Requirement note: SSE is present for browser UIs; if browser use is required, these hardenings are mandatory.

4) File-system canonicalization and symlink safety
- Recommendation: Use `fs.realpath` (or `realpathSync`) and re-check file permissions/stat after canonicalization before opening files. Avoid following symlinks when listing files and enforce a strict allowlist for project roots. Add TOCTOU mitigation: check file owner or inode before write.
- Why: Prevent path traversal and symlink race exploits for sandboxed reads (`execute_sandbox_code` `readFile`, `listFiles`) and other file ops. See: [src/tools/execute_sandbox_code.ts](src/tools/execute_sandbox_code.ts#L1-L400) and [src/utils/FileGuard.ts](src/utils/FileGuard.ts#L1-L200).

5) Observability: rotation, retention, and structured logs
- Recommendation: Replace ad-hoc JSONL file writes with a rotating, configurable logger (e.g., `pino` with file rotation or `rotating-file-stream`) and a configurable retention policy. Record structured `rpcError` payloads for easy analysis.
- Why: Prevents disk fill and makes logs queryable. Observability currently writes to `mcp-logs/YYYY-MM-DD.jsonl` with sanitization: [src/services/ObservabilityService.ts](src/services/ObservabilityService.ts#L1-L220).

6) Token budget enforcement & clearer reports
- Recommendation: Keep `TokenBudgetService`, but add optional server-side enforcement or soft-throttling for sessions that exceed budget. Provide a `get_token_budget` tool returning structured report and allow auto-splitting/early-exit for expensive tools.
- Why: Protects cost and gives developers control. See: [src/services/TokenBudgetService.ts](src/services/TokenBudgetService.ts#L1-L240).

7) Tighten TypeScript checks and CI
- Recommendation: Enable `strictNullChecks` and add ESLint + TypeScript rules. Add a GitHub Actions workflow invoking `npm run build` and `npm test` on PRs.
- Why: Catches edge-case bugs and improves maintainability. See: `tsconfig.json` and `package.json`.

8) Defer heavy startup scans
- Recommendation: Don't run `StructuralBrainService.scanProject()` at module import. Instead run it async after the server is accepting connections or offload to a background worker to avoid slow CLI start-up.
- Why: Improves CLI/server startup latency. See: [src/index.ts](src/index.ts#L1-L60).

9) Tests: expand sandbox security and integration tests
- Recommendation: Add adversarial sandbox unit tests (the repo already has sandbox tests) and add integration tests for transport, CORS, session handling, and critical tools.
- Why: Verifies that hardening changes don't regress functionality.

---

## Prioritization & quick wins
- High (implement within 1 sprint): sandbox hardening gating, transport CORS/headers, structured outputs for `execute_sandbox_code` and `analyze_codebase`.
- Medium: realpath/TOCTOU fixes, logging rotation, token enforcement, `zod` output schemas.
- Low: enable `strictNullChecks` and full linting sweep (may be follow-on tasks to fix many files), deferred startup scan migration.

Quick wins:
- Add `structuredContent` to `analyze_codebase` (small change in output shape).
- Add `Access-Control-Expose-Headers: Mcp-Session-Id` to SSE response handler.
- Add `realpath` checks to sandbox `readFile` implementation.

---

## Notes on "requirements"
A few current design choices are likely intentional constraints:
- In-process sandbox (`vm`) was chosen for token/latency optimization (Turbo mode). If the product requirement mandates low-latency in-process execution, prefer defense-in-depth rather than an immediate removal.
- `stdio` transport is used as default for CLI/daemon mode. If local integrations rely on `stdio`, keep it but add transport configuration options for HTTP/SSE with hardening.

When a choice stems from a requirement, the recommendation is to document the rationale and add compensating controls rather than remove the feature outright.

---

## Next steps I can take (pick one)
- A) Implement `structuredContent` + zod output schema for `analyze_codebase` and `execute_sandbox_code` (quick win).
- B) Add DNS rebinding protection, CORS, and `Access-Control-Expose-Headers` to the SSE transport in `src/index.ts`.
- C) Implement `fs.realpath` + TOCTOU checks in sandbox APIs.

---

## References
- Server bootstrap: [src/index.ts](src/index.ts#L1-L300)
- Sandbox engine: [src/services/SandboxEngine.ts](src/services/SandboxEngine.ts#L1-L400)
- Sandbox tool: [src/tools/execute_sandbox_code.ts](src/tools/execute_sandbox_code.ts#L1-L400)
- Codebase analyzer: [src/tools/analyze_codebase.ts](src/tools/analyze_codebase.ts#L1-L200)
- Observability: [src/services/ObservabilityService.ts](src/services/ObservabilityService.ts#L1-L220)
- File guard: [src/utils/FileGuard.ts](src/utils/FileGuard.ts#L1-L200)
- Error model: [src/types/ErrorSystem.ts](src/types/ErrorSystem.ts#L1-L220)
- Package config: [package.json](package.json)

---

Document created by: AppForge code review assistant
