# Multi-Tenant Iterative Test Plan (5 Parallel Users)

This plan defines the iterative cycles for validating the Enterprise Multi-Tenant Architecture. It focuses on isolating issues, fixing regressions, and verifying system saturation points.

## 1. Test Infrastructure

- **Provider**: Oracle Cloud (OCI) Always Free.
- **Spec**: 4 OCPUs, 24 GB RAM (A1 Ampere).
- **Endpoint**: Stateless HTTP on Port 3100 (TestForge) / 3101 (AppForge).

## 2. Iteration Cycle Workflow

Each test phase follows this 4-step loop:

1. **Execute**: Run the 5-user parallel test suite.
2. **Observe**: Analyze logs for `tenantId` leakage and monitor system CPU/RAM saturation.
3. **Patch**: Apply fixes for identified scripting errors or resource bottlenecks.
4. **Verify**: Retest the specific failed scenario to confirm recovery.

## 3. Test Phases & Scenarios

### Cycle 1: Baseline Concurrency & Connectivity

- **Goal**: Can 5 users connect and run simple tools simultaneously?
- **Scenario**: 5 users call `list_tools` and `read_file` at the exact same time.
- **Success Fix**: Ensure the `StreamableHTTPServerTransport` doesn't drop connections under burst load.

### Cycle 2: Data Isolation & "Red-Teaming"

- **Goal**: Zero visibility between tenants.
- **Scenario**:
  - User A "trains" the AI on a local fix.
  - User B performs a similar task.
  - **Verification**: Ensure User B _cannot_ see User A's private training until it is officially promoted to the Global Brain.
- **Success Fix**: Partitioned filesystem paths in `FileWriterService` are verified.

### Cycle 3: "Noisy Neighbor" Stress Test

- **Goal**: Resource governance.
- **Scenario**:
  - 4 Users run heavy Playwright/Appium sessions.
  - User 5 attempts to start a massive 100-page crawl.
  - **Verification**: User 5 should be throttled/queued by the concurrency semaphore, preserving performance for the first 4 users.

### Cycle 4: The Knowledge Flywheel (Synchronization)

- **Goal**: Collaborative intelligence scaling.
- **Scenario**:
  - User A discovers a fix for a new framework version.
  - The Sync Service promotes it to the Global Brain.
  - **Verification**: Remaining users (B-E) should immediately benefit from this fix in their next re-run.

### Cycle 5: Resilience & Crash Recovery

- **Goal**: Persistence integrity.
- **Scenario**: Kill the MCP server process during an active 5-user training session.
- **Verification**: on restart, verify the **Write-Ahead Log (WAL)** restores the knowledge base without corruption.

## 4. Telemetry & Success Metrics

- **Context Leakage**: 0 instances of User A's data appearing in User B's response.
- **Event Loop Lag**: Maintain < 100ms lag during 5-user automation bursts.
- **Recovery Time**: < 5 seconds for the state to restore after a crash.
- **Disk Usage**: Consistent partitioning under the `tenants/` directory.
