# [DOC] Forge Sandbox "Turbo Mode" Capabilities

## 🚀 The Philosophy: Turbo Mode

"Turbo Mode" is a paradigm shift where the LLM stops performing manual file-by-file reads and instead executes **batch analysis scripts** inside a secure V8 sandbox. This reduces token consumption by up to 90%, bypasses context limits, and allows for precise, programmatic data extraction.

---

## 🛠️ TestForge Sandbox (Implemented)

The following APIs are now available in `TestForge` via `execute_sandbox_code`:

### Analysis Primitives

- **`forge.api.findFiles(dir, ext)`**: Fast recursive file discovery, ignoring `node_modules` and heavy artifacts.
- **`forge.api.grep(query, dir)`**: Native codebase searching for methods, locators, or text patterns.
- **`forge.api.extractPublicMethods(tsCode)`**: Uses AST-like logic to identify all public/async methods in a Page Object or Utility file.

### Specialized Parsers

- **`forge.api.parseGherkin(featureText)`**: Converts raw `.feature` content into a structured JSON array of Scenarios and Steps.
- **`forge.api.parseHtml(html)`**: Exposes a Cheerio-backed API for querying web DOM snapshots without a real browser context.
- **`forge.api.parseTrace(tracePath?)`**: Directly parses Playwright `.zip` traces, returning a searchable JSON array of every network request, status code, and header.

---

## 🏗️ AppForge Sandbox (Proposed)

Based on the success of the TestForge model, we propose the following "Mobile-First" extensions for `AppForge`:

### 1. `forge.api.parseUiHierarchy(xml)`

- **Goal**: Mobile equivalent to `parseHtml`.
- **Logic**: Use an XML parser (like `fast-xml-parser` or `xpath.js`) to allow the LLM to query Android/iOS UI hierarchies using XPath or element types natively.
- **Benefit**: No more reading 5000 lines of XML. The LLM returns only the target nodes it needs.

### 2. `forge.api.extractLocatorStrategies(xml)`

- **Goal**: Auto-generate potential mobile locators from a raw XML dump.
- **Logic**: Pipes the XML through Appium-specific logic to suggest Resource IDs, Accessibility IDs, or Optimized XPaths.

### 3. `forge.api.parseMobileLogs(logText)`

- **Goal**: Sift through chaotic Appium/ADB/Simulator logs.
- **Logic**: Extracts timestamps, error stacks, and "find element" latency metrics.
- **Benefit**: Debugging flaky mobile tests without streaming megabytes of log text.

### 4. `forge.api.parseGherkin(text)` (Parity)

- **Goal**: Standardize BDD parsing across both frameworks.
- **Benefit**: Reuses the same logic to help AppForge's `generate_cucumber_pom` tool.

### 5. `forge.api.extractPublicMethods(tsCode)` (Parity)

- **Goal**: Simplify Page Object analysis for mobile automation projects.

---

## Next Steps

1. **AppForge Port**: Port the core `findFiles`, `grep`, and `parseGherkin` logic into `AppForge/src/tools/execute_sandbox_code.ts`.
2. **XML Engine**: Evaluate the best lightweight XML/XPath engine for `parseUiHierarchy`.
3. **Unified Documentation**: Update the tool descriptions in both projects to use the same "Turbo Mode" terminology to guide the LLM consistently.
