# TASK-47 — Wire SessionManager into Index and Tool Architecture

**Status**: DONE
**Effort**: Medium (~1-2 hours)
**Depends on**: None
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

In a previous hardening wave (TASK-33), `SessionManager.ts` was thoroughly fortified with singleton lifecycle guards, health metrics, and idle cleanup timers to prevent memory leaks and zombie Appium processes. However, `src/index.ts` was never refactored to actually *use* it. The MCP Server currently bypasses `SessionManager` and directly instantiates `private appiumSessionService = new AppiumSessionService()`, sharing a single raw instance across all tool calls.

This creates a high-risk liability for autonomous AI usage:
1. **Multi-Project Collisions**: LLM tools cannot handle multiple project directories simultaneously without overwriting connection caps.
2. **Zombie Connections**: Without `SessionManager`'s idle timer, abandoned Webdriver instances hang indefinitely.
3. **Race Conditions**: Parallel LLM tool executions can spam competing "start session" demands and crash the server.

---

## What to Change

### Phase 1: Re-wire `index.ts` Dependency Injection
**Location:** `src/index.ts`
- Remove the global statically initialized property: `private appiumSessionService = new AppiumSessionService();`
- Import `SessionManager` and store its reference: `private sessionManager = SessionManager.getInstance();`
- **Correction**: Since the dependencies for `ExecutionService` and `SelfHealingService` shift from a static `AppiumSessionService` instance to a pool/manager pattern, rewrite the constructor DI to inject the `SessionManager` instance into these services.

### Phase 2: Refactor Downstream Services to Request Sessions Dynamically
**Location:** `src/services/ExecutionService.ts` and `src/services/SelfHealingService.ts`
- Modify their internal state to hold a reference to `SessionManager` instead of `AppiumSessionService`.
- Inside methods that require an active device session (e.g., executing mobile hooks, self-healing an element), invoke `await this.sessionManager.getSession(projectRoot)` dynamically.
- Gracefully handle cases where the session might not exist (throw structured `AppForgeError` advising the agent to start a session).

### Phase 3: Wire up Health Endpoint Metrics
**Location:** `src/index.ts` (Tool Registration)
- Now that `SessionManager` is managing real traffic, its telemetry is highly valuable for debugging. Introduce an MCP tool or diagnostic feature that exposes `sessionManager.getSessionHealthMetrics()` to the LLM agent.

---

## Done Criteria
- [x] `npm run build` passes with zero errors.
- [x] `AppiumSessionService` is completely removed from static instantiation at the root of `index.ts`.
- [x] `ExecutionService` and `SelfHealingService` seamlessly retrieve project-scoped Appium connections dynamically via `SessionManager`.
- [x] Health metric telemetry is actively accessible or logged.
- [x] Change `Status` above to `DONE`.
