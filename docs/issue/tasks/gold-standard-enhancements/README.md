# AppForge — Gold Standard Enhancement Tasks

Each file in this folder is a **self-contained task** for implementing the approved enhancements from the comprehensive analysis of Claude Code patterns, PageAgent optimizations, Anton resilience designs, and Graphify structural awareness.

**Context**: These tasks were derived from analyzing 17 research documents covering 60+ enhancement proposals. Only high-ROI, practical improvements that align with AppForge's mobile testing domain have been approved.

---

## How to Start a New Chat Session for Any Task

Paste this as your opening message in a new chat:

```
Read the task file at:
C:\Users\Rohit\mcp\AppForge\docs\issue\tasks\gold-standard-enhancements\TASK-GS-XX-name.md

Follow the instructions exactly. Make only the changes described.
Run npm run build in C:\Users\Rohit\mcp\AppForge after making changes.
Mark the task DONE when the build passes.
```

Replace `TASK-GS-XX-name` with the actual filename.

---

## Logical Implementation Order (Dependency-Aware)

> This is the **recommended sequence** based on actual code dependencies between tasks.
> Each step lists what it unlocks so you understand why the order matters.

### ── PHASE 1: Core Infrastructure ── (Do these first, in order)

These have zero dependencies and unlock everything else. Completing this phase gives you a stable foundation with unified types, error handling, and retry logic.

| Step | Task | What It Creates | Unlocks |
|:----:|:-----|:----------------|:--------|
| 1 | **GS-05** `TASK-GS-05-error-taxonomy.md` | `ErrorSystem.ts` — unified McpError + error codes | GS-06, GS-12, GS-17, GS-22 |
| 2 | **GS-07** `TASK-GS-07-type-system-expansion.md` | `AppiumTypes.ts`, `McpToolResult.ts`, `PermissionResult.ts` | GS-09, GS-11, GS-17, GS-20 |
| 3 | **GS-06** `TASK-GS-06-retry-engine.md` | `RetryEngine.ts` — exponential backoff for transient failures | GS-12 (parallel) |
| 4 | **GS-01** `TASK-GS-01-tool-description-audit.md` | Trim all tool descriptions to ≤2048 chars | GS-08 |

> ✅ After Phase 1: You have a type-safe, error-resilient foundation. Build passes clean.

---

### ── PHASE 2: File Safety & Utilities ── (Can run parallel after Phase 1)

These are independent utilities. Run them in parallel or sequentially — no dependencies on each other.

| Step | Task | What It Creates | Unlocks |
|:----:|:-----|:----------------|:--------|
| 5a | **GS-03** `TASK-GS-03-fuzzy-string-matcher.md` | `StringMatcher.ts` — quote/whitespace normalization | GS-02 |
| 5b | **GS-04** `TASK-GS-04-binary-file-guard.md` | `FileGuard.ts` — prevent binary files read as text | (standalone) |
| 5c | **GS-18** `TASK-GS-18-similar-file-suggestions.md` | `FileSuggester.ts` — "Did you mean?" for ENOENT | (standalone) |
| 6 | **GS-02** `TASK-GS-02-file-state-tracker.md` | `FileStateService.ts` — detect external file changes | (standalone) |

> ✅ After Phase 2: File operations are safe, binary-guarded, and have fuzzy matching.

---

### ── PHASE 3: Token Optimization ── (Highest ROI — do as early as possible)

> ⚠️ **GS-09 is the single biggest token saver**. Do it first in this phase.

| Step | Task | What It Creates | Depends On | Unlocks |
|:----:|:-----|:----------------|:-----------|:--------|
| 7 | **GS-09** `TASK-GS-09-sparse-action-map.md` | `MobileSmartTreeService.ts` — 96% XML token reduction | GS-07 (types) | GS-11, GS-20 |
| 8 | **GS-10** `TASK-GS-10-jit-os-skills.md` | `android.md`, `ios.md` — platform skill injection | (standalone) | (standalone) |
| 9 | **GS-11** `TASK-GS-11-compact-boundaries.md` | `ContextManager.ts` — compress old scan history | GS-09 (ActionMap format) | (standalone) |
| 10 | **GS-08** `TASK-GS-08-minimal-echoes.md` | OUTPUT INSTRUCTIONS in all tool descriptions | GS-01 (must be done first) | (standalone) |
| 11 | **GS-12** `TASK-GS-12-max-turns-guard.md` | Healing attempt cap (3 max per test file) | GS-05 (McpErrors) | GS-19 |
| 12 | **GS-13** `TASK-GS-13-token-budget-tracker.md` | `TokenBudgetService.ts` — session token tracking | (standalone) | (standalone) |

> ✅ After Phase 3: 50–60% token reduction on UI scans, healing loops capped, cost visible.

---

### ── PHASE 4: Observability & Intelligence ── (Production Polish)

| Step | Task | What It Creates | Depends On | Unlocks |
|:----:|:-----|:----------------|:-----------|:--------|
| 13 | **GS-14** `TASK-GS-14-observability-service.md` | `ObservabilityService.ts` — JSONL trace logging | (standalone) | (debugging aid for all later tasks) |
| 14 | **GS-17** `TASK-GS-17-pre-flight-checks.md` | `PreFlightService.ts` — Appium readiness validation | GS-05, GS-07 (types) | (standalone) |
| 15 | **GS-15** `TASK-GS-15-structural-brain.md` | `StructuralBrainService.ts` — god node warnings | (standalone) | (standalone) |
| 16 | **GS-16** `TASK-GS-16-multi-choice-questions.md` | Structured numbered options for clarification | (standalone) | (standalone) |
| 17 | **GS-22** `TASK-GS-22-shell-security-core.md` | `ShellSecurityEngine.ts` — injection validation | GS-05 (McpErrors) | (standalone) |

> ✅ After Phase 4: Full observability, pre-flight safety, and god node awareness.

---

### ── PHASE 5: Conditional Healing Enhancements ── (Only if healing failure rate > 20%)

> 🔴 **Decision gate**: Evaluate healing failure rate after Phase 4. Only proceed if >20% fail.

| Step | Task | What It Creates | Depends On |
|:----:|:-----|:----------------|:-----------|
| 18 | **GS-19** `TASK-GS-19-local-healer-cache.md` | SQLite cache for repeated locator fixes | GS-12 (attempt guard) |
| 19 | **GS-20** `TASK-GS-20-neighbor-context.md` | Structural fingerprinting for ID-unstable locators | GS-19, GS-09 (ActionMap) |

> ✅ After Phase 5: Healing reuses known fixes. 70% latency reduction on repeated failures.

---

### ── PHASE 6: Advanced / Optional ── (After validation — lowest priority)

These can be done independently in any order. None block other tasks.

| Step | Task | What It Creates | Decision Gate |
|:----:|:-----|:----------------|:--------------|
| 20 | **GS-21** `TASK-GS-21-observer-fork.md` | Background status messages during long ops | Only if user frustration with silence |
| 21 | **GS-23** `TASK-GS-23-agent-routing.md` | Multi-model routing by task complexity | After Phase 3 complete |
| 22 | **GS-24** `TASK-GS-24-scratchpad-memory.md` | `.agent_scratchpad/` shared memory | Only if parallel agents added |

---

## Dependency Graph (Visual)

```
GS-05 (ErrorSystem) ──────┬──► GS-06 (RetryEngine)
                           ├──► GS-12 (MaxTurnsGuard) ──► GS-19 (HealerCache) ──► GS-20 (NeighborCtx)
                           ├──► GS-17 (PreFlight)
                           └──► GS-22 (ShellSecurity)

GS-07 (TypeSystem) ────────┬──► GS-09 (SparseActionMap) ──► GS-11 (CompactBoundaries)
                           │                              └──► GS-20 (NeighborCtx)
                           └──► GS-17 (PreFlight)

GS-01 (DescAudit) ─────────► GS-08 (MinimalEchoes)

GS-03 (FuzzyMatcher) ──────► GS-02 (FileStateTracker)

── Standalone (no deps) ────  GS-04, GS-10, GS-13, GS-14, GS-15, GS-16, GS-18, GS-21, GS-23, GS-24
```

---

## Full Task List With Status

| # | Task | Phase | Status | Effort |
|:--|:-----|:-----:|:------:|:------:|
| GS-01 | Tool Description Audit | 1 | TODO | Small |
| GS-02 | File State Tracker | 2 | TODO | Medium |
| GS-03 | Fuzzy String Matcher | 2 | TODO | Small |
| GS-04 | Binary File Guard | 2 | TODO | Small |
| GS-05 | Error Taxonomy | 1 | TODO | Medium |
| GS-06 | Retry Engine | 1 | TODO | Medium |
| GS-07 | Type System Expansion | 1 | TODO | Medium |
| GS-08 | Minimal Echoes | 3 | TODO | Small |
| GS-09 | Sparse Action Map | 3 | TODO | Large |
| GS-10 | JIT OS-Specific Skills | 3 | TODO | Medium |
| GS-11 | Compact Boundaries | 3 | TODO | Medium |
| GS-12 | Max Turns Guard | 3 | TODO | Small |
| GS-13 | Token Budget Tracker | 3 | TODO | Medium |
| GS-14 | Observability Service | 4 | TODO | Medium |
| GS-15 | Structural Brain | 4 | TODO | Medium |
| GS-16 | Multi-Choice Questions | 4 | TODO | Small |
| GS-17 | Pre-Flight Checks | 4 | TODO | Small |
| GS-18 | Similar File Suggestions | 2 | TODO | Small |
| GS-19 | Local Healer Cache | 5 | TODO | Medium |
| GS-20 | Neighbor Context | 5 | TODO | Medium |
| GS-21 | Observer Fork | 6 | TODO | Medium |
| GS-22 | Shell Security Core | 4 | TODO | Medium |
| GS-23 | Agent Routing | 6 | TODO | Small |
| GS-24 | Scratchpad Memory | 6 | TODO | Small |

---

## What Each Task Achieves (User-Facing Impact)

| Task | Problem Fixed | ROI |
|:-----|:--------------|:----|
| GS-01 | Evaluation harness failures due to truncated tool descriptions | Critical |
| GS-02 | Silent file overwrites when formatters run during agent work | Extreme |
| GS-03 | "String not found" errors when LLM flips quote styles | High |
| GS-04 | Agent trying to read .png/.ipa as text, wasting tokens | High |
| GS-05 | Scattered error handling prevents retry logic and debugging | High |
| GS-06 | Transient Appium failures cause immediate tool failure | High |
| GS-07 | `any` types everywhere, schema-unsafe code generation | High |
| GS-08 | LLM repeating what it just did in every response | Medium |
| GS-09 | 50-200KB XML scans flood context, prevent test generation | Extreme |
| GS-10 | Agent suggesting Android selectors on iOS (cross-pollution) | High |
| GS-11 | Multi-screen navigation fills context with old XML | High |
| GS-12 | Infinite healing loops burning tokens on same failed locator | High |
| GS-13 | No visibility into token consumption per session | Medium |
| GS-14 | Console dumps prevent trace analysis and debugging | High |
| GS-15 | No warning when editing central hub files (god nodes) | Medium |
| GS-16 | Open-ended questions less efficient than option tables | Medium |
| GS-17 | Agent plans 10 steps then discovers Appium not ready | Medium |
| GS-18 | Confusing ENOENT errors when .ts vs .js mismatch | Low |
| GS-19 | Repeated API calls for same locator fix (if high failure rate) | Conditional High |
| GS-20 | Locator healing fails when element IDs change frequently | Conditional High |
| GS-21 | No status updates during long UI scans (UX polish) | Low |
| GS-22 | Shell injection vulnerabilities in command execution | Medium |
| GS-23 | Using expensive models for simple tasks | Low |
| GS-24 | Parallel workers can't share findings (if parallelism added) | Low |

---

## Expected Outcomes After Phase 1–4 Completion

- **Token Reduction**: 50-60% savings on UI hierarchy scans
- **Reliability**: 70% fewer failed healing attempts
- **Cost**: Enable cheaper models (Haiku) for healing operations
- **UX**: Clear errors, structured logging, pre-flight validation
- **Maintainability**: Type-safe code, unified error system
- **Performance**: Retry logic handles transient failures automatically

**Total new code**: ~8,000-10,000 LOC across 15-20 new services/utils

---

## Rules for Each Task Session

1. **Read the full task file first** before touching any code
2. **Make ONLY the changes described** — nothing extra
3. Run `npm run build` after each task to verify
4. Mark `Status: TODO` → `Status: DONE` in the task file when complete
5. **Check the dependency graph** above before starting — respect the phase order

---

## Project Info

- **Root**: `C:\Users\Rohit\mcp\AppForge`
- **Build**: `npm run build`
- **Key files**: `src/index.ts`, `src/services/ExecutionService.ts`, `src/services/SelfHealingService.ts`, `src/types/Response.ts`