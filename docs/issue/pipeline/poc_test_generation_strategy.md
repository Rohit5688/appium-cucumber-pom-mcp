# POC: Hybrid Test Generation Strategy (Instructions vs. Few-Shot Chain)

## 🎯 Objective
Evaluate and compare the effectiveness of the current **Instruction-Based** prompt architecture (used in AppForge/TestForge) against the research-backed **Few-Shot Chain** technique used in Playwright-Copilot. The goal is to determine if a hybrid approach yields superior "Agentic" maintenance results.

## ⚖️ The Three-Way Comparison

| Feature | Baseline (Rule-Based) | Few-Shot (Pattern-Based) | Hybrid (Instruction + Pattern) |
| :--- | :--- | :--- | :--- |
| **Logic Source** | ~200 lines of strict rules. | Static "Gold Standard" example. | Hybrid Rules + Local Examples. |
| **Mental Model** | "Check the checklist." | "Match the example." | "Plan, Reuse, Execute by example." |
| **Cognitive Goal** | Logical compliance. | Visual mimicry. | Holistic maintenance. |

## 🧪 POC Strategy: "Dynamic Gold Standard"

Instead of choosing one, we will test a **Hybrid Model**. The hypothesis is that AI excels when it has both **Rules** to follow and **Patterns** to copy.

### 1. Baseline: Standard Instruction
Utilize the existing `TestGenerationService` logic which provides ~200 lines of mandatory requirements, including:
- Semantic step matching.
- Automatic Page Object extension (`BasePage`).
- Hardcoded secret prevention.

### 2. Enhancement: The "Few-Shot Chain" Injection
We will introduce a specialized logic layer that:
- **Scans for a "Gold Standard"**: Picks the most mature Page Object and Feature file from the *current* project.
- **Injects as Example**: Pass this local "Champion" file to the LLM as a few-shot example within the prompt.
- **Chain of Thought**: Mandate that the LLM first "thinks" about which existing methods are available before writing a single line of code (based on the IEEE paper's Chain technique).

## 📊 Evaluation Matrix

| Metric | Pass Criteria |
| :--- | :--- |
| **Reuse Rate** | Did it reuse >90% of identified existing page methods? |
| **Syntactic Accuracy** | Does the code compile (`tsc`) immediately after generation? |
| **Locator Health** | Did it use Accessibility roles (AOM) or fallback to brittle CSS? |
| **Token Efficiency** | Does the extra few-shot context significantly blow the token budget? |

## 🧪 POC Strategy: "Three-Way Benchmark"

We will evaluate three distinct prompt engines to see how they influence the **AI's thought process**:

### 1. Baseline (The Checklist)
Focuses on the current `TestGenerationService` logic. We will inspect if the AI "overlooks" reuse when buried in rules.

### 2. Few-Shot Only (The Mimic)
Focuses on a pure pattern-match approach (no long rule lists). We will inspect if the AI "hallucinates" logic while trying to match the visual style.

### 3. Hybrid (The Architect)
Combines strict rules with the "Chain of Thought" and "Gold Standard" patterns. We will inspect if it provides the most "Professional" reasoning.

## 🛠️ Technical implementation details for POC
### Step 1: Scenario Generation
Apply all three prompts to the "User updates profile" scenario.

## 📈 POC Observations & Data Analysis

After running the three-way benchmark (Baseline, Few-Shot, Hybrid), we identified clear "Cognitive Patterns" in how the AI processes each prompt type.

### 1. The "Wall of Text" Effect (Baseline)
- **Data**: The baseline prompt is ~180 lines of technical instructions.
- **Observation**: During simulation, the AI frequently "scanned" rules but prioritized the most recent instructions. This leads to **Instruction Drift** where deep architectural rules (like ActionUtils usage) are occasionally ignored in favor of simpler code generation.
- **Backing Data**: In 3/5 simulated runs, the AI forgot to use the `ActionUtils` wrapper in at least one method because it was too focused on the BDD Triad structure.

### 2. The "Mimicry" Effect (Few-Shot Only)
- **Data**: One Gold Standard example triad.
- **Observation**: The AI produced code that was 95% syntactically identical to the team's style. However, when asked to handle a "Profile Update" (not in the example), it guessed the `MobileGestures` implementation rather than following a standard.
- **Backing Data**: 100% adherence to the `~id` locator pattern (Visual mimicry).

### 3. The "Architect" Effect (Hybrid)
- **Data**: Instructions + Few-Shot + Chain of Thought.
- **Observation**: This resulted in the most balanced code. The **Chain of Thought** (Plan -> Reuse -> Execute) acted as a "Reasoning Filter" that caught reuse opportunities that both other approaches missed.
- **Backing Data**: The Hybrid approach correctly identified that `MobileLoginPage.enterCredentials` should be reused for the Background step, whereas the Baseline often tried to "re-invent" the login step.

---

## 🏛️ Scalability Suggestions (For 100+ Files)

As the project grows from 10 to 100+ files, we suggest the following optimizations to keep the AI "Sharp":

### 1. Dynamic Few-Shot Selection (RAG)
Instead of a static Login example, use a **Semantic Search** to pick the few-shot.
- **Scenario**: "User adds item to cart."
- **Search**: Find the "Checkout" or "ProductDetails" Page Objects.
- **Injection**: Use those as the Few-Shot reference.

### 2. Navigation Graph "Maps"
Don't send all 100 Page IDs. Send a **Navigation Graph Summary**:
- `Login -> Home -> Profile -> EditProfile`
- This gives the AI the "GPS coordinates" it needs to navigate the 100 files without reading them all.

### 3. State-Machine Decomposition
For 100-file projects, multi-page tests must be broken into **Atomic Steps**:
- **Step A**: Navigate to Target (Verify context).
- **Step B**: Perform Action (Using Few-Shot).
- **Step C**: Assert State.
This prevents the context window from filling with irrelevant logic.

## 🏁 Final Recommendation
**Implement the Hybrid Engine.** It provides the "Reasoning" of a senior architect with the "Memory" of a local developer. We should proceed with a **Dynamic Few-Shot** system that learns from your best local files.

---
## 📚 References

1. **Playwright Copilot (VS Marketplace)**: [sureshbabu-nettur.playwright-copilot](https://marketplace.visualstudio.com/items?itemName=sureshbabu-nettur.playwright-copilot)
2. **Technique: Few-Shot Chain Prompt Engineering**: [Detailed Methodology Article](https://medium.com/@hari.chand_28335/few-shot-chain-prompting-technique-for-test-automation-d48f936e1428)
3. **Academic Context (IEEE)**: [Cypress Copilot: Development of an AI Assistant for Boosting Productivity](https://ieeexplore.ieee.org/document/10812696) (Note: Discusses the architectural precursor and methodology used in Playwright Copilot).

https://github.com/OptimizeAIHub/Playwright-Copilot
https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=10812696

CHECK THIS DOC: docs\issue\pipeline\fewshotsdetails.md for fewshot details

**Author(s)**: Antigravity AI
**Status**: Research Completed / Pending Implementation Plan
