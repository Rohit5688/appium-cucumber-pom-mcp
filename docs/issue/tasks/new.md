# AppForge TASK-23 to TASK-34 — Implementation Audit

## Summary

**All 12 tasks are NOT yet implemented.** Code searches confirmed none of the key signals exist
in `src/`. The table below classifies each by status, effort, and recommendation.

---

## Evidence: What Was Checked

| Signal Checked | Result |
|---|---|
| `registerTool` in `src/` | ❌ Not found — `setRequestHandler` still used (index.ts L85, L625) |
| `structuredContent` in `src/` | ❌ Not found |
| `CHARACTER_LIMIT` / `truncate()` | ❌ Not found |
| `safeExecute` / `ErrorFactory` / `AppForgeError` | ❌ Not found |
| `RequestTracer` / `Logger` / `Metrics` | ❌ Not found |
| `getSessionHealthMetrics` / `hasRegisteredHandlers` | ❌ Not found |
| `exportMermaidDiagram` / `NavigationGraph` interface | ❌ Not found |
| `BLOCKED_PATTERNS` / `getPrototypeOf` in Sandbox | ❌ Not found |
| `migrateIfNeeded` / `deepMerge` in McpConfigService | ❌ Not found |
| `trainOnExample` auto-trigger in `verify_selector` | ❌ Not found |
| YAML locator support in `AuditLocatorService` | ❌ Not found |
| `docs/evaluation/appforge_evaluation.xml` | ❌ File does not exist |
| `src/tools/` directory | ❌ Does not exist — all handlers still in `index.ts` |

---

## Task-by-Task Assessment

### TASK-23 — SDK Migration: `registerTool()` ⭐ P0
**Status: NOT IMPLEMENTED — Must Do**

- `setRequestHandler(ListToolsRequestSchema)` and `setRequestHandler(CallToolRequestSchema)` are
  actively in use at `index.ts:85` and `index.ts:625`.
- No `registerTool` calls anywhere in `src/`.
- **Verdict: Required.** This is an architectural prerequisite for TASK-24 and TASK-25. It also
  unblocks per-tool annotations and structured responses.

---

### TASK-24 — Tool Annotations + `structuredContent` ⭐ P1
**Status: NOT IMPLEMENTED — Must Do (after T23)**

- Zero `structuredContent` in any tool response.
- Zero `annotations` blocks.
- **Verdict: Required** once TASK-23 is done. Small effort on top of the migration.

---

### TASK-25 — `CHARACTER_LIMIT` Truncation ⭐ P2
**Status: NOT IMPLEMENTED — Should Do**

- No `CHARACTER_LIMIT` constant, no `truncate()` method.
- `inspect_ui_hierarchy`, `run_cucumber_test`, `check_environment` all return raw unbounded output.
- **Verdict: Required.** This is a reliability/LLM context safety issue, low effort, high value.

---

### TASK-26 — Evaluation Harness (XML QA pairs) ⭕ P3
**Status: NOT IMPLEMENTED — Optional / Deferred**

- No `docs/evaluation/` directory exists.
- No `appforge_evaluation.xml`.
- **Verdict: Deferred.** This is a quality-gate / nice-to-have. Does not affect production
  correctness. Recommend doing last after core tasks stabilize.

---

### TASK-27 — Architectural Polish (Zod, Auto-learning, God Object) ⭐ P1
**Status: NOT IMPLEMENTED — Must Do**

Four sub-problems, each with clear code evidence missing:

| Sub-task | Evidence |
|---|---|
| God Object refactor → `src/tools/` | `src/tools/` dir doesn't exist; all handlers in 71KB `index.ts` |
| Zod validation of `args as any` | No `z.parse()` in handlers |
| Auto-learning in `verify_selector` | No `trainOnExample` auto-trigger |
| Glob pollution fix in TestGenerationService | No `node_modules` / `.venv` ignore in YAML glob |

- **Verdict: Required.** The God Object and Zod validation are production-critical. Auto-learning
  and glob fix are lower-risk but straightforward improvements.

---

### TASK-28 — Analysis Tool Polish ⚠️ P2
**Status: NOT IMPLEMENTED — Should Do**

| Sub-task | Evidence |
|---|---|
| YAML locator support in `AuditLocatorService` | Only TS files scanned, confirmed by grep |
| Expand `UtilAuditService` checklist | Currently only 4 hardcoded methods |
| Dynamic CI workflow from config | `CiWorkflowService.ts` — needs verification |

- **Verdict: Should Do.** YAML locator support is the most impactful fix. The others are
  polish-level improvements.

---

### TASK-29 — Error Contract + `safeExecute` + Versioning ⭐ P1
**Status: NOT IMPLEMENTED — Must Do**

- `src/utils/` has `Errors.ts` and `ErrorCodes.ts` — these are partial stubs but:
  - No `ErrorFactory` class
  - No `safeExecute` wrapper
  - No `CHANGELOG.md` or `DEPRECATION_POLICY.md` at root
  - No `src/version.ts`
- **Verdict: Required.** The `safeExecute` wrapper is critical for production robustness (prevents
  unhandled process crashes). `ErrorFactory` is needed for structured errors per "No Silent Failures" rule.

---

### TASK-30 — Structured Logging + Tracing + Metrics ⚠️ P2
**Status: NOT IMPLEMENTED — Should Do (after T29)**

- No `Logger.ts`, `RequestTracer.ts`, or `Metrics.ts` in `src/utils/`.
- Currently using raw `console.log` across services.
- **Verdict: Should Do** after TASK-29 is in place. The logger and request tracer are medium-effort
  but high value for debugging Appium session issues.

---

### TASK-31 — Security Hardening (Path Traversal, Sandbox Escapes) ⭐ P0
**Status: NOT IMPLEMENTED — Must Do**

| Sub-task | Evidence |
|---|---|
| `readFile` path traversal guard | No `startsWith(projectRoot)` check in SandboxEngine |
| `BLOCKED_PATTERNS` update (ban `getPrototypeOf`) | No such patterns in SandboxEngine.ts |
| Shell hygiene in EnvironmentCheckService | Needs manual verification |
| `.gitignore` auto-appended by `set_credentials` | Needs verification |

- **Verdict: Required.** Path traversal and sandbox escape protections are not optional — these
  are zero-trust security requirements per user rules. These should be done alongside TASK-29.

---

### TASK-32 — Config Mutations + Logic Bugs ⭐ P1
**Status: NOT IMPLEMENTED — Must Do**

| Sub-task | Evidence |
|---|---|
| Decouple version upgrades from `read()` | No `migrateIfNeeded()` in McpConfigService |
| Deep merge in `manage_config` write | No `deepMerge` — likely still using spread |
| Defer XML in `start_appium_session` | Relates to TASK-05 (already done) — needs verification |
| `id=` prefix in self-heal candidates | No guard in SelfHealingService |
| Try/catch in EnvironmentCheckService JSON block | Needs manual check |

- **Verdict: Required.** Config mutation-on-read (AUDIT-02) is a live bug. Deep merge for
  capabilities (AUDIT-01) is a data-integrity issue that can silently truncate user configs.

---

### TASK-33 — SessionManager Robustness ⭐ P1
**Status: NOT IMPLEMENTED — Must Do**

- No `getSessionHealthMetrics()` in `SessionManager.ts`
- No `hasRegisteredHandlers` static flag
- No `reconfigure()` mechanism
- **Verdict: Required.** The `MaxListenersExceededWarning` and singleton config-ignore are real
  bugs that appear in test runs and indicate memory leak risk.

---

### TASK-34 — LLM Navigation Tuning (Mermaid, Token Clipping) ⚠️ P2
**Status: NOT IMPLEMENTED — Should Do**

- No `exportMermaidDiagram()` in `NavigationGraphService.ts`
- No token estimator / truncation in `TestGenerationService`
- No step-format prompt improvements documented
- **Verdict: Should Do** — improves test generation accuracy but is not a crash risk. Lower
  priority than security and error handling work.

---

## Recommended Execution Order

```
Priority Wave 1 (Security + Stability):
  TASK-31 → Security Hardening (path traversal, sandbox)
  TASK-29 → Error Contract + safeExecute
  TASK-33 → SessionManager Robustness

Priority Wave 2 (Architecture + SDK):
  TASK-23 → SDK registerTool() migration  ← prerequisite for 24 & 25
  TASK-24 → Annotations + structuredContent
  TASK-25 → CHARACTER_LIMIT truncation
  TASK-32 → Config mutations + logic bugs

Priority Wave 3 (Polish + Observability):
  TASK-27 → Zod / God Object / Auto-learning / Glob fix
  TASK-28 → Analysis tool improvements
  TASK-30 → Logging + Tracing + Metrics
  TASK-34 → Navigation tuning + Mermaid

Priority Wave 4 (Quality Gate):
  TASK-26 → Evaluation harness (can defer until server is stable)
```

---

## Tasks Safe to Drop / Defer

| Task | Reason |
|---|---|
| TASK-26 | Evaluation harness is a quality-gate metric tool — not a live bug. Defer until other tasks are done. |

All others are genuinely unimplemented and cover real production gaps.
