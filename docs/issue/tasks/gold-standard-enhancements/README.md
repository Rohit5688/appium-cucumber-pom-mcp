# AppForge — Gold Standard Enhancement Tasks

Each file in this folder is a **self-contained task** for implementing the approved enhancements from the comprehensive analysis of Claude Code patterns, PageAgent optimizations, Anton resilience designs, and Graphify structural awareness.

**Context**: These tasks were derived from analyzing 17 research documents covering 60+ enhancement proposals. Only high-ROI, practical improvements that align with AppForge's mobile testing domain have been approved.

---

## How to Start a New Chat Session for Any Task

Paste this as your opening message in a new chat:

```
Read the task file at:
/Users/rsakhawalkar/forge/AppForge/docs/issue/tasks/gold-standard-enhancements/TASK-GS-XX-name.md

Follow the instructions exactly. Make only the changes described.
Run npm run build in /Users/rsakhawalkar/forge/AppForge after making changes.
Mark the task DONE when the build passes.
```

Replace `TASK-GS-XX-name` with the actual filename.

---

## Execution Order

Tasks are grouped by priority tier based on ROI, complexity, and dependencies.

### 🔴 TIER 0 — Foundation (Release Blockers — Do First)

**Critical for production reliability and evaluation readiness (TASK-46)**

| # | Task File | What It Implements | Files Changed | Effort |
|:--|:----------|:-------------------|:--------------|:-------|
| **GS-01** | `TASK-GS-01-tool-description-audit.md` | Audit and trim all tool descriptions to <2048 chars (MCP SDK requirement) | `src/index.ts` | Small |
| **GS-02** | `TASK-GS-02-file-state-tracker.md` | Implement FileStateTracker to prevent external changes causing regressions | `src/services/FileStateService.ts` (new), `src/services/FileWriterService.ts` | Medium |
| **GS-03** | `TASK-GS-03-fuzzy-string-matcher.md` | Add fuzzy quote/whitespace matching to file operations | `src/utils/StringMatcher.ts` (new), `src/services/FileWriterService.ts` | Small |
| **GS-04** | `TASK-GS-04-binary-file-guard.md` | Add 64KB sniff buffer to prevent reading binary files as text | `src/utils/FileGuard.ts` (new), `src/services/ExecutionService.ts` | Small |
| **GS-05** | `TASK-GS-05-error-taxonomy.md` | Consolidate 3 error files into unified system with semantic codes | `src/types/ErrorSystem.ts` (new), delete old error files | Medium |
| **GS-06** | `TASK-GS-06-retry-engine.md` | Implement exponential backoff retry for transient failures | `src/utils/RetryEngine.ts` (new) | Medium |
| **GS-07** | `TASK-GS-07-type-system-expansion.md` | Expand type system from 1 file to domain model | `src/types/*` (multiple new files) | Medium |
| **GS-08** | `TASK-GS-08-minimal-echoes.md` | Update tool prompts to prevent redundant LLM responses | `src/index.ts`, multiple tool descriptions | Small |

> ⚠️ **Dependencies**: GS-05 and GS-07 should be done first as they unlock other tasks. GS-01 is critical for evaluation harness.

---

### 🟡 TIER 1 — Token Optimization (Core Value — Massive Cost Savings)

**These deliver 50-60% token reduction and enable cheaper model usage**

| # | Task File | What It Implements | Files Changed | Effort |
|:--|:----------|:-------------------|:--------------|:-------|
| **GS-09** | `TASK-GS-09-sparse-action-map.md` | Create MobileSmartTreeService for 60% token reduction on XML | `src/services/MobileSmartTreeService.ts` (new), `src/services/ExecutionService.ts` | Large |
| **GS-10** | `TASK-GS-10-jit-os-skills.md` | Load android.md/ios.md only when platform-relevant files touched | `src/skills/android.md` (new), `src/skills/ios.md` (new), `src/index.ts` | Medium |
| **GS-11** | `TASK-GS-11-compact-boundaries.md` | Auto-collapse previous XML scans into semantic summaries | `src/services/ContextManager.ts` (new), `src/services/ExecutionService.ts` | Medium |
| **GS-12** | `TASK-GS-12-max-turns-guard.md` | Cap self-healing loops at 3 attempts to prevent infinite token burn | `src/services/SelfHealingService.ts` | Small |
| **GS-13** | `TASK-GS-13-token-budget-tracker.md` | Track and warn on token consumption per session | `src/services/TokenBudgetService.ts` (new), `src/index.ts` | Medium |

> ⚠️ **High Impact**: GS-09 (Sparse Action Map) is the single biggest token saver. Do this early in Tier 1.

---

### 🟠 TIER 2 — Intelligence & Observability (Production Polish)

**Debuggability, UX improvements, and structural awareness**

| # | Task File | What It Implements | Files Changed | Effort |
|:--|:----------|:-------------------|:--------------|:-------|
| **GS-14** | `TASK-GS-14-observability-service.md` | Structured JSONL logging with toolStart/toolEnd traces | `src/services/ObservabilityService.ts` (new), `src/index.ts` | Medium |
| **GS-15** | `TASK-GS-15-structural-brain.md` | Lightweight JSON map of god nodes for pre-flight warnings | `src/services/StructuralBrainService.ts` (new), `src/index.ts` | Medium |
| **GS-16** | `TASK-GS-16-multi-choice-questions.md` | Structured clarification with option tables for conflicts | `src/tools/request_user_clarification.ts` | Small |
| **GS-17** | `TASK-GS-17-pre-flight-checks.md` | Verify Appium readiness before allowing tool execution | `src/services/PreFlightService.ts` (new), `src/index.ts` | Small |
| **GS-18** | `TASK-GS-18-similar-file-suggestions.md` | "Did you mean?" for ENOENT errors with extension mismatches | `src/utils/FileSuggester.ts` (new), error handlers | Small |

> ⚠️ **Dependencies**: GS-14 (Observability) should be done early for debugging other Tier 2 tasks.

---

### 🟢 TIER 3 — Conditional Enhancements (Data-Driven Decision)

**Implement only if usage data proves the need**

| # | Task File | What It Implements | Files Changed | Effort |
|:--|:----------|:-------------------|:--------------|:-------|
| **GS-19** | `TASK-GS-19-local-healer-cache.md` | SQLite cache for repeated locator fixes (70% latency reduction) | `src/services/HealerCacheService.ts` (new) | Medium |
| **GS-20** | `TASK-GS-20-neighbor-context.md` | Store neighbor elements for robust healing when IDs change | `src/services/NeighborContextService.ts` (new) | Medium |
| **GS-21** | `TASK-GS-21-observer-fork.md` | Background status updates during long operations | `src/services/ObserverService.ts` (new) | Medium |

> ⚠️ **Decision Point**: Evaluate healing failure rates after Tier 2. If >20% failure rate, implement GS-19 and GS-20.

---

### 🔵 TIER 4 — Advanced Optimization (Optional — After Validation)

**Lower priority optimizations and cost controls**

| # | Task File | What It Implements | Files Changed | Effort |
|:--|:----------|:-------------------|:--------------|:-------|
| **GS-22** | `TASK-GS-22-shell-security-core.md` | Port core bash security validators (not full 2500-line engine) | `src/utils/ShellSecurityEngine.ts` (new) | Medium |
| **GS-23** | `TASK-GS-23-agent-routing.md` | Multi-model routing (Haiku/Sonnet/Opus by task complexity) | `src/services/AgentRoutingService.ts` (new) | Small |
| **GS-24** | `TASK-GS-24-scratchpad-memory.md` | Shared .agent_scratchpad for cross-worker knowledge | `src/services/ScratchpadService.ts` (new) | Small |

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

## Expected Outcomes After Tier 0-2 Completion

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
5. **Check dependencies** — some tasks must be done in order

---

## Project Info

- **Root**: `/Users/rsakhawalkar/forge/AppForge`
- **Build**: `npm run build`
- **Key files**: `src/index.ts`, `src/services/ExecutionService.ts`, `src/services/SelfHealingService.ts`, `src/types/Response.ts`