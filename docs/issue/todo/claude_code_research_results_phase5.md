# Research Results: Claude Code Pattern Study (Phase 5)

Detailed findings from exploring the `skills/` (Specialized Knowledge Packaging) in Claude Code.

---

## 🏗️ Technical Finding: "Just-in-Time" Knowledge Injection
**Source**: `loadSkillsDir.ts` (Line 17-30, 772-785)

Claude Code doesn't load every instruction into the agent's memory. It uses a "Conditional Activation" system to keep the context window focused.

### 1. Conditional Skill Activation (Path-Based)
*   **Pattern**: A skill only enters the prompt if the agent "touches" or "reads" a file matching the skill's `paths` filter (e.g. `*.ts` or `src/auth/*`).
*   **Status in AppForge**: **❌ None**. We load our broad `AppiumPrompt` for everything.
*   **AppForge Action**: Implement "OS-Specific Skills." 
    *   `android.md` activates on `.apk` or `AndroidManifest.xml`.
    *   `ios.md` activates on `.ipa` or `Info.plist`.
    *   This prevents "OS Cross-Pollination" (e.g. the agent suggesting `resource-id` on iOS).

### 2. "Bundled" Strategy (Inlining Expert Knowledge)
*   **Pattern**: Expertise is stored in `.md` files (like `verify.ts` and `batch.ts`) and bundled as strings. 
*   **Logic**: The `getPromptForCommand` method (Line 22) dynamically injects the Markdown content when the command is called.
*   **AppForge Action**: Move our "How to write a Page Object" guidelines out of the core code and into a `skills/bundled/page_objects.md` library.

---

## 🛠️ Refinement: Gap Analysis (AppForge vs. Claude Code)

Based on our Phase 1-5 deep-dives, here is the current status of AppForge relative to the "Gold Standard":

| Feature | Claude Code (Gold Standard) | AppForge Status | Verdict |
| :--- | :--- | :--- | :--- |
| **Token Awareness**| `roughTokenCountEstimation` + `maxTurns` | ❌ None | **High Priority** |
| **Retry Logic** | `api_retry` with exponential backoff | ❌ Basic `try-catch` | **Medium Priority** |
| **File Edit Safety**| `FileStateCache` + `findActualString` (Quote-aware) | ❌ Raw String Replace | **Critical Priority** |
| **Context Management**| `compact_boundary` (Context pruning) | ⚠️ Basic Truncation | Needs "Summarization" logic. |
| **Parallelism** | Async Sub-Agents (`coordinatorMode`) | ⚠️ Single Turn | Needs async screen scanning. |
| **Surgical Match** | Regex Context Match | ❌ Strict Includes | Needs fuzzy-matching. |

---

## 🚀 Final Phase 5 Action Items for AppForge

| Action Item | Target Component | Effort |
| :--- | :--- | :--- |
| **Token Estimation Service** | `Logger.ts` / `API` | Medium |
| **OS-Specific Prompting** | `TestGenerationService.ts` | Medium |
| **Bundled Skill Library** | `docs/agent_skills/` | Small |
| **Atomic Replace Tool** | `FileWriterService.ts` | Medium |

---

## 🏁 Final Conclusion
I have now completed the 5-Phase Deep Dive into the Claude Code repository. 

Summary of findings:
*   **P1**: Reliable File Ops (Staleness/Fuzzy).
*   **P2**: Turn/Token Control (QueryEngine).
*   **P3**: Pre-Flight Eligibility (Review).
*   **P4**: Multi-Agent Synthesis (Coordinator).
*   **P5**: JIT Knowledge Injection (Skills).

I am ready to synthesize this into a "Gold Standard" Implementation Roadmap to move AppForge into the next level of autonomy.
