# Research Results: Claude Code Pattern Study (Phase 2)

Detailed findings from exploring the `QueryEngine.ts` (the "Brain") of Claude Code.

---

## 🏗️ Technical Finding: Turn-Based Budgeting (The "Loop Guard")
**Source**: `QueryEngine.ts` (Line 146-148, 852-874)

Claude Code explicitly handles **max turns per query**. This solves the "Infinite Loop" problem where an agent tries to fix a bug, fails, and tries again with the same failed logic forever.

### 1. Max Turns Attachment (`max_turns_reached`)
*   **Pattern**: If the loop hits a configured limit (e.g. 10 tools calls), the engine yields an `SDKMessage` with subtype `error_max_turns`.
*   **How to apply to AppForge**:
    *   **Self-Healing**: Limit `self_heal_test` to 3 distinct selector attempts. If all fail, immediately call `request_user_clarification` instead of burning tokens on a 4th attempt.
    *   **Live Sessions**: Stop `inspect_ui_hierarchy` loops if the screen signature hasn't changed in 3 turns.

---

## 🛠️ Context Management: The "Compact Boundary" Strategy
**Source**: `QueryEngine.ts` (Line 917-942)

Managing token usage in terminal/UI-heavy conversations.

### 1. Pruning XML History
*   **Pattern**: When the conversation grows too long, Claude Code inserts a `compact_boundary` system message. This message contains a "preserved segment" while flushing the raw tool output from previous turns.
*   **How to apply to AppForge**:
    *   **UI Payloads**: When an agent calls `inspect_ui_hierarchy` multi-turn, AppForge should "compact" the previous 2000-line XML blocks into a single summary line: `[Summary: Screen 'Home' with 45 elements. Navigation to 'Login' found.]`.
    *   **Benefit**: Keeps the prompt context focused on the *current* screen and *overall* navigation, not old XML hierarchies that are irrelevant to the new turn.

---

## ⚡ Streaming Feedback: XML System Tags
**Source**: `QueryEngine.ts` (Line 24-26, 560-596)

Providing real-time feedback to help the LLM (and user) stay in sync.

### 1. Output Tagging (`LOCAL_COMMAND_STDOUT_TAG`)
*   **Pattern**: Commands wrap their output in specialized tags like `<local-command-stdout>`. The engine then strips ANSI and processes these for the final result.
*   **Benefit**: Allows the agent to distinguish between "Tool returned X" and "The system reported an error Y" while maintaining readable output.
*   **AppForge Action**: Wrap Appium/WebDriverIO logs in specific tags so `generate_cucumber_pom` can easily isolate error messages from progress logs.

---

## 🚀 Phase 2 Action Items for AppForge

| Action Item | Target Component | Effort |
| :--- | :--- | :--- |
| **Max Turn Guard** | `SelfHealingService.ts` | Medium |
| **XML Truncation/Compacting** | `ExecutionService.ts` | Large |
| **Live Log Streaming** | `run_cucumber_test` tool | Large |
| **Turn-Scoped Skill Storage** | `index.ts` | Medium |

---

## Next Exploration Target: `/review` Command
Learn the "Prompt-Engineering Gold Standard" for how to write a review service that looks at code changes and provides high-quality agentic feedback.
