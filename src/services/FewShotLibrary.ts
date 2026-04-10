import type { ArchitecturePattern } from './CodebaseAnalyzerService.js';

/**
 * FewShotLibrary ΓÇö Nanotools (Hybrid Prompt Engine)
 *
 * Provides two static building blocks for the hybrid prompt:
 *   1. CoT Scaffold: A mandatory 4-step reasoning protocol injected into every generation prompt.
 *   2. Negative Examples: Architecture-specific anti-patterns that steer the LLM away from
 *      common mistakes (brittle selectors, stub methods, POM violations).
 *
 * These are intentionally static (not LLM-generated) to guarantee stability and token efficiency.
 * Dynamic, project-specific examples come from HybridPromptEngine.selectChampion().
 */
export class FewShotLibrary {
  /**
   * Returns the mandatory Chain-of-Thought reasoning scaffold.
   * Injected before architecture rules in every generate_cucumber_pom call.
   * Keeps the LLM from "one-shot guessing" locators or duplicating existing steps.
   */
  public static getCoTScaffold(): string {
    return `
## ≡ƒºá MANDATORY REASONING PROTOCOL (Chain-of-Thought)
Before writing ANY code, you MUST follow this sequence in order:

**STEP 1 ΓÇö AUDIT REUSE**: Search the "Existing Step Definitions" and "Existing Page Objects" sections above.
  - If a matching step already exists ΓåÆ REUSE it with EXACT wording. Do not paraphrase.
  - If a Page Object exists for the target screen ΓåÆ use its methods. Do NOT call inspect_ui_hierarchy.

**STEP 2 ΓÇö VERIFY NEW LOCATORS**: Only for screens NOT in the Known Screen Map above:
  - You MUST call \`inspect_ui_hierarchy\` (with stepHints=[...relevant steps]) BEFORE writing locators.
  - Never infer or guess accessibility IDs, resource-ids, or class names.

**STEP 3 ΓÇö PLAN FILES**: Before writing, state which files you will CREATE or MODIFY.
  - Confirm your plan matches the detected architecture (${'{'}analysis.architecturePattern{'}'}).

**STEP 4 ΓÇö EXECUTE**: Write COMPLETE, production-ready code. Rules:
  - No TODO comments. No empty method bodies. No stub logic.
  - Every file must compile. Every locator must be verified or reused.
`;
  }

  /**
   * Returns architecture-specific anti-patterns (negative examples).
   * Helps the LLM recognise what NOT to generate for this project type.
   */
  public static getNegativeExample(arch: ArchitecturePattern): string {
    if (arch === 'pom' || arch === 'facade') {
      return `
## Γ¥î ANTI-PATTERNS ΓÇö These will cause build or runtime failures. DO NOT generate these:

\`\`\`typescript
// Γ¥î BAD: XPath with positional index ΓÇö brittle, breaks on any layout change
get loginBtn() { return $('//android.widget.Button[1]'); }

// Γ¥î BAD: Driver interaction directly in step definitions ΓÇö violates POM
When('I tap login', async () => { await $('~login').click(); });

// Γ¥î BAD: Stub body ΓÇö will be REJECTED by Stub Hunter before writing
async tapLogin() { /* TODO: implement tap logic */ }

// Γ¥î BAD: Web-style locators ΓÇö invalid in Appium/WebdriverIO mobile context
get submitBtn() { return $('[data-testid="submit"]'); }
\`\`\`

\`\`\`typescript
// Γ£à GOOD: Verified accessibility-id from inspect_ui_hierarchy
get loginBtn() { return $('~loginButton'); }

// Γ£à GOOD: Step calls Page Object method only ΓÇö no driver interaction
When('I tap the login button', async () => { await loginPage.tapLogin(); });

// Γ£à GOOD: Full implementation using ActionUtils
async tapLogin(): Promise<void> { await ActionUtils.tap(this.loginBtn); }
\`\`\`
`;
    }

    // yaml-locators / hybrid
    return `
## Γ¥î ANTI-PATTERNS ΓÇö These will cause build or runtime failures. DO NOT generate these:

\`\`\`typescript
// Γ¥î BAD: Inline selector in step file instead of YAML locator
await $('~login_btn').click(); // Must use resolveLocator('login_button') instead

// Γ¥î BAD: Platform-specific code hardcoded in shared step definition
if (platform === 'ios') { await $('~loginIOS').click(); }
// ΓåÆ Platform differences belong in the YAML locator file, NOT in .steps.ts

// Γ¥î BAD: Duplicate YAML key (causes silent override)
login_button:
  android: ~login_android
login_button:   # ΓåÉ DUPLICATE ΓÇö only last value is used
  ios: ~login_ios
\`\`\`

\`\`\`yaml
# Γ£à GOOD: Single YAML key with both platforms
login_button:
  android: ~login_android
  ios: ~login_ios
\`\`\`

\`\`\`typescript
// Γ£à GOOD: Step uses resolveLocator ΓÇö platform-agnostic
const selector = resolveLocator('login_button');
await ActionUtils.tap($(selector));
\`\`\`
`;
  }
}
