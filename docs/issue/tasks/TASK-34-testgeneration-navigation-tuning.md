# TASK-34 — LLM Navigation Tuning, Mermaids, and Token Constraints

**Status**: TODO  
**Effort**: Medium (~2 hours)  
**Depends on**: None  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

From `code_review_session_navigation_improvements.md`, the AI's understanding of Navigation Graph mapping (and its ability to reuse existing appium navigations safely) needs optimization. Context generation bloats token constraints and AI instructions are too ambiguous.

1. **Token Exhaustion**: Passing *every* possible navigation step entry-point path exceeds context limits on complex apps.
2. **Abstract AI Instructions**: The system tells LLMs to "Reuse Steps" without spelling out the precise Gherkin sequence on *how* to reuse them cleanly.
3. **Missing Visibility**: We need to see the Graph ourselves (Mermaid diagram export), document the core schema for the LLMs via TS-Doc, and track Telemetry when steps are successfully reused.

---

## What to Change

### Phase 1: Token Clipping & Telemetry Tracker
**Location:** `src/services/TestGenerationService.ts`
- Add a token estimator (e.g. strict string length bound) around `suggestNavigationSteps()` paths. If the string accumulation exceeds a max boundary (e.g. `maxTokens=1000`), truncate the remaining paths and append `*(Additional paths truncated...)*`.
- Create a private method `trackNavigationReuse(generatedFiles, existingSteps)` mapping steps string comparisons to log how many previously existing patterns were successfully matched.

### Phase 2: Prompt Refinements & Documentation
**Location:** `src/services/TestGenerationService.ts` and `src/services/NavigationGraphService.ts`
- Update the Test Generation prompt inside the class to use strict numbered step formats explaining navigation chaining (e.g. `STEP 1: Identify Target`, `STEP 2: Choose shortest existing Given/When block`).
- Append clear TypeScript JSDocs mapping `interface NavigationGraph` nodes inside the codebase for clearer typing.

### Phase 3: Markdown Visualization
**Location:** `src/services/NavigationGraphService.ts`
- Embed a new method `exportMermaidDiagram()` stringifying `this.graph.nodes` and `edge.connections` into a `graph TD` structure output. Example: `Loginscreen -->|TAP| Dashboard`.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors.
- [ ] Diagram generation compiles a valid Mermaid block output. 
- [ ] Massive codebase traversals cap their token distributions to LLM safely and provide specific chaining instructions.
- [ ] Change `Status` above to `DONE`.
