# Research Results: Claude Code Pattern Study (Phase 6)

Detailed findings from exploring the **Specialized Toolbox** in Claude Code.

---

## 🏗️ Technical Finding: The "LSP" (Language Server) Pattern
**Source**: `LSPTool.ts` (Line 1-865)

Claude Code doesn't rely on simple string searching (Grep). It uses a full Language Server to provide **Semantic Intelligence**.

### 1. Operation-Driven Accuracy
*   **Pattern**: Operations like `goToDefinition`, `findReferences`, and `prepareCallHierarchy` are exposed directly to the model.
*   **Safety**: Uses `isReadOnly()` (Line 152) and filters results against `.gitignore` (Line 559) before presenting them to the model.
*   **AppForge Opportunity**: Port this to our `audit_utils` tool. Instead of "Does 'clickLogin' exist?", the agent asks "Is 'clickLogin' called by any test file?". This prevents breaking changes during refactoring.

---

## 🛠️ UX Pattern: The "Proactive Brief" (Communication Channel)
**Source**: `BriefTool.ts` (Line 1-209)

The primary visible output channel for the agent, moving beyond simple tool output.

### 1. Attachment Enrichment
*   **Pattern**: The `attachments` array (Line 28) allows the agent to attach photos, diffs, or logs to a message.
*   **Status Differentiation**:
    *   `normal`: Direct reply to a user prompt.
    *   `proactive`: Surfacing a completion or blocker while the user was away (Line 38).
*   **AppForge Opportunity**: Use this for `run_cucumber_test`. Attach the `.html` report and failing screenshots as structured "Brief" attachments rather than dumping file paths into the chat.

---

## ⚡ Interaction Pattern: The "Multi-Choice Question" Tool
**Source**: `AskUserQuestionTool.ts` (Page 1)

### 1. Structured Clarification
*   **Pattern**: Instead of asking an open-ended question, the agent presents a list of options with optional `preview` markdown (ASCII mockups, code snippets).
*   **Constraint**: Explicitly tells the agent: *"If you recommend a specific option, make that the first option in the list and add (Recommended) at the end."*
*   **AppForge Action**: Implement this for "Conflict Resolution" in tests. If a locator conflict occurs, present the user with a choice of 3 selectors and their reliability scores.

---

## 🚀 Advanced Management: "Recursive Isolation" (AgentTool)
**Source**: `AgentTool.tsx` (Line 1-1402)

### 1. Worktree Sandboxing
*   **Pattern**: `isolation: 'worktree'` creates a temporary git worktree (slug-based `agent-XXXX`) for the sub-agent.
*   **Cleanup Logic**: Automatically cleans up the worktree if **no changes** were made (Line 670), or reports the path if changes exist.
*   **AppForge Action**: Apply to "Self-Healing." Let the agent attempt a fix in a `worktree` first. If tests pass there, merge to the main workspace.

---

## 🏁 Phase 6 Gap Analysis

| Tool | Claude Code Pattern | AppForge Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Search** | `GrepTool` + `LSPTool` | ⚠️ Grep only | **High Priority** (Needs semantic search). |
| **Output** | `BriefTool` (Attachments) | ❌ None | **Medium Priority** (Needs structured logs). |
| **Questions**| `AskUserQuestion` (Pre-baked choices) | ❌ None | **Medium Priority** (Needs decision-flow). |
| **Isolation**| Git Worktree Sandboxes | ❌ None | **High Priority** (Needs clean workspace). |

---

## Next Exploration Target: `services/AgentSummary`
How does Claude Code condense massive interaction histories into a small "Summary Fragment" for long-running tasks?
