# AppForge: Autonomous Intelligence & Cost Optimization (Post-PageAgent Audit)

This document outlines how we can optimize **AppForge** for better cost-efficiency and intelligence by merging our current Mobile XML architecture with **PageAgent's** autonomous design patterns.

## 📊 Current State: Where the Money Goes
Our current `SelfHealingService` and `TestGenerationService` process raw XML hierarchies from Appium.
1. **Raw Overload**: A typical mobile XML can be 50KB to 200KB. Sending this to Gemini/Claude for healing costs significant tokens per step.
2. **Context Blowout**: We currently "prune" XML, but it's still text-heavy.
3. **Redundant Analysis**: We re-analyze the full screen for every failed locator, even if only one button moved.

---

## 🚀 Optimization Strategies (Repurposing PageAgent Logic)

### 1. "Dehydrated" XML Hierarchy (Token Savings: ~60%)
**Inspired by**: `page-agent/packages/page-controller/src/dom/dom_tree/`
- **Concept**: Instead of a "Pruned XML", create a **Sparse Action Map**.
- **Implementation**: 
    - Create a hierarchy of ONLY `clickable="true"` elements and their **nearest text labels**.
    - Flatten the tree (remove empty nesting views).
    - Use PageAgent's "Indexed Pointer" system (e.g., `(1) Button [Login]`).
- **Impact**: We can fit 3-4x more UI history into the same context window, allowing the AI to "remember" previous screens without hitting limits.

### 2. Delta-Based Refresh
**Inspired by**: PageAgent's `lastUpdateTime` logic.
- **Concept**: Only trigger a full AI re-analysis if the XML hash has changed significantly.
- **Implementation**: 
    - Cache the "Smart DOM" of the last 5 screens.
    - If a locator fails, first compare the new XML hash with the cache.
    - If 90% matches, tell the AI: *"The screen is the same, but element X is missing. Suggest a fix based on this small diff."*
- **Impact**: Drastic reduction in "Plan" tokens during healing.

### 3. Visual Pruning (Vision LLM Efficiency)
**Inspired by**: PageAgent's `SimulatorMask`.
- **Concept**: Don't just send the full screenshot.
- **Implementation**: 
    - In `SelfHealingService`, calculate the bounding box of the *last known location* of the failed element.
    - Send a **Crop + Context** image: the 300x300 area around the failure + a low-res full screen.
- **Impact**: Makes Gemini/Claude Vision faster and more accurate at pinpointing small mobile icons.

---

## 🛠️ Action Items for AppForge

### Phase 1: Sparse Action Map Service [TODO]
- [ ] Implement `MobileSmartTreeService`: 
    - Input: Raw XML.
    - Output: JSON Action Map (Index, Text, ID, Bounds).
    - Logic: Use PageAgent's `isInteractiveElement` logic applied to Appium attributes.
- [ ] Update `SelfHealingService` to use this JSON map instead of Pruned XML.

### Phase 2: Integrated Highlight Overlays [TODO]
- [ ] Port the `SimulatorMask` logic to `AppiumSessionService`.
- [ ] When a test runs via `ExecutionService`, draw a red/green box on the device screen (via `mobile: drawOverlay` or similar) to match PageAgent's look and feel.

### Phase 3: Healing with "Warm-Start" 
- [ ] Integrate with `.AppForge/structural-brain.json`.
- [ ] Use the Smart Tree to update the Navigation Graph automatically without needing a full-page "scan" token.

---

> [!TIP]
> **Token-Aware Tip**: By moving from "Text XML" to "JSON Action Map", we can switch from expensive long-context models to faster, cheaper models (like Gemini 1.5 Flash) for the actual healing execution.

> [!WARNING]
> When implementing Sparse Mapping, ensure `Accessibility-ID` is never pruned, as it is our most stable anchor for Appium.
