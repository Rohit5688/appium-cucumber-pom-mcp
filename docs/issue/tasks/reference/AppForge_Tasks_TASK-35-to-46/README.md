# AppForge — Implementation Task Queue

Each file in this folder is a **self-contained task** for a single fresh chat session.
A new AI session needs ONLY the task file + the source files listed inside it.
**No prior conversation history required.**

---

## How to Start a New Chat Session for Any Task

Paste this as your opening message in a new chat:

```
Read the task file at:
c:\Users\Rohit\mcp\AppForge\docs\issue\tasks\TASK-XX-name.md

Follow the instructions exactly. Make only the changes described.
Run npm run build in c:\Users\Rohit\mcp\AppForge after making changes.
Mark the task DONE when the build passes.
```

Replace `TASK-XX-name` with the actual filename.

---

## Overall Progress

| Wave | Tasks | Status |
|------|-------|--------|
| ✅ Wave 0 — Live Session Redesign | TASK-01 to TASK-08 | **ALL DONE** |
| ✅ Wave 1 — Security + High-Priority Bugs | TASK-09 to TASK-22 | **ALL DONE** |
| ✅ Wave 1b — Error Contracts, Security Patches, SessionManager | TASK-29, TASK-31, TASK-33 | **ALL DONE** |
| 🔄 Wave 2 — Architecture + SDK | TASK-35 to TASK-40 | **IN PROGRESS** |
| ⏳ Wave 3 — Polish + Observability | TASK-41 to TASK-45 | TODO |
| ⏳ Wave 4 — Quality Gate | TASK-46 | TODO |

**Current readiness score: 6.8 / 10**
**Target after Wave 2: ~8.5 / 10**
**Target after all waves: ~9.5 / 10**

---

## Execution Order

Tasks must be done **in the order listed within each wave**.
Do not skip ahead — each task may depend on the previous.

---

### ✅ WAVE 0 — Live Session Redesign (DONE)

| # | Task File | What It Fixed |
|:--|:----------|:--------------|
| 1 | `TASK-01-snapshot-engine.md` | XML → compact accessibility snapshot (50k → 150 tokens) |
| 2 | `TASK-02-snapshot-schema.md` | Updated tool schema + DO NOT CALL guards |
| 3 | `TASK-03-step-hints-filter.md` | Native on-device query via step keywords |
| 4 | `TASK-04-known-screen-map.md` | Known screen injection into generation prompt |
| 5 | `TASK-05-slim-session-start.md` | Remove wasted XML on session start |
| 6 | `TASK-06-xml-cache-selfheal.md` | XML cache for self_heal_test when session dies |
| 7 | `TASK-07-workflow-recovery.md` | Recovery branches in workflow_guide |
| 8 | `TASK-08-environment-apk-check.md` | APK ABI compatibility check |

---

### ✅ WAVE 1 — Security + High-Priority Bugs (DONE)

| # | Task File | What It Fixed | Files |
|:--|:----------|:--------------|:------|
| 9 | `TASK-09-sandbox-security.md` | Sandbox path traversal + prototype escape | `SandboxEngine.ts`, `index.ts` |
| 10 | `TASK-10-env-service-shell-fix.md` | `exec(string)` → `execFile` in EnvironmentCheck | `EnvironmentCheckService.ts` |
| 11 | `TASK-11-config-deep-merge.md` | Shallow merge bug in manage_config | `McpConfigService.ts` |
| 12 | `TASK-12-config-read-sideeffects.md` | read() was mutating disk on every call | `McpConfigService.ts` |
| 13 | `TASK-13-ios-questioner-fix.md` | iOS bundleId clarification loop | `AppiumSessionService.ts` |
| 14 | `TASK-14-ci-workflow-and-selfheal-fix.md` | CI projectRoot guard + self_heal id= prefix | `index.ts`, `SelfHealingService.ts` |
| 15 | `TASK-15-credential-service-fixes.md` | getUser.ts wrong dir + .gitignore guard | `CredentialService.ts` |
| 16 | `TASK-16-staging-tsconfig-and-duration.md` | Absolute paths in tsconfig + duration threshold | `FileWriterService.ts`, `SummarySuiteService.ts` |
| 17 | `TASK-17-dynamic-environments.md` | User-configurable environments (not hardcoded staging/prod) | Multiple |
| 18 | `TASK-18-config-schema-expansion.md` | Added timeouts/reporter/selfHeal to mcp-config.json | `McpConfigService.ts`, `ProjectSetupService.ts` |
| 19 | `TASK-19-codegen-config-propagation.md` | Wire codegen preferences into generation prompt | `TestGenerationService.ts`, `index.ts` |
| 20 | `TASK-20-timeout-selfheal-reporting-config.md` | Wire timeouts/retries from config not hardcoded | Multiple |
| 21 | `TASK-21-two-phase-setup.md` | setup_project: template first, config-guided scaffolding second | `ProjectSetupService.ts`, `index.ts` |
| 22 | `TASK-22-upgrade-incremental.md` | upgrade_project: incremental config sync | `ProjectSetupService.ts`, `index.ts` |

---

### ✅ WAVE 1b — Error Contracts, Security, SessionManager (DONE)

| # | Task File | What It Fixed |
|:--|:----------|:--------------|
| 29 | `TASK-29-error-contract-and-versioning.md` | Unified error factory, safeExecute, CHANGELOG, version.ts |
| 31 | `TASK-31-security-and-sandbox-patches.md` | Path traversal, sandbox escapes, .gitignore on set_credentials |
| 33 | `TASK-33-sessionmanager-robustness.md` | Singleton lifecycle, config guards, health metrics |

---

### 🔄 WAVE 2 — Architecture + SDK (DO IN ORDER)

> ⚠️ TASK-36, 37, 38 must be done in sequence — each depends on the previous.
> TASK-35 and TASK-40 are standalone and can run in parallel with the SDK migration.

| # | Task File | What It Does | Files | Effort |
|:--|:----------|:-------------|:------|:-------|
| **35** | `TASK-35-character-limit-truncation.md` | Add 25k char ceiling to 5 large-output tools | `index.ts` | Small |
| **36** | `TASK-36-sdk-migration-part1-tools-1-11.md` | Migrate tools 1–11 to `registerTool()` | `index.ts` | Medium |
| **37** | `TASK-37-sdk-migration-part2-tools-12-22.md` | Migrate tools 12–22 to `registerTool()` | `index.ts` | Medium |
| **38** | `TASK-38-sdk-migration-part3-tools-23-31-cleanup.md` | Migrate tools 23–31 + remove old handlers | `index.ts` | Medium |
| **39** | `TASK-39-structured-content-8-tools.md` | Add `structuredContent` to 8 JSON-returning tools | `index.ts` | Small |
| **40** | `TASK-40-config-mutations-logic-bugs.md` | 6 logic bugs: config read, run crash, id= prefix, JSON parse | Multiple | Medium |

> ⚠️ TASK-35 can be done first (standalone).
> ⚠️ TASK-36 → 37 → 38 must be done in order.
> ⚠️ TASK-39 depends on TASK-38 being DONE.
> ⚠️ TASK-40 is standalone — can run alongside SDK migration in a separate session.
Done till this
**After Wave 2: estimated score 8.5 / 10**

---

### ⏳ WAVE 3 — Polish + Observability (DO AFTER WAVE 2)
Verify first phase 47 changes were they needed and done correctly or not
| # | Task File | What It Does | Files | Effort |
|:--|:----------|:-------------|:------|:-------|
| **41** | `TASK-41-glob-fix-zod-autolearning.md` | YAML glob exclusions + auto-learning wiring + UTF-8 fix | `TestGenerationService.ts`, `index.ts` | Medium |
| **42** | `TASK-42-god-object-refactor-src-tools.md` | Split index.ts into `src/tools/` (31 files) | `index.ts`, new `src/tools/` | Large |
| **43** | `TASK-43-analysis-tool-improvements.md` | YAML locator audit + util checklist + CI generator fix | `AuditLocatorService.ts`, `UtilAuditService.ts`, `CiWorkflowService.ts` | Medium |
| **44** | `TASK-44-structured-logging-tracing-metrics.md` | Logger, RequestTracer, Metrics utility classes | New `src/utils/` files | Medium |
| **45** | `TASK-45-navigation-tuning-mermaid.md` | Token clipping + Mermaid export + step reuse prompts | `NavigationGraphService.ts`, `TestGenerationService.ts` | Medium |

> ⚠️ TASK-41 depends on TASK-38 (registerTool pattern).
> ⚠️ TASK-42 depends on TASK-38 AND TASK-41 (do after both).
> ⚠️ TASK-43, 44, 45 are standalone within Wave 3.

**After Wave 3: estimated score 9.2 / 10**

---

### ⏳ WAVE 4 — Quality Gate (DO LAST)

| # | Task File | What It Does | Effort |
|:--|:----------|:-------------|:-------|
| **46** | `TASK-46-evaluation-harness.md` | 10 verified QA pairs + baseline accuracy run ≥ 70% | Medium |

> ⚠️ Do not run TASK-46 until all Wave 2 tasks are DONE.
> The evaluation score is your release gate — ≥ 70% = ready for org adoption.

**After Wave 4: production ready**

---

## What Each Task Fixes (User-Facing Impact)

| Task | Problem Fixed | Impact |
|------|---------------|--------|
| 35 | No output size ceiling — tools could flood LLM context | Prevents silent hallucinations on complex screens |
| 36–38 | Deprecated `setRequestHandler` pattern — blocks SDK upgrades | Enables annotations, structuredContent, future SDK compat |
| 39 | Tools return JSON-as-string — clients must parse manually | MCP clients can now read tool results programmatically |
| 40 | run_cucumber_test crashes, config mutates on read, wrong id= prefix | Core test execution and config reliability |
| 41 | YAML glob sweeps .venv — prompts full of garbage data | Generation prompts clean and relevant |
| 42 | 1300-line God Object — impossible to navigate | Codebase becomes maintainable by contributors |
| 43 | audit_mobile_locators returns 0 on real projects | Locator health check finally works |
| 44 | console.log everywhere — no visibility into failures | Structured logs make debugging possible |
| 45 | Navigation context unbounded + weak step reuse prompts | Better multi-screen test generation |
| 46 | No way to measure if AppForge works end-to-end | Objective quality gate before org rollout |

---

## Rules for Each Task Session

1. **Read the full task file first** before touching any code
2. **grep or view** only the specific lines mentioned — do not read entire files unnecessarily
3. **Make ONLY the changes described** — nothing extra
4. Run `npm run build` in `c:\Users\Rohit\mcp\AppForge` after each task
5. Mark `Status: TODO` → `Status: DONE` in the task file when complete
6. **Do not combine tasks** — one task per chat session

---

## Project Info

- **Root**: `c:\Users\Rohit\mcp\AppForge`
- **Build**: `npm run build`
- **Key files**: `src/index.ts`, `src/services/`, `src/utils/`
- **New files (Wave 3)**: `src/tools/` (31 files), `src/utils/Logger.ts`, `src/utils/RequestTracer.ts`, `src/utils/Metrics.ts`
