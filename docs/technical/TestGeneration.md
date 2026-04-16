# ✍️ Test Generation & Smart Orchestration

AppForge generates production-ready, mobile-first BDD suites by combining deep codebase analysis with real-time UI context.

---

## 🔦 1. Smart Analysis (Turbo Mode)

Before generating code, the AI performs a "pre-flight" audit of your project.

- **`analyze_codebase`**: Deeply scans your Page Objects and Step Definitions using AST parsing (`ts-morph`) to identify existing patterns.
- **`execute_sandbox_code` [TURBO]**: For large repositories, the AI uses the secure V8 sandbox to extract specific metadata (list of pages, existing steps) without reading entire files, saving 98% on token costs.

---

## ✍️ 2. `generate_cucumber_pom` (The Architect)

This tool builds a rich contextual prompt for the LLM. It is **Context-Aware**:

- **Smart Contextual Injection**: Injects live **XML Hierarchies** and **Screenshots** so the AI "sees" the UI.
- **Navigation Maps**: Automatically includes a Mermaid-format navigation graph (from `export_navigation_map`) so the AI understands screen transitions.
- **Gherkin Compression**: Summarizes existing `.feature` files to give the AI a sense of your writing style without bloating the prompt.

---

## ✅ 3. Atomic Scaffolding

### `create_test_atomically` [RECOMMENDED]
The primary tool for writing new code. In a single call, it:
1.  **Validates**: Performs a security audit and runs `tsc --noEmit` on the draft code.
2.  **Lints**: Checks the Gherkin syntax.
3.  **Commits**: Writes the `.feature`, `.steps.ts`, and Page Object files to disk simultaneously to ensure no part of the suite is missing.

### `validate_and_write`
Use this for manual code updates or when you need a `dryRun: true` preview before committing changes.

---

## 🛠️ 4. Maintenance Tools

- **`suggest_refactorings`**: Analyzes the project AST to find duplicate step definitions or unused Page Object methods.
- **`audit_mobile_locators`**: Scans your Page Objects for high-risk selectors (XPaths) and recommends stable alternatives like `accessibility-id`.
- **`generate_test_data_factory`**: Creates a typed data factory using `faker.js` for dynamic, realistic test data.

---

## 🎲 5. Example Generation Prompt

> *"Create a new test suite for the 'Add to Cart' flow. Use `create_test_atomically`. Ensure the Page Object handles both Android and iOS selectors by extending `BasePage`. Use the live UI context from the active Appium session to define the 'Checkout' button locator."*
