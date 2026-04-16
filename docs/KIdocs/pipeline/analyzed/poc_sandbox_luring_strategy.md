# POC Strategy: Sandbox Luring & AI "Trial-and-Error"
## 🎯 Objective
To transform the AI from a "Single-Shot Generator" into an **"Experimental Architect"** that uses the local execution sandbox to verify assumptions before committing code. We want to fight the "Generative Laziness" where AI guesses locators or logic without proof.

## ⚖️ The Problem: "The One-Shot Bias"
LLMs are naturally biased toward high-confidence, single-turn responses to minimize latency. In complex automation, this leads to:
- Brittle locators (guessing CSS/Accessibility IDs).
- Logical errors in Page Objects that only surface during user execution.
- Failed code reuse because the AI "guessed" an existing method's signature instead of checking it.

## 🛠️ The "Luring" Mechanics

### 1. The "Sandbox-First" Chain of Thought (CoT)
We force the AI to include a `VERIFICATION` step in its internal reasoning. 
- **Rule**: If an Appium session is active, any new locator **MUST** be verified via a sandbox call (e.g., `inspect_ui_hierarchy` or `verify_selector`) before it can be added to a Page Object.

### 2. Failure-Enriched Feedback (Learning from Mistakes)
We modify the `ExecutionService` and tool responses to be "Sandbox-aware."
- **Current Output**: "Command failed: Error 1."
- **Lured Output**: "Command failed. However, here is the current UI Hierarchy and a Screenshot. Use the `verify_logic_in_sandbox` tool to find a working selector before retrying."

### 4. Meta-Sandbox Refactoring (Implemented: Turbo Mode)
- **Problem**: Large-scale refactoring in AppForge/TestForge (e.g., renaming a service in 20 files) is extremely token-expensive if done via manual file edits.
- **The Solution**: Use **`execute_sandbox_code`** (V8 Sandbox) to perform the refactor across the whole project in a single execution.
- **Status**: ✅ Implemented and ready for use.

## 📈 Success Metrics (Measuring the Lure)
| Metric | Baseline | Target (POC) |
| :--- | :--- | :--- |
| **Tool Usage Ratio** | 90% writing / 10% checking. | 60% writing / 40% checking. |
| **Healing Loop Count** | User has to manually provide fixes. | AI uses sandbox to "Self-Heal" 80% of errors. |
| **Locator Accuracy** | 70% (guesses possible). | >95% (verified on-device). |

## 📅 Roadmap for Implementation
1. [x] **Step 1**: Add `verify_logic_in_sandbox` to the `ExecutionService`. (Implemented as `execute_sandbox_code`)
2. [ ] **Step 2**: Update the main system prompt to enforce the "Sandbox-First" mindset.
3. [ ] **Step 3**: Run a benchmark test (e.g., "Find a hidden profile button") where the AI *must* use the sandbox to succeed.

---
**Author(s)**: Antigravity AI
**Related Document**: [POC Test Generation Strategy](file:///c:/Users/Rohit/mcp/AppForge/docs/issue/todo/poc_test_generation_strategy.md)
**Status**: Pending Detailed Design
