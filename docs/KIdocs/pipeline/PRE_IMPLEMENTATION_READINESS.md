# Pre-Implementation Readiness: Agentic QA Ecosystem

Before triggering **Chunk 1** of the [AGENTIC_QA_IMPLEMENTATION_CHUNKS.md](file:///c:/Users/Rohit/mcp/AppForge/docs/issue/pipeline/AGENTIC_QA_IMPLEMENTATION_CHUNKS.md), the following architectural and strategic "Street-Smart" considerations must be resolved to prevent mid-project refactors.

---

## 🏗️ 1. Architecture & State Management

---

### Multi-Repo & Local-First Workflow
> [!IMPORTANT]
> **Decision:** Tests live in a **Centralized QA Repo** on the user's local machine.
- **Workflow:** The agent analyzes the local `qaRepo` on disk for existing Page Objects (POMs) before writing any new code.
- **Remote Context:** GitHub integration is used only to read **Dev PRs** for context, while the local filesystem is the destination for generation.
- **Discovery:** Leverage `CodebaseAnalyzerService` on the local QA path to ensure zero-duplication of assets.

---

## 🔐 2. Security & Boundaries

### The "Fetch MCP" Safety Valve
> [!CAUTION]
> Giving an autonomous agent an unrestricted `Fetch` tool is high-risk for SSRF and token leakage.
- **Think about:** Implementing a **Domain Allow-List** in the `ExternalMcpClient` (Chunk 2). 
- **Action:** Explicitly block access to internal metadata IPs (e.g., `169.254.169.254`) and non-approved API endpoints.

### Secret Management
- **Think about:** How are the Jira/GitHub/Figma tokens stored?
  - **Better Way:** Do not store them in the project `.env`. Use the **AppForge Credentials Vault** logic to ensure tokens are injected at runtime and never committed to the repository history.

---

## 🚀 3. Token & Cost Optimization

### JSON-First Figma Strategy
> [!TIP]
> **Street-Smart Shift:** Do not start with Vision (VLM). 
- **Think about:** Parsing the **Figma JSON Tree** first. 
  - 80% of test data (IDs, Labels, Hierarchy) can be extracted for ~100 tokens. 
  - Use VLMs only for the "last 20%" (icons, complex layout relationships).

### Surgical AST Analysis & "Caveman" Compression
> [!IMPORTANT]
> **Decision:** Reuse existing `compress_prompt.py` (Caveman) for all text-heavy requirements.
- **Action:** Before synthesis, all Jira/Confluence/PR descriptions MUST be passed through the Caveman `compress()` function to strip 60-70% of redundant tokens.
- **Action:** Implement a **Figma Structural Minifier** that follow the Caveman mindset (strip styles/coordinates, keep hierarchy/text).

### Manual-First Triggering
- **Decision:** No automatic background polling. 
- **Action:** The Orchestrator (Chunk 10) must be triggered via an explicit command with `jiraId`, `prUrls`, and `figmaUrl`. This ensures 100% control over token spend.

---

### Xray & Jira Integration (Hybrid Protocol)
> [!IMPORTANT]
> **Xray Sync-Back Loop:**
> - **Standard:** Use `@PROJ-REQ` at the `Feature:` level for Requirements and `@PROJ-TEST` at the `Scenario:` level for Test Cases.
> - **Hybrid Protocol:**
>   - **REST (Inbound):** Use `POST /api/v2/import/feature` for the initial `.feature` file upload.
>   - **GraphQL (Sync-Back):** After import, use the **Xray GraphQL API** to query the mapping of Scenarios to their newly created Jira Test Keys.
> - **Action:** The `XrayIntegrationService` must fetch these keys via GraphQL and **inject them back** into the local Gherkin file as tags.

## 🛠️ 5. Developer Experience (DX)

### The "Dry Run" Capability
- **Think about:** Developers will be hesitant to let an agent "push tests" automatically.
- **Action:** Chunk 10 (Orchestrator) must support a `--preview` mode that outputs the `TestPlan` to the console/Slack (Chunk 11) for manual approval before any file writes occur.

### Debugging the "Brain"
- **Think about:** When a generated test is bad, how do we know why?
- **Requirement:** Every generation needs a **Traceability Log**—a hidden markdown file or metadata block explaining *which* Figma node and *which* Jira AC led to that specific Gherkin step.

---

## 🧐 6. Contrastive Analysis (Intent vs. Execution)

### The "Truth Gap" Reporting
- **Concept:** The agent's value is comparing **What was wanted (Jira)** vs. **What was built (PR)**.
- **Workflow:** Before generating tests, the agent must generate a `DiscrepancyReport`.
- **Action:** If the PR code is missing a requirement from Jira, or implements a feature not requested, surface a **Warning**.
- **User Control:** The agent must ask: *"I found 2 discrepancies. Proceed with generation based on the Requirement or the Code?"*


## 🏁 Readiness Check
- [ ] Do we have a "Gold Standard" Figma file for testing Chunk 7?
- [ ] Do we have a Sandbox GitHub Repo for testing Chunk 5?
- [ ] Is the "Street-Smart Collaboration" Rule (Rule 13) active in the agent prompt?
- [ ] **Caveman Audit:** Is `compress_prompt.py` successfully imported and verified as a dependency for the `JiraReqService`?
