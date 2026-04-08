# Research Results: Claude Code Pattern Study (Phase 4)

Detailed findings from exploring the `coordinator/` (Multi-Agent Orchestration) in Claude Code.

---

## 🏗️ Technical Finding: Multi-Agent Parallelism
**Source**: `coordinatorMode.ts` (Line 213-219)

Claude Code's "Superpower" is fanning out independent workers to perform research, implementation, and verification in parallel.

### 1. High-Concurrency Delegations
*   **Pattern**: The coordinator launches multiple workers in a single turn for independent tasks (e.g. Researching Auth vs. Researching Database).
*   **Rule**: "Read-only tasks (research) - run in parallel freely. Write-heavy tasks (implementation) - one at a time per set of files."
*   **AppForge Action**: Update `TestGenerationService` to allow fanning out individual "Screen Scanners" for large suites. 

### 2. Mandatory Spec Synthesis (No-Lazy-Delegation)
*   **Pattern**: Prohibits the agent from delegating understanding to the worker (Line 259: *"Never write 'based on your findings'... synthesize the findings yourself."*)
*   **Benefit**: Ensures that the coordinator (who has the full conversation context) remains the source of truth, while the worker stays focused on a narrow, well-defined spec (Line 267).
*   **AppForge Action**: Implement this constraint into our "State-Machine Micro-Prompting" logic to ensure that when a scan completes, the prompt for the generator includes fixed, synthesized requirements.

---

## 🛠️ Infrastructure Pattern: The Context-Agnostic Worker
**Source**: `coordinatorMode.ts` (Line 253-254)

### 1. Self-Contained Prompts
*   **Pattern**: *"Workers can't see your conversation. Every prompt must be self-contained."*
*   **Status in AppForge**: **Needs Work**. Our agents sometimes assume previous context that was only visible to a "Service" but not the "Tool handler." 
*   **AppForge Action**: Ensure all AppForge tools include a `metadata` block that "re-serializes" the essential state (current screen, device OS, app version) into every call.

### 2. Choosing "Continue" vs "Spawn Fresh"
*   **Pattern**: Decision logic based on "Context Overlap" (Line 284-291).
    *   **Continue** (`SEND_MESSAGE`): When the worker already has the file context and just needs a correction.
    *   **Spawn Fresh** (`AGENT`): For verification, to ensure a "clean slate" and "fresh eyes" look at the code.
*   **AppForge Action**: Apply this to Self-Healing vs. Regression Testing.

---

## ⚡ Memory Pattern: The "Scratchpad"
**Source**: `coordinatorMode.ts` (Line 104-106)

### 1. Cross-Worker Durable Knowledge
*   **Pattern**: A shared `scratchpadDir` where workers can drop findings or shared state without permission prompts.
*   **AppForge Action**: Create a `docs/issue/.agent_scratchpad` directory in AppForge projects to allow multiple sub-agents to share selector caches and navigation findings across large test suites.

---

## 🚀 Phase 4 Action Items for AppForge

| Action Item | Target Component | Effort |
| :--- | :--- | :--- |
| **Worker Concurrency Support** | `CoordinatorService.ts` | Large |
| **Mandatory Synthesis Prompts** | `workflow_guide.ts` | Medium |
| **Scratchpad Implementation** | `FileStateService.ts` | Small |
| **"Fresh Eyes" Verifiers** | `TestExecutionService.ts` | Medium |

---

## Next Exploration Target: `skills/` (Package Expertise)
How does Claude Code package specialized knowledge like "Git" or "LSP" into reusable, agents-consumable blocks?
