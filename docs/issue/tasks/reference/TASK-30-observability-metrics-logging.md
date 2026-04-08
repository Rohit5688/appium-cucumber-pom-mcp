# TASK-30 — Structured Logging, Tracing, and Performance Metrics

**Status**: TODO  
**Effort**: Medium (~2 hours)  
**Depends on**: TASK-29 (Error Contracts)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `AI_DELIVERABLE_CHUNKS.md` Phase 5, moving away from standard `console.log` strings into a systematic Observability suite is critical for QA debugging. Future ecosystem endpoints will demand trace headers to map Appium Session lifecycles cross-platform.

1. **Structured JSON Logging**: Standard strings offer poor observability to vector-sinks. Logs need severity thresholds (DEBUG, INFO, ERROR), PII-scrubbers, and rigid schema formats.
2. **Request Tracing**: `RequestTracer` to inject `x-request-id` parameters down the execution stack so LLM requests can be tied to underlying web-driver command execution timelines.
3. **Tool Performance Metrics**: Keep track of success rates and timeout frequencies for distinct tools (e.g., `audit_mobile_locators` durations vs `inspect_ui_hierarchy` timeouts).

---

## What to Change

### Phase 1: Create the Logger Class
**Location:** `src/utils/Logger.ts`
- Replace primitive `console.log` output with a standardized robust internal JSON Logger that attaches timestamp attributes and redacts `.env` secret variables automatically.

### Phase 2: Add Request Tracer Middleware
**Location:** `src/utils/RequestTracer.ts`
- Create a tracing service that assigns a unique UUID to every incoming MCP protocol request, attaching it to both the outgoing Logger format and error payloads via passing Context parameters downwards or leveraging async hooks.

### Phase 3: Setup Application Metrics
**Location:** `src/utils/Metrics.ts`
- Instantiate a simple aggregated registry (e.g., `SingletonMetrics`) storing:
  - Tool Invokes / Tool Failures counts.
  - Sub-process average duration thresholds.
- Trigger a console dump of these metrics upon `GracefulShutdown` (SIGTERM/SIGINT) of the server.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors.
- [ ] PII arguments inside tests/production are accurately redacted via Logger rules.
- [ ] Request Tracing headers apply continuously through tool cascades.
- [ ] Process shutdown yields an aggregation map of tool usage performance.
- [ ] Change `Status` above to `DONE`.
