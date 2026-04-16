# Brainstorming Archive: Agentic QA Ecosystem Design

This document archives the strategic Q&A session between the User and the Agent leading up to the implementation of the Agentic QA Ecosystem. These points serve as the "Street-Smart" design rationale for future maintenance and scaling.

---

### 1. Multi-Repo Orchestration Logic
**Q: How do we handle PRs from multiple repos if E2E tests are stored in a centralized QA repo?**
- **A:** The agent acts as a "Local Ghostwriter." It resides on the local machine where the `Central-QA-Repo` is checked out. 
- **Mechanism:** It pulls remote context (diffs) from multiple dev PR URLs but writes code directly to the local QA repo. It performs "Neural Search" on the local disk to reuse existing Page Objects before generating new ones.

### 2. Token Efficiency & Cost Control
**Q: How do we prevent the system from being too costly when pulling data from Jira, Xray, Confluence, Figma, and GitHub?**
- **A:** We use a **Manual Trigger** model. The agent only activates on user command with specific IDs. 
- **The Caveman Wrapper:** All text data (Jira/Confluence) is passed through `compress_prompt.py` to strip 60-70% of redundant tokens (fluff, articles) before processing.
- **Lazy Loading:** The agent fetches metadata first, then surgically requests specific diffs or Figma nodes as needed.

### 3. Contrastive Analysis (The Truth Gap)
**Q: What is the primary value of the agent if Jira requirements are often different from the PR code?**
- **A:** The agent acts as a **Consistency Guardian**. It identifies discrepancies between the **Requirement (Intent)** and the **PR Code (Execution)**.
- **Reporting:** Any mismatch is surfaced as a **Warning**. The user decides whether to generate tests based on the requirement (to fail the build) or the code (to update the baseline).

### 4. Xray Gherkin Tagging Standards
**Q: What is the correct format for tagging Cucumber tests for Xray?**
- **A:** NOT `@Xray(ID=...)`. Use official standards:
  - **Feature Level:** `@PROJ-REQ-ID` (links the whole feature to a Jira Requirement).
  - **Scenario Level:** `@PROJ-TEST-ID` (links specific scenarios to Xray Test Issues).

### 5. Xray Hybrid Sync-Back Protocol
**Q: How do we handle the synchronization of IDs when Xray creates the Test Issues?**
- **A:** A **Hybrid Loop-Back Pattern**:
  1. **REST (Upload):** Initial `.feature` is uploaded via REST multipart API.
  2. **GraphQL (Reconcile):** The agent then uses the Xray GraphQL API to fetch the mapping of Scenario Names to newly created Jira Keys.
  3. **Injection:** The agent updates the local `.feature` file by injecting these keys as tags.

### 6. Overlapping Requirements & Shared Tests
**Q: How does Xray handle requirements sharing common test cases, and what if the shared test needs to be updated?**
- **A:** 
  - **Overlap:** The agent appends multiple tags to a single scenario (e.g., `@REQ-1 @REQ-2`). Xray automatically maps the coverage to both Jira issues.
  - **Evolution:** If a requirement change impacts a shared test, the agent performs an **Explosion Radius check**. It alerts the user: *"Updating this for Req 1 will impact Req 2. Do you want to Update Shared or Split into a new test?"*

### 7. Application Onboarding (The Warm-Start)
**Q: Does the agent need to understand the application first?**
- **A:** Yes. We implement **Phase 0: The Structural Brain Sync**. 
- **Logic:** Before the first test is generated, the agent "Onboards" itself by scanning the local QA repo, building a Navigation Graph, and parsing the Figma blueprint. It won't write code until it has a map of the existing architecture.
