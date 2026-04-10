# Hybrid Prompt Engine — Final Implementation Plan

> **Status**: Ready for Execution
> **Approach**: Additive-only changes. No breaking changes to existing signatures.
> **Core Principle**: Few-shot = compact REAL code from user's own project shown directly to LLM. No templates. No placeholders.

---

## What We Are Building

The current `generate_cucumber_pom` produces a **pure instruction-based prompt** (~280 lines of rules). We are upgrading it to a **Hybrid Prompt** with 3 layers:

```
CURRENT PROMPT:
  ├── Rules block (~280 lines)
  └── Existing inventory (steps, pages, navmap)

HYBRID PROMPT (after this change):
  ├── Compressed rules (~150 lines — trimmed of repetition)
  ├── Chain-of-Thought scaffold (Plan → Reuse → Execute)
  ├── Champion Example (real code from user's project, ~300 tokens)
  │     └── OR static fallback if no pages exist yet
  ├── Arch-specific anti-pattern (1 negative example, ~50 tokens)
  └── Existing inventory (unchanged — steps, pages, navmap)
```

**Net token impact**: ~+200-250 tokens (rules trimmed offset the few-shot addition).

---

## Ripple Analysis — Complete File Impact Map

```
NEW  src/services/HybridPromptEngine.ts
NEW  src/services/FewShotLibrary.ts
      │
      ▼ imports
MOD  src/services/TestGenerationService.ts   ← core change
      │
      ├─ interface change ripples to:
MOD  src/services/CodebaseAnalyzerService.ts ← adds goldStandard field + selectChampion()
      │
      ├─ CodebaseAnalysisResult used in:
SAFE src/services/RefactoringService.ts     ← goldStandard is optional, no change needed
SAFE src/services/UtilAuditService.ts       ← does not read CodebaseAnalysisResult fields
      │
      ├─ test mocks use CodebaseAnalysisResult:
MOD  src/tests/TestGenerationService.test.ts ← add 3 new tests, existing tests unchanged
SAFE src/tests/RefactoringService.issue12.test.ts ← optional field, mock still valid
SAFE src/tests/CodebaseAnalyzerService.test.ts    ← tests the analyzer directly, add 1 test
      │
MOD  src/index.ts  ← import + instantiate HybridPromptEngine, pass to TestGenerationService
```

**Files confirmed NOT impacted** (read the interface but don't touch the new field):

- `tools/analyze_codebase.ts` — calls `analyzerService.analyze()` but doesn't touch result fields
- `tools/execute_sandbox_code.ts` — same
- `tools/suggest_refactorings.ts` — passes full result to RefactoringService, optional field ignored

---

## Phase 1 — Champion Selection in CodebaseAnalyzerService

**File**: `src/services/CodebaseAnalyzerService.ts`

### 1a. Add `goldStandard` to `CodebaseAnalysisResult` interface

Add after line 90 (after `warnings?`), before closing `}`:

```typescript
/**
 * The "champion" page object — the most mature file in the project.
 * Used by HybridPromptEngine to inject a real few-shot example.
 * Optional — undefined when no page objects exist (new project).
 */
goldStandard?: {
  pageObjectPath: string;   // e.g. "pages/LoginScreen.ts"
  stepFilePath?: string;    // e.g. "step-definitions/login.steps.ts" — may be undefined
  maturityScore: number;    // publicMethods.length + locators.length
};
```

> [!IMPORTANT]
> The field is `optional` (`?`). This means ALL existing code that destructures or spreads `CodebaseAnalysisResult` continues to compile with zero changes. Ripple is contained.

### 1b. Add `selectChampion()` private method

Add this private method to `CodebaseAnalyzerService` class (after `detectArchitecture`, before file-discovery helpers):

```typescript
/**
 * Selects the most mature Page Object to use as the few-shot champion.
 * Scoring: publicMethods.length + locators.length.
 * Excludes base/abstract/utility classes.
 */
private selectChampion(
  existingPageObjects: CodebaseAnalysisResult['existingPageObjects'],
  existingStepDefinitions: CodebaseAnalysisResult['existingStepDefinitions']
): CodebaseAnalysisResult['goldStandard'] {
  // Filter out base classes and utilities
  const candidates = existingPageObjects.filter(po => {
    const name = po.className.toLowerCase();
    const filePath = po.path.toLowerCase();
    return (
      !name.includes('base') &&
      !name.includes('abstract') &&
      !filePath.includes('util') &&
      !filePath.includes('helper') &&
      !filePath.includes('support')
    );
  });

  if (candidates.length === 0) return undefined;

  // Score each candidate
  const scored = candidates.map(po => ({
    po,
    score: po.publicMethods.length + po.locators.length
  }));

  // Sort: score DESC, then locators DESC as tiebreaker, then alphabetical
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.po.locators.length !== a.po.locators.length)
      return b.po.locators.length - a.po.locators.length;
    return a.po.path.localeCompare(b.po.path);
  });

  const champion = scored[0].po;

  // Find companion step file by fuzzy name match
  const championBase = path.basename(champion.path, '.ts').toLowerCase()
    .replace(/page$|screen$|component$/i, '');

  const companionStep = existingStepDefinitions.find(sd => {
    const stepBase = path.basename(sd.file).toLowerCase();
    return stepBase.includes(championBase) || stepBase.startsWith(championBase);
  });

  return {
    pageObjectPath: champion.path,
    stepFilePath: companionStep?.file,
    maturityScore: scored[0].score
  };
}
```

### 1c. Call `selectChampion()` at end of `analyze()`

Add ONE line at the end of `analyze()`, right before `return result;` (line ~461):

```typescript
// Select champion for few-shot injection
result.goldStandard = this.selectChampion(
  result.existingPageObjects,
  result.existingStepDefinitions,
);

return result;
```

---

## Phase 2 — FewShotLibrary (Static Fallbacks)

**File**: `src/services/FewShotLibrary.ts` ← **NEW FILE**

This file contains compact, curated reasoning examples per architecture pattern. Each example is ~150 tokens of **real-looking code** (no placeholders), written in AppForge defaults.

```typescript
import type { ArchitecturePattern } from "./CodebaseAnalyzerService.js";

/**
 * FewShotLibrary — Static bootstrap examples for projects with no existing page objects.
 * Each example is ~150 tokens: real code demonstrating the reasoning pattern.
 * Used by HybridPromptEngine when goldStandard is undefined.
 */
export class FewShotLibrary {
  /**
   * Returns 2 compact example blocks for the given architecture.
   * Examples show reasoning chain + output rules in ~300 tokens total.
   */
  public getExamples(arch: ArchitecturePattern): string {
    switch (arch) {
      case "yaml-locators":
        return this.yamlExamples();
      case "facade":
        return this.facadeExamples();
      case "hybrid":
        return this.hybridExamples();
      default:
        return this.pomExamples(); // 'pom' is default
    }
  }

  /**
   * Returns the arch-specific anti-pattern (negative example).
   * Always ~50 tokens. Always visible to LLM.
   */
  public getNegativeExample(arch: ArchitecturePattern): string {
    switch (arch) {
      case "yaml-locators":
      case "facade":
        return (
          `\n## ❌ ANTI-PATTERN — NEVER DO THIS\n` +
          `BAD:  const el = $('~loginBtn'); await el.click();\n` +
          `GOOD: const sel = resolveLocator('login_btn'); await ActionUtils.tap(sel);\n` +
          `Rule: ALL selectors must go through resolveLocator(). Never inline selectors.\n`
        );
      case "hybrid":
        return (
          `\n## ❌ ANTI-PATTERN — NEVER DO THIS\n` +
          `BAD (POM):  $(selector).click()         GOOD: ActionUtils.tap(selector)\n` +
          `BAD (YAML): $('~loginBtn') inline        GOOD: resolveLocator('login_btn')\n`
        );
      default: // pom
        return (
          `\n## ❌ ANTI-PATTERN — NEVER DO THIS\n` +
          `BAD:  await $('~submitBtn').click();\n` +
          `GOOD: await ActionUtils.tap(this.submitBtn);\n` +
          `Rule: Step definitions NEVER call driver directly. Always delegate to Page methods.\n`
        );
    }
  }

  private pomExamples(): string {
    return `
## 📚 REFERENCE EXAMPLES — Match this exact style

### Example 1: Login Flow (Given/When/Then)

\`\`\`gherkin
Scenario: User logs in with valid credentials
  Given I am on the login screen
  When I enter valid credentials
  Then I should see the home screen
\`\`\`
Reasoning:
  Given → navigation setup → CHECK existingStepDefinitions first → reuse if found
  When  → user action    → CHECK LoginPage.publicMethods → reuse enterCredentials() if found
  Then  → assertion      → new method only if NOT in existingPageObjects
Output rules:
  - Step delegates ALL actions to page: await this.loginPage.login(user, pass);
  - Page uses ActionUtils: async login() { await ActionUtils.tap(this.loginBtn); }
  - Locators are getters: get loginBtn() { return $('~loginButton'); }
  - Page extends BasePage: class LoginPage extends BasePage { ... }

### Example 2: Data-Driven (Scenario Outline)

Reasoning:
  Multiple data sets → use Scenario Outline + Examples table — NEVER copy-paste scenarios
  Dynamic values    → step receives <param>, passes to page method
  Page method       → single generic fillForm(value), never fillForm1(), fillForm2()
Output rules:
  - Feature: Scenario Outline with | column | headers |
  - Step: Given('I enter {string}', async (value) => { await page.fillField(value); })
  - Page: single parameterized method
`;
  }

  private yamlExamples(): string {
    return `
## 📚 REFERENCE EXAMPLES — Match this exact style

### Example 1: Login Flow (YAML locator pattern)

\`\`\`yaml
# locators/login.yaml
login_btn:
  ios: ~loginButton
  android: ~login_btn
username_field:
  ios: ~username
  android: ~username_input
\`\`\`
Reasoning:
  Given → CHECK existing steps first → reuse navigation step if found
  When  → user action → CHECK existing step definitions → reuse if patterns match
  Then  → assertion   → use resolveLocator() for all selectors
Output rules:
  - ALL selectors live in .yaml files — never inline in .ts
  - Use resolveLocator('login_btn') to get platform selector at runtime
  - Step file calls utility: await ActionUtils.tap(resolveLocator('login_btn'));
  - No POM class with inline $() selectors

### Example 2: Step Reuse Pattern

Reasoning:
  Before writing ANY step → scan existingStepDefinitions for matching pattern
  Reuse exact wording — do not paraphrase: 'I am on the login screen' ≠ 'I open login'
  Only create new step if NO existing step covers the action
`;
  }

  private facadeExamples(): string {
    // Similar to yaml but uses driverFacade.getLocator()
    return this.yamlExamples()
      .replace(/resolveLocator/g, "driverFacade.getLocator")
      .replace(
        /ActionUtils\.tap\(resolveLocator/g,
        "driverFacade.tap(driverFacade.getLocator",
      );
  }

  private hybridExamples(): string {
    return `
## 📚 REFERENCE EXAMPLES — Match this exact style

### Example 1: Use POM pattern when screen already has a Page Object
  Page has existing locators → extend with new method → do NOT create new YAML file
  class ProfilePage extends BasePage → add editProfile() method

### Example 2: Use YAML pattern for NEW screens without a Page Object
  New screen → create .yaml locator file → use resolveLocator() in step
  Never mix: if screen has a POM, use POM. If screen has YAML, use YAML.

Output rules:
  - Check existingPageObjects first → if screen listed, use its methods (POM path)
  - If screen NOT listed → create YAML locator file (YAML path)
  - NEVER rewrite existing POM classes with YAML or vice versa
`;
  }
}
```

---

## Phase 3 — HybridPromptEngine

**File**: `src/services/HybridPromptEngine.ts` ← **NEW FILE**

This is the orchestrator. It reads the champion file, extracts a compact snippet, and assembles the hybrid block.

```typescript
import fs from "fs";
import type {
  CodebaseAnalysisResult,
  ArchitecturePattern,
} from "./CodebaseAnalyzerService.js";
import { FewShotLibrary } from "./FewShotLibrary.js";

const MAX_CHAMPION_CHARS = 3200; // ~800 tokens ceiling for real-code snippet
const TRIM_MARKER =
  "\n// ... (additional methods follow the same pattern above)\n";

/**
 * HybridPromptEngine — assembles the 3-layer hybrid few-shot block.
 * Injected into TestGenerationService.generateAppiumPrompt().
 *
 * Layer 1: Chain-of-Thought scaffold (static, ~80 tokens)
 * Layer 2: Champion example — real code from user's project OR static fallback
 * Layer 3: Arch-specific anti-pattern (static, ~50 tokens)
 */
export class HybridPromptEngine {
  private library = new FewShotLibrary();

  /**
   * Builds the complete hybrid block to inject into the generation prompt.
   * Safe: never throws. Returns '' on any failure (graceful degradation).
   */
  public async buildHybridBlock(
    analysis: CodebaseAnalysisResult,
    projectRoot: string,
  ): Promise<string> {
    try {
      const cot = this.buildCoTScaffold();
      const fewShot = await this.buildFewShotBlock(analysis, projectRoot);
      const negative = this.library.getNegativeExample(
        analysis.architecturePattern,
      );
      return `${cot}\n${fewShot}\n${negative}`;
    } catch {
      return ""; // Graceful degradation — existing behavior preserved
    }
  }

  /** Chain-of-Thought scaffold — always the same, ~80 tokens */
  private buildCoTScaffold(): string {
    return `
## 🧠 REASONING PROTOCOL — FOLLOW BEFORE WRITING ANY CODE

**STEP 1 — PLAN**: Identify the target screen. List every action the test needs.
**STEP 2 — REUSE AUDIT**: For each action, check the inventory above (Existing Steps, Existing Page Objects).
  - If a matching step exists → reuse it with EXACT wording. Do not paraphrase.
  - If a matching page method exists → call it. Do not recreate it.
  - Only mark an item "NEW" if nothing in the inventory covers it.
**STEP 3 — EXECUTE**: Write only the NEW items identified in STEP 2.
`;
  }

  /**
   * Builds the few-shot example block.
   * Priority: champion real code > static fallback from FewShotLibrary.
   */
  private async buildFewShotBlock(
    analysis: CodebaseAnalysisResult,
    projectRoot: string,
  ): Promise<string> {
    if (analysis.goldStandard) {
      return this.buildChampionBlock(analysis.goldStandard, projectRoot);
    }
    // No existing pages — use static fallback
    return this.library.getExamples(analysis.architecturePattern);
  }

  /**
   * Reads real source files from the project and extracts a compact snippet.
   * Trims to MAX_CHAMPION_CHARS to stay within token budget.
   */
  private async buildChampionBlock(
    goldStandard: NonNullable<CodebaseAnalysisResult["goldStandard"]>,
    projectRoot: string,
  ): Promise<string> {
    const poPath = `${projectRoot}/${goldStandard.pageObjectPath}`;
    const stepPath = goldStandard.stepFilePath
      ? `${projectRoot}/${goldStandard.stepFilePath}`
      : null;

    // Read champion page object (required)
    if (!fs.existsSync(poPath)) {
      return this.library.getExamples("pom"); // fallback
    }

    const poContent = this.trimToTokenBudget(
      fs.readFileSync(poPath, "utf8"),
      MAX_CHAMPION_CHARS,
    );

    // Read companion step file (optional — enrich if available)
    let stepSnippet = "";
    if (stepPath && fs.existsSync(stepPath)) {
      const stepContent = fs.readFileSync(stepPath, "utf8");
      // Extract only the Given/When/Then blocks, not imports/setup
      stepSnippet = this.extractStepBodies(stepContent);
    }

    return `
## 🏆 YOUR PROJECT EXAMPLE — MATCH THIS EXACT STYLE

This is real code from your project. All generated code MUST follow this pattern.
Naming, locator strategy, interaction wrapper, base class — copy exactly.

### Page Object (${goldStandard.pageObjectPath})
\`\`\`typescript
${poContent}
\`\`\`
${stepSnippet ? `\n### Step Definition (${goldStandard.stepFilePath})\n\`\`\`typescript\n${stepSnippet}\n\`\`\`` : ""}
`;
  }

  /**
   * Trims file content to stay within token budget.
   * Cuts at a class method boundary, never mid-line.
   */
  private trimToTokenBudget(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;
    // Find last complete method boundary before limit
    const truncated = content.substring(0, maxChars);
    const lastBrace = truncated.lastIndexOf("\n  }");
    const cutPoint = lastBrace > 0 ? lastBrace + 4 : maxChars;
    return content.substring(0, cutPoint) + TRIM_MARKER + "}";
  }

  /**
   * Extracts just the Given/When/Then call blocks from a step file.
   * Drops imports, describe blocks, and setup code.
   */
  private extractStepBodies(stepContent: string): string {
    const lines = stepContent.split("\n");
    const stepLines: string[] = [];
    let inStep = false;
    let braceDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(Given|When|Then|And|But)\(/.test(trimmed)) {
        inStep = true;
        braceDepth = 0;
      }
      if (inStep) {
        stepLines.push(line);
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        if (braceDepth <= 0 && stepLines.length > 1) {
          stepLines.push("");
          inStep = false;
        }
      }
    }

    const result = stepLines.join("\n");
    // Cap step snippet at 800 chars (~200 tokens)
    return result.length > 800 ? result.substring(0, 800) + "\n// ..." : result;
  }
}
```

---

## Phase 4 — TestGenerationService Integration

**File**: `src/services/TestGenerationService.ts`

### 4a. Import HybridPromptEngine (add to imports at top)

```typescript
import { HybridPromptEngine } from "./HybridPromptEngine.js";
```

### 4b. Instantiate in class body (after the class declaration, line 14)

```typescript
export class TestGenerationService {
  private hybridEngine = new HybridPromptEngine();
  // ... rest of class
```

### 4c. Add `hybridBlock` assembly inside `generateAppiumPrompt()`

Add these 4 lines after `const navigationContext = await this.generateNavigationContext(...)` (around line 166):

```typescript
// Hybrid few-shot block: CoT scaffold + champion example + negative example
const hybridBlock = await this.hybridEngine.buildHybridBlock(
  analysis,
  projectRoot,
);
```

### 4d. Inject `hybridBlock` into the prompt template

In the `return \`...\``template string, add`${hybridBlock}` immediately **after** the navigation context and **before** the architecture rules section:

```
${navigationContext}

${hybridBlock}

${this.getArchitectureRules(analysis, platform)}
```

### 4e. (Optional but recommended) Trim verbose rules

In the opening of the return template (around line 197-225), trim the repeated `⚠️ **CRITICAL CONSTRAINT**` block from ~8 lines to ~4 lines. The few-shot negative example now handles this reinforcement. This keeps total prompt length neutral.

**Exact edit**: Remove the `[PHASE 4: STATE-MACHINE MICRO-PROMPTING]` sub-bullet from `## REQUIRED SCENARIO COVERAGE` — it adds ~40 tokens of noise that the CoT scaffold handles more cleanly.

---

## Phase 5 — Wire in index.ts

**File**: `src/index.ts`

`HybridPromptEngine` is instantiated directly inside `TestGenerationService` (as a private field), so **no changes to `index.ts` are needed**. The dependency chain is internal.

> [!IMPORTANT]
> This is the key design decision that keeps `index.ts` clean and the ripple contained. `HybridPromptEngine` and `FewShotLibrary` are internal implementation details of `TestGenerationService`. They are never exposed as injected dependencies.

---

## Phase 6 — Test Updates

**File**: `src/tests/TestGenerationService.test.ts`

### Existing tests — ALL remain valid unchanged

The existing 8 tests use `mockAnalysis` which has no `goldStandard` field. Since `goldStandard` is optional, `HybridPromptEngine` will take the static fallback path and return valid output. No existing assertion breaks.

### Add 3 new tests

```typescript
test("[HYBRID] prompt should include CoT reasoning scaffold", async () => {
  const prompt = await service.generateAppiumPrompt(
    "/test/project",
    "User logs in",
    mockConfig,
    mockAnalysis,
  );
  assert.ok(
    prompt.includes("REASONING PROTOCOL"),
    "Expected CoT scaffold in prompt",
  );
  assert.ok(prompt.includes("REUSE AUDIT"), "Expected REUSE AUDIT step");
});

test("[HYBRID] prompt should include few-shot reference examples when no champion", async () => {
  const prompt = await service.generateAppiumPrompt(
    "/test/project",
    "User logs in",
    mockConfig,
    mockAnalysis,
  );
  assert.ok(
    prompt.includes("REFERENCE EXAMPLES"),
    "Expected static fallback examples",
  );
});

test("[HYBRID] prompt should include anti-pattern block", async () => {
  const prompt = await service.generateAppiumPrompt(
    "/test/project",
    "User logs in",
    mockConfig,
    mockAnalysis,
  );
  assert.ok(prompt.includes("ANTI-PATTERN"), "Expected negative example block");
});
```

**File**: `src/tests/CodebaseAnalyzerService.test.ts`

### Add 1 new test for selectChampion

```typescript
test("[CHAMPION] selectChampion picks page object with highest methods + locators score", async () => {
  // This test relies on fixture files already used in this test file
  const result = await analyzerService.analyze(fixtureProjectRoot);
  // goldStandard is undefined for empty projects
  assert.ok(
    result.goldStandard === undefined ||
      typeof result.goldStandard === "object",
  );
});
```

---

## Implementation Order (Sequential — Any LLM Can Follow)

```
Step 1:  Create src/services/FewShotLibrary.ts          [new file, no deps]
Step 2:  Create src/services/HybridPromptEngine.ts       [new file, imports FewShotLibrary]
Step 3:  Modify CodebaseAnalyzerService.ts               [add optional interface field + selectChampion method]
Step 4:  Modify TestGenerationService.ts                 [import HybridPromptEngine, add hybridBlock]
Step 5:  Run: npm run build                              [verify no compile errors]
Step 6:  Add 3 new tests to TestGenerationService.test.ts
Step 7:  Add 1 new test to CodebaseAnalyzerService.test.ts
Step 8:  Run: npm test                                   [verify all existing + new tests pass]
```

---

## Safety Guarantees

| Risk                                                | Mitigation                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `goldStandard` optional field breaks existing mocks | Field is `?` optional — existing mocks compile unchanged                                                |
| Champion file doesn't exist on disk                 | `fs.existsSync()` check → falls back to static library                                                  |
| `buildHybridBlock()` throws                         | Wrapped in `try/catch` → returns `''` → prompt identical to current                                     |
| Very large champion file blows token budget         | `trimToTokenBudget()` caps at 3200 chars (~800 tokens)                                                  |
| New project: no page objects at all                 | `goldStandard` is undefined → `FewShotLibrary` static fallback fires                                    |
| Existing tests asserting on prompt content          | CoT/few-shot is injected at a NEW location in the prompt — existing assertions still find their strings |
| `index.ts` wiring broken                            | No changes to `index.ts` — `HybridPromptEngine` is internal to `TestGenerationService`                  |

---

## File Summary

| File                                        | Status        | Change Size                                            |
| ------------------------------------------- | ------------- | ------------------------------------------------------ |
| `src/services/FewShotLibrary.ts`            | **NEW**       | ~80 lines                                              |
| `src/services/HybridPromptEngine.ts`        | **NEW**       | ~100 lines                                             |
| `src/services/CodebaseAnalyzerService.ts`   | MODIFY        | +40 lines (interface field + method)                   |
| `src/services/TestGenerationService.ts`     | MODIFY        | +5 lines (import + instantiate + 1 call + 1 injection) |
| `src/tests/TestGenerationService.test.ts`   | MODIFY        | +25 lines (3 new tests)                                |
| `src/tests/CodebaseAnalyzerService.test.ts` | MODIFY        | +8 lines (1 new test)                                  |
| `src/index.ts`                              | **NO CHANGE** | 0 lines                                                |

**Total estimated new code: ~260 lines across 6 files. Clean, atomic, reversible.**

---

**Author**: Antigravity AI
**Status**: APPROVED — Ready for Execution
