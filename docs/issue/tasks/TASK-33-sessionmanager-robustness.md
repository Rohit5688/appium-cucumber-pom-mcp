# TASK-33 — SessionManager Robustness & Health Metrics

**Status**: DONE  
**Effort**: Low (~1 hour)  
**Depends on**: None  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `code_review_session_navigation_improvements.md` (P1/P3 constraints), the `SessionManager` has several lingering initialization vulnerabilities and lacks observability endpoints for tracking active connections.

1. **Singleton Configuration Leaks**: Calling `SessionManager.getInstance(config)` ignores the new config if instances already exist.
2. **Config Validation**: Setting random limits (e.g., negative idle time or memory) is not prevented.
3. **Health Metrics**: We lack insight into the age, count, and failure ratios of currently managed cached sessions.

---

## What to Change

### Phase 1: Singleton Lifecycle Fix
**Location:** `src/services/SessionManager.ts`
- Modify `getInstance(config)` to either check and warn if config diverges, or provide a `reconfigure()` mechanism so runtime tests can correctly update TTL/idle times on existing Singletons.

### Phase 2: Instantiation Guards
**Location**: `src/services/SessionManager.ts`
- Inside the constructor or configured payload, add guards: `maxIdleTimeMs` must be >= 1000, `maxMemoryMB` must be >= 10. `throw new Error()` for invalid boundary numbers.

### Phase 3: Health Metrics Payload
**Location**: `src/services/SessionManager.ts`
- Add a new method `public getSessionHealthMetrics()` that returns aggregate statistics: `totalSessions`, `activeSessions`, `failedSessions`, `averageSessionAge`, and `oldestSession` (via traversing `this.sessions`).

---

## Done Criteria
- [x] `npm run build` passes with zero errors.
- [x] Reconfiguring Singleton configs issues a proper console warning or updates successfully.
- [x] `getSessionHealthMetrics` properly iterates session tracking objects to produce metric analytics.
- [x] Change `Status` above to `DONE`.
