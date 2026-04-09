# Research Results: Claude Code Pattern Study (Phase 7)

Detailed findings from exploring the **Real-Time Observer** in Claude Code.

---

## 🏗️ Technical Finding: The "Observer Fork" Pattern
**Source**: `agentSummary.ts` (Line 1-181)

Claude Code provides real-time "thinking" feedback for background tasks avoiding UI clutter and without any extra token overhead.

### 1. Periodic Background Summarization
*   **Pattern**: Forks the sub-agent's conversation every 30 seconds (`SUMMARY_INTERVAL_MS`).
*   **The Logic**: Sends a minimal 1-2 sentence prompt to the forked agent asking for a summary of current work in 3-5 words using present tense.
*   **The Goal**: Produces live status like *"Fixing null check in validate.ts"* instead of a static "Processing..." spinner.
*   **AppForge Opportunity**: Implement this for "Self-Healing." Show the user exactly which locator strategy the agent is exploring: *"Scanning Android DOM"*, *"Analyzing Accessibility ID"*, *"Proposing XPath fix"*.

---

## 🛠️ Performance Pattern: Cache-Safe Background Turns
**Source**: `agentSummary.ts` (Line 100-109)

### 1. Identity Verification for Cache Hits
*   **Pattern**: Uses identical `CacheSafeParams` (system, tools, model, thinking config) as the parent agent.
*   **The "Trick"**: Keeps the tools in the request (to maintain the cache key) but denies their execution via a `canUseTool` callback (Line 94).
*   **The Benefit**: Zero token cost for the background "thought" turn because it reuse the parent's prompt cache.
*   **AppForge Action**: Apply this to Navigation Graph generation. Generate the Mermaid diagram in a "Cache-Safe" background turn so the user doesn't wait for the tool to finish.

---

## ⚡ UX Quality: The "Say Something NEW" Constraint
**Source**: `agentSummary.ts` (Line 30-31)

### 1. Progress Forcing
*   **Pattern**: Explicitly telling the model: *"Say something NEW"* and providing the `previousSummary`.
*   **Constraint**: Forces the model to acknowledge progress rather than repeating the same status for minutes at a time.
*   **AppForge Action**: Update our self-healing loops to include "Previous Attempt" in the prompt context to ensure the agent doesn't repeat the same failed locator strategy.

---

## 🏁 Phase 7 Gap Analysis

| Feature | Claude Code Pattern | AppForge Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Status Feedback**| Real-time present-tense summaries | ❌ None | **Medium Priority** (User Experience). |
| **Cache Sharing** | Forked Background Observability | ✅ Partially | We use service pooling, but not background caching. |
| **Context Pruning** | Filter Incomplete Tool Calls | ✅ Yes | **Consistent with TASK-45**. |
| **Budget Control** | Identity check (Thinking Config) | ❌ None | **Low Priority** (Optimization). |

---

## Next Exploration Target: `utils/git/`
How does Claude Code detect and resolve **GIT Conflicts** during background writing? This is the final safety net for the "Gold Standard" Developer Experience.
