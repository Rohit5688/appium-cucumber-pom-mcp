# AppForge: High-Resilience Mobile Automation Strategy

> [!CAUTION]
> **CRITICAL PRE-IMPLEMENTATION AUDIT: PRAGMATIC ROI & COMPLEXITY**
> Before moving this strategy to the planning phase, a logical and data-driven assessment is mandatory to ensure we aren't building "Over-Engineered Tech":
> 1. **ROI Analysis**: Does the project have enough test failures to justify building a "Fingerprint Service"? If you only run tests once a week, the maintenance cost of a "Mobile Memory" database may exceed the cost of just using an LLM to fix it.
> 2. **Complexity Balance**: These patterns (Neighbor Context, Fingerprinting) increase the lines of code and state-management significantly. Does this increase in complexity provide a proportional increase in "Solve-Ability"? 
> 3. **Usage Frequency**: Predictive healing is most effective for "Continuous Execution". For exploratory testing, manual-in-the-loop AI is often more efficient.
> 4. **Infrastructure Toll**: Quad-Tree vision requires complex image processing. Only implement if standard screenshots are demonstrably failing to provide enough context for the LLM.

## 📱 Recommended Architecture: The "Vision-First" Hybrid
**Reference**: [Skyvern](https://github.com/Skyvern-AI/skyvern) & [Healenium-Appium](https://github.com/healenium/healenium-appium)

Mobile apps are notoriously flaky due to "Stale Elements" and "Dynamic Resource IDs". We need an architecture that doesn't rely solely on the unstable UI Automator tree.

### 1. Element "Fingerprinting" (Healenium Pattern)
- **Problem**: Resource-IDs in Android and Labels in iOS change frequently during dev cycles.
- **Solution**: Create a `MobileFingerprintService`.
- **Logic**: For every interaction, store:
    - **Neighbor Context**: What are the items above/below this element? (This rarely changes even if the element ID does).
    - **Relative Depth**: Where is it in the hierarchy tree?
    - **XPath Signature**: A robust, multi-attribute XPath string.
- **Benefit**: If `~login_btn` fails, AppForge can search for "the element sitting next to the 'Forgot Password' link" using neighbor context.

### 2. Multi-Resolution Vision Context
- **Problem**: Sending full mobile screenshots to LLMs is slow and sometimes misses small details.
- **Solution**: Implement **Quad-Tree Vision**.
- **Logic**: 
    1. Divide the screen into a 2x2 or 3x3 grid.
    2. Only send the "Active Grid" (where the failure happened) in high resolution.
    3. Send the rest of the screen as low-res background context.
- **Benefit**: Increases accuracy of locator detection while staying within conservative token limits.

---

## 🚀 Performance & Cost Optimization

### [Priority 1] The "Local Healer" Cache
- **Concept**: Don't call Claude/Gemini for every flaky element.
- **Implementation**: 
    - Maintain a local `healing_memory.db`.
    - If an element was healed once (e.g., `btn_submit` -> `button_primary`), store it.
    - Next time `btn_submit` fails, check the database first.
- **Impact**: **70% reduction in API latency** and zero-cost healing for common regressions.

### [Priority 2] Gherkin-to-Action Mapping
**Reference**: [OpenQA](https://github.com/Open-QA/OpenQA)
- **Application**: Instead of generating a new Appium script for every Gherkin step, create a **Component Repository**.
- **Goal**: Maps `"Given I login"` to a pre-verified set of actions. AppForge only uses AI for "unknown" steps, making the execution deterministic and fast.

---

## 📋 Implementation Roadmap [TODO]

- [ ] **Task 1**: Implement `MobileNeighborService` to extract adjacent element context during standard scans.
- [ ] **Task 2**: Build the `LocalHealCache` (SQLite-based) to store and reuse verified locator fixes.
- [ ] **Task 3**: Upgrade `SelfHealingService` to use Neighbor Context as a "Score-based" fallback before calling the LLM.

> [!IMPORTANT]
> **Mobile Reliability**: Neighbor context is the single most stable locator strategy in mobile, even better than Accessibility-ID in many cross-platform apps (React Native).
