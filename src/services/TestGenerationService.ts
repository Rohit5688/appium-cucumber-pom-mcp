import fs from 'fs';
import path from 'path';
import { McpConfigService, type McpConfig } from './McpConfigService.js';
import type { CodebaseAnalysisResult } from './CodebaseAnalyzerService.js';
import { NavigationGraphService } from './NavigationGraphService.js';
import { Logger } from '../utils/Logger.js';
import { HybridPromptEngine } from './HybridPromptEngine.js';
// Re-export so tool handlers can validate generated code without a direct service dep
export { GeneratedCodeValidator } from './GeneratedCodeValidator.js';
export type { ValidationResult, ValidationIssue, ValidationInput } from './GeneratedCodeValidator.js';

export interface GenerationOutput {
  reusePlan: string;
  filesToCreate: { path: string; content: string }[];
  filesToUpdate: { path: string; content: string; reason: string }[];
  jsonPageObjects?: any[];
  jsonSteps?: any[];
}

export class TestGenerationService {
  private readonly hybridEngine = new HybridPromptEngine();
  /**
   * Generates a structured system prompt for the LLM.
   * Adapts to the project's detected architecture pattern (POM vs YAML vs Facade).
   * Now includes navigation context to help LLMs understand existing navigation paths.
   */
  public async generateAppiumPrompt(
    projectRoot: string,
    testDescription: string,
    config: McpConfig,
    analysis: CodebaseAnalysisResult,
    testName?: string,
    learningPrompt?: string,
    screenXml?: string,
    screenshotBase64?: string
  ): Promise<string> {
    // Read all codegen preferences (with safe defaults)
    const configService = new McpConfigService();
    const codegen = configService.getCodegen(config);
    const suffixStr = codegen.namingConvention.pageObjectSuffix;   // e.g. "Page", "Screen"
    const caseStyle = codegen.namingConvention.caseStyle;          // "PascalCase" | "camelCase"

    // --- BasePage Strategy ---
    let basePageBlock = '';
    if (codegen.customWrapperPackage) {
      basePageBlock = `
## BASEPAGE / WRAPPER PACKAGE
This project uses "${codegen.customWrapperPackage}" as its Page Object base.
- DO NOT generate BasePage.ts — it comes from the package.
- Import using: import { BasePage } from '${codegen.customWrapperPackage}';
- DO NOT generate ActionUtils.ts, WaitUtils.ts, or any utility already provided by the package.
  Check the package's public API before generating any utility class.
`;
    } else if (codegen.basePageStrategy === 'extend') {
      basePageBlock = `
## BASEPAGE STRATEGY: extend (inheritance)
Generated Page Objects must extend BasePage:
  class Login${suffixStr} extends BasePage { ... }
Import: import { BasePage } from '../pages/BasePage.js';
`;
    } else if (codegen.basePageStrategy === 'compose') {
      basePageBlock = `
## BASEPAGE STRATEGY: compose (composition, no inheritance)
Generated Page Objects must NOT extend any class.
Instead, accept a driver/utilities instance in the constructor:
  class Login${suffixStr} {
    constructor(private utils: ActionUtils) {}
  }
Import: import { ActionUtils } from '../utils/ActionUtils.js';
`;
    } else {
      basePageBlock = `
## BASEPAGE STRATEGY: custom
Follow the existing Page Object file patterns already in the project —
do not impose an inheritance or composition pattern not already present.
`;
    }

    // --- Naming Convention ---
    const namingBlock = `
## NAMING CONVENTION
- Page Object suffix: "${suffixStr}" (e.g. Login${suffixStr}, Home${suffixStr})
- Case style: ${caseStyle} (e.g. ${caseStyle === 'camelCase' ? 'loginPage' : 'Login' + suffixStr})
- File names must match: ${caseStyle === 'camelCase' ? 'login' + suffixStr : 'Login' + suffixStr}.ts
- Step definition files: ${caseStyle === 'camelCase' ? 'login' : 'Login'}.steps.ts
CRITICAL: Use EXACTLY this naming in all class names, file names, and imports.
`;

    // --- Tag Taxonomy ---
    const tagBlock = codegen.tagTaxonomy.length > 0
      ? `
## TAG TAXONOMY (ONLY use tags from this list)
Valid tags: ${codegen.tagTaxonomy.join(', ')}
Do NOT invent new tags. If a scenario doesn't match any tag, omit tags for that scenario.
`
      : '';

    // --- Gherkin Style ---
    const gherkinBlock = codegen.gherkinStyle === 'flexible'
      ? `
## GHERKIN STYLE: flexible
Use Gherkin keywords naturally (Given/When/Then/And/But as appropriate).
`
      : `
## GHERKIN STYLE: strict
EVERY scenario must follow strict Given/When/Then structure:
  Given — setup/precondition
  When  — the user action being tested
  Then  — the assertion/expected outcome
Do NOT use consecutive Given/Given or When/When steps.
`;

    // --- Generate Files Scope ---
    const generateFilesBlock = codegen.generateFiles === 'feature-only'
      ? `
## GENERATE SCOPE: feature file only
Output ONLY the .feature file Gherkin.
Do NOT generate step definitions or Page Objects.
`
      : codegen.generateFiles === 'feature-steps'
      ? `
## GENERATE SCOPE: feature + steps only
Output the .feature file AND step definitions.
Do NOT generate a Page Object class — the team writes those manually.
`
      : `
## GENERATE SCOPE: full stack (default)
Generate: .feature file + step definitions + Page Object class.
`;

    // --- Combine all codegen blocks ---
    const codegenContext = [
      basePageBlock,
      namingBlock,
      tagBlock,
      gherkinBlock,
      generateFilesBlock
    ].filter(s => s.trim()).join('\n');

    const platform = config.mobile.defaultPlatform;
    const locatorOrder = config.reuse?.locatorOrder ?? [
      'accessibility id', 'resource-id', 'xpath', 'class chain', 'predicate', 'text'
    ];
    const paths = analysis.detectedPaths ?? config.paths ?? {
      featuresRoot: 'features',
      pagesRoot: 'pages',
      stepsRoot: 'step-definitions',
      utilsRoot: 'utils',
      locatorsRoot: 'locators',
      credentialsRoot: 'credentials'
    };
    paths.pagesRoot = path.relative(projectRoot, this.resolvePagesDir(projectRoot, paths.pagesRoot));

    const existingStepsSummary = (analysis.existingStepDefinitions ?? [])
      .map(s => `  File: ${s.file}\n    Steps: ${(s.steps ?? []).map(st => `${st.type}('${st.pattern}')`).join(', ')}`)
      .join('\n') || '  (none found)';

    const existingPagesSummary = (analysis.existingPageObjects ?? [])
      .map(p => `  ${p.path}: [${(p.publicMethods ?? []).join(', ')}]`)
      .join('\n') || '  (none found)';

    const knownScreenMap = this.buildKnownScreenMap(analysis.existingPageObjects);

    const existingUtilsSummary = (analysis.existingUtils ?? []).length > 0
      ? (analysis.existingUtils ?? []).map(u => `  ${u.path}: [${(u.publicMethods ?? []).join(', ')}]`).join('\n')
      : '  (none found)';

    // Generate navigation context to help LLMs understand existing navigation patterns
    const navigationContext = await this.generateNavigationContext(
      projectRoot, 
      testDescription, 
      analysis
    );

    // Nanotools: build the 3-layer hybrid block (CoT + champion snippet + anti-patterns)
    const hybridBlock = this.hybridEngine.buildHybridBlock(analysis);

    // ── Prompt-level token budget guard ──────────────────────────────────────
    // Estimates the upcoming prompt size BEFORE building the full string.
    // Emits a stderr warning (never throws) when the prompt approaches the
    // context ceiling. This helps operators tune champion file sizes pre-deploy.
    const estimatedBaseTokens =
      this.estimateTokens(hybridBlock) +
      this.estimateTokens(existingStepsSummary) +
      this.estimateTokens(existingPagesSummary) +
      this.estimateTokens(navigationContext);
    const PROMPT_TOKEN_BUDGET = 3500; // conservative ceiling before LLM context pressure
    if (estimatedBaseTokens > PROMPT_TOKEN_BUDGET) {
      Logger.warn(
        `[TestGeneration] ⚠️ Prompt estimate ${estimatedBaseTokens} tokens exceeds ` +
        `${PROMPT_TOKEN_BUDGET}-token budget. ` +
        `Consider reducing champion file size or step inventory. ` +
        `(hybridBlock: ${this.estimateTokens(hybridBlock)}t, ` +
        `steps: ${this.estimateTokens(existingStepsSummary)}t, ` +
        `pages: ${this.estimateTokens(existingPagesSummary)}t, ` +
        `nav: ${this.estimateTokens(navigationContext)}t)`
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const conflictsWarning = analysis.conflicts.length > 0
      ? `\n## ⚠️ STEP CONFLICTS DETECTED\nThe following step patterns are duplicated across files. DO NOT create any of these:\n${analysis.conflicts.map(c => `- \`${c.pattern}\` (in: ${c.files.join(', ')})`).join('\n')}\n`
      : '';

    const aliasesWarning = analysis.importAliases && Object.keys(analysis.importAliases).length > 0
      ? `\n## 🧰 TYPESCRIPT IMPORT ALIASES (tsconfig.json)\nDo NOT use deep relative paths (e.g. '../../pages/Login'). You MUST map imports to these aliases:\n\`\`\`json\n${JSON.stringify(analysis.importAliases, null, 2)}\n\`\`\`\n`
      : '';

    const currentEnvironment = config.currentEnvironment ?? 'local';
    const environments = config.environments?.join(', ') ?? 'local';
    const credStrategy = config.credentials?.strategy ?? 'None configured';
    const schemaHint = config.credentials?.schemaHint ?? '';

    const credentialsDir = ((paths as any)?.credentialsRoot) || 'credentials';

    const credentialsInstruction = config.credentials
      ? `\n## CREDENTIALS & ENVIRONMENTS
- Environments: ${environments}
- Current Active: ${currentEnvironment}
- Credential Strategy: ${credStrategy}
${schemaHint ? `- Schema Hint: ${schemaHint}` : ''}
⚠️ If this test requires user credentials, YOU MUST generate a simple TypeScript reader function/utility that reads the JSON file based on the credential pattern: ${credStrategy}. Do NOT hardcode credentials. Store/read credentials from the \`${credentialsDir}/\` directory.`
      : '';

    // Decide output file type based on architecture
    const locatorFileEntry = (analysis.architecturePattern === 'yaml-locators' || analysis.architecturePattern === 'facade')
      ? '{ "path": "locators/example.yaml", "content": "..." }'
      : '{ "path": "pages/ExamplePage.ts", "content": "..." }';

    return `
You are an expert Mobile Automation Engineer specializing in **Appium + WebdriverIO + @wdio/cucumber-framework** BDD testing.
Generate a COMPLETE Appium/WebdriverIO Cucumber POM test suite from this plain English request:

⚠️ **CRITICAL CONSTRAINT**: This project uses **ONLY WebdriverIO** with \`driver.$()\` selectors and **Appium** locator strategies. Use \`@wdio/globals\`, \`import { $ }\`, and Appium strategies (accessibility-id, resource-id, xpath). Do NOT import web testing libraries, page objects, or fixtures from other frameworks.

⚠️ **IMPORT CONVENTION (Appium 3 / WDIO v9)**: Step definitions and hooks MUST import \`Given\`, \`When\`, \`Then\`, \`Before\`, \`After\` from **\`@wdio/cucumber-framework\`**, NOT from \`@cucumber/cucumber\`. The \`@cucumber/cucumber\` package is an internal bundled dependency of \`@wdio/cucumber-framework\` and must NOT be imported directly.

"${testDescription}"
${testName ? `Test Name: "${testName}"` : ''}

## ENVIRONMENT
- Default Platform: ${platform}
- Detected Architecture: **${analysis.architecturePattern}**
- Locator Priority: ${locatorOrder.join(' -> ')}
- Features Dir: ${paths.featuresRoot}/
- Steps Dir: ${paths.stepsRoot}/
- Pages Dir: ${paths.pagesRoot}/
- Utils Dir: ${paths.utilsRoot}/
${analysis.yamlLocatorFiles.length > 0 ? `- YAML Locator Files: ${analysis.yamlLocatorFiles.join(', ')}` : ''}

${screenXml ? `## [XML] LIVE UI HIERARCHY\nUse this to extract EXACT locators instead of guessing.\n\\\`\\\`\\\`xml\n${screenXml}\n\\\`\\\`\\\`\n` : ''}
${screenshotBase64 ? `## [IMAGE] SCREENSHOT\nA Base64 screenshot is attached. Use it to visually confirm elements before creating locators.\n` : ''}

${credentialsInstruction}

## REQUIRED SCENARIO COVERAGE
1. **Happy Path**: Implement the primary user flow.
2. **Negative Scenarios**: Suggest/implement at least one failure path (e.g. invalid login, empty fields).
3. **Accessibility**: Include steps to verify significant elements have TalkBack/VoiceOver labels.
4. **[PHASE 4: STATE-MACHINE MICRO-PROMPTING]**: If this request requires generating a very large Page Object AND complex step definitions simultaneously across multiple files, you MUST serialize your work. Generate and invoke \`validate_and_write\` for ONLY the \`jsonPageObjects\` first. Wait for the compilation success response before generating the \`.feature\` and \`.steps.ts\` files in a subsequent attempt. Do NOT overwhelm your context window.

${codegenContext}

## EXISTING CODE (REUSE THESE -- DO NOT DUPLICATE)
${conflictsWarning}
${aliasesWarning}
${knownScreenMap}
### Existing Step Definitions:
${existingStepsSummary}

### Existing Page Objects:
${existingPagesSummary}

### Existing Utility Helpers:
${existingUtilsSummary}

${navigationContext}

${hybridBlock}

${this.getArchitectureRules(analysis, platform)}

${learningPrompt ?? ''}

## OUTPUT FORMAT (JSON ONLY)

Return ONLY a valid JSON object matching this schema. DO NOT write raw TypeScript strings for Page Objects. You MUST output Page Objects exclusively in the \`jsonPageObjects\` array. The MCP server will generate the TypeScript files for you:
\\\`\\\`\\\`json
{
  "reusePlan": "Human-readable explanation of what was reused and what is new",
  "filesToCreate": [
    { "path": "features/example.feature", "content": "..." },
    ${locatorFileEntry}
  ],
  "filesToUpdate": [
    { "path": "...", "content": "...full updated content...", "reason": "Added newMethod()" }
  ],
  "jsonPageObjects": [
    {
      "className": "LoginScreen",
      "path": "pages/LoginScreen.ts",
      "extendsClass": "BasePage",
      "imports": ["import { $ } from '@wdio/globals';"],
      "locators": [
         { "name": "submitBtn", "selector": "~submit" }
      ],
      "methods": [
         { "name": "submit", "args": [], "body": ["await this.submitBtn.click();"] }
      ]
    }
  ],
  "jsonSteps": [
    {
      "path": "step-definitions/example.steps.ts",
      "imports": ["import { $ } from '@wdio/globals';"],
      "stepDefinitions": [
        { "type": "Given", "pattern": "I open the login screen", "args": [], "body": ["await LoginScreen.open();"] }
      ]
    }
  ]
}
\\\`\\\`\\\`

DO NOT include any text outside the JSON block. DO NOT use markdown code fences outside the JSON.
`;
  }

  /**
   * Generate navigation context to help LLMs understand existing navigation paths.
   * This addresses the user's concern: "When We say to reuse any existing steps 
   * to understand navigation upto certain part of application the LLM doesnt understand that"
   * 
   * P0 FIX: Implements graceful degradation with fallback guidance when navigation extraction fails.
   * P1 FIX: Implements token budget awareness to prevent context overflow.
   */
  private async generateNavigationContext(
    projectRoot: string, 
    testDescription: string, 
    analysis: CodebaseAnalysisResult,
    maxTokens = 1000  // P1: Budget control to prevent LLM context overflow
  ): Promise<string> {
    try {
      const navService = new NavigationGraphService(projectRoot);
      
      // Extract and analyze navigation patterns from existing code
      await navService.extractNavigationMap(projectRoot);
      
      // Infer target screen from test description
      const targetScreen = this.inferTargetScreen(testDescription);
      
      if (targetScreen) {
        const navContext = await navService.generateNavigationContext(targetScreen);
        
        if (navContext && !navContext.includes('No navigation paths found')) {
          // P1: Apply token budget control
          const contextParts: string[] = [];
          let estimatedTokens = 0;
          
          // Split navigation context into paths
          const pathSections = navContext.split('\n\n').filter(s => s.trim());
          
          for (const section of pathSections) {
            const sectionTokens = this.estimateTokens(section);
            
            if (estimatedTokens + sectionTokens > maxTokens) {
              contextParts.push('*(Additional navigation paths truncated — use inspect_ui_hierarchy on the specific screen you need)*');
              break;
            }
            
            contextParts.push(section);
            estimatedTokens += sectionTokens;
          }
          
          let truncatedNavContext = contextParts.join('\n\n');
          
          return `
## Navigation & Step Reuse Instructions

STEP 1 — IDENTIFY TARGET SCREEN: Determine which screen the test ends on. (Target: "${targetScreen}")
STEP 2 — CHECK KNOWN NAVIGATION: If the navigation map above contains a path to
  that screen, use the exact Given/When steps listed for that path. Do not invent
  new navigation steps.

${truncatedNavContext}

STEP 3 — CHECK EXISTING STEP DEFINITIONS: Before writing any new When/Then step,
  search the existingSteps list above. If a step matches (even partially), reuse
  it with the exact same wording — do not paraphrase.
STEP 4 — ONLY THEN ADD NEW STEPS: If no existing step covers the needed action,
  define a new step following the project's naming convention.
`;
        }
      }
      
      // P0 FIX: Graceful degradation - provide basic navigation guidance
      return this.generateBasicNavigationGuidance(analysis);
      
    } catch (error) {
      console.error('[TestGeneration] Error generating navigation context:', error);
      
      // P0 FIX: Instead of returning empty string, provide fallback guidance
      return this.generateBasicNavigationGuidance(analysis);
    }
  }

  /**
   * P0 FIX: Generate basic navigation guidance when full navigation graph extraction fails.
   * Provides LLMs with actionable direction even when advanced analysis is unavailable.
   */
  private generateBasicNavigationGuidance(analysis: CodebaseAnalysisResult): string {
    const navigationSteps = analysis.existingStepDefinitions
      .flatMap(stepFile => stepFile.steps)
      .filter(step => this.isNavigationStep(step.pattern))
      .slice(0, 10); // Top 10 navigation steps
    
    if (navigationSteps.length === 0) {
      return `
## ⚠️ NAVIGATION GUIDANCE UNAVAILABLE

No existing navigation steps were detected. You will need to create navigation logic from scratch.

**Recommendations**:
1. **Create reusable navigation steps** in a dedicated step definition file (e.g., "navigation.steps.ts")
2. **Use descriptive step names** like "Given I am logged in" or "When I navigate to the dashboard"
3. **Build a navigation library** that future tests can reuse
4. **Follow the Page Object Model** to encapsulate navigation logic in page methods

**Example Navigation Step Pattern**:
\`\`\`gherkin
Given I am logged in as a standard user
When I navigate to the profile screen
Then I should see the profile details
\`\`\`

This will create a foundation for navigation that can be reused across all future tests.
`;
    }
    
    const stepsList = navigationSteps
      .map(step => `- \`${step.type}('${step.pattern}')\``)
      .join('\n');
    
    return `
## 🧭 EXISTING NAVIGATION STEPS - REUSE WHEN POSSIBLE

${stepsList}

**Note**: Full navigation path analysis was unavailable. Manually chain these steps as needed.

**Navigation Strategy**:
1. **Identify your target screen** from the test description
2. **Look for existing steps above** that navigate toward that screen  
3. **Chain navigation steps** in the Given/When clauses to reach your destination
4. **Create NEW steps only** for missing navigation or test-specific actions

**Example of Chaining Navigation**:
\`\`\`gherkin
Given I am on the login screen          # ← Reuse existing step
When I tap the "Sign In" button         # ← Reuse existing step
And I navigate to settings              # ← Reuse existing step
Then I should see the settings page     # ← NEW assertion for your test
\`\`\`

This approach maximizes code reuse and reduces test maintenance burden.
`;
  }

  /**
   * Infer target screen name from test description
   */
  private inferTargetScreen(testDescription: string): string | null {
    const screenKeywords = [
      'login', 'signup', 'register', 'profile', 'settings', 'dashboard', 
      'home', 'main', 'menu', 'cart', 'checkout', 'payment', 'search',
      'details', 'list', 'feed', 'timeline', 'messages', 'chat', 'notifications'
    ];
    
    const lowerDesc = testDescription.toLowerCase();
    
    for (const keyword of screenKeywords) {
      if (lowerDesc.includes(keyword)) {
        return keyword + 'screen'; // Normalize to "loginscreen", "profilescreen", etc.
      }
    }
    
    // Try to extract screen name from common patterns like "test the X screen" or "navigate to Y"
    const screenMatch = lowerDesc.match(/(?:test|on|navigate to|open|visit)\s+(?:the\s+)?(\w+)\s*(?:screen|page|view)?/);
    if (screenMatch) {
      return screenMatch[1] + 'screen';
    }
    
    return null;
  }

  /**
   * Check if a step pattern involves navigation
   */
  private isNavigationStep(stepPattern: string): boolean {
    const navigationKeywords = [
      'navigate', 'go to', 'open', 'visit', 'click', 'tap', 'press',
      'swipe', 'scroll', 'back', 'return', 'close', 'menu', 'sidebar',
      'login', 'logout', 'sign in', 'sign out', 'switch to'
    ];
    
    const lowerPattern = stepPattern.toLowerCase();
    return navigationKeywords.some(keyword => lowerPattern.includes(keyword));
  }

  /**
   * P1: Estimate token count for a text string.
   * Uses a simple heuristic: ~4 characters per token (conservative estimate).
   * This helps prevent LLM context overflow.
   */
  private estimateTokens(text: string): number {
    // Conservative estimate: 1 token ≈ 4 characters
    // This accounts for whitespace, punctuation, and multi-byte characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Returns architecture-specific rules for the generation prompt.
   * Adapts to the project's existing locator strategy.
   */
  private getArchitectureRules(analysis: CodebaseAnalysisResult, platform: string): string {
    const arch = analysis.architecturePattern;

    if (arch === 'yaml-locators' || arch === 'facade') {
      const yamlFiles = analysis.yamlLocatorFiles?.join(', ') || '(none yet - create new ones)';
      return `
## STRICT RULES - YAML LOCATOR ARCHITECTURE (Detected: ${arch})

This project uses **YAML-based locator files** with a resolver function. Follow this pattern EXACTLY:

1. **Locators in YAML**: Store ALL locators in \`.yaml\` files under the \`locators/\` directory. Format:
\\\`\\\`\\\`yaml
# locators/login.yaml
login_button:
  ios: ~loginButton
  android: ~login_btn

username_field:
  ios: ~usernameInput
  android: //android.widget.EditText[@resource-id="com.app:id/username"]
\\\`\\\`\\\`

2. **resolveLocator()**: In step definitions and utils, use \`resolveLocator('login_button')\` to get the platform-specific selector at runtime. NEVER hardcode selectors inline in .ts files.
3. **No POM Classes with inline selectors**: Do NOT create Page Object classes with inline \`$()\` selectors. Use utility helpers + resolveLocator() instead.
4. **Existing YAML files**: ${yamlFiles}
5. **BDD Triad**: Generate a \`.feature\` file, a \`.steps.ts\` file, and a \`.yaml\` locator file.
6. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
7. **Data-Driven**: If the scenario involves multiple users/values, use Scenario Outline with Examples.
8. **Reuse**: If an existing step or util method matches, DO NOT create a new one.
9. **Cross-Platform**: The YAML file handles platform differences. Step definitions remain shared.
`;
    }

    if (arch === 'hybrid') {
      return `
## STRICT RULES - HYBRID ARCHITECTURE (Detected: ${arch})

This project uses BOTH Page Object classes AND YAML locator files. Follow the EXISTING pattern:

1. **Check existing patterns first**: Look at how existing pages/steps handle locators.
2. **If the screen already has a YAML file**, add new locators to it and use resolveLocator().
3. **If the screen already has a Page Object**, extend it with new methods.
4. **For new screens**, prefer the YAML locator pattern (more maintainable for cross-platform).
5. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
6. **Reuse**: If an existing step or method matches, DO NOT create a new one.
`;
    }

    // Default: POM architecture (ISSUE #11 FIX: Removed Playwright references)
    const envStrategyRule = analysis.envConfig?.present
      ? "15. **Environment Setup**: Assume the project uses a `.env` file (e.g., `process.env.APP_URL`). Use WebdriverIO's config loading or `dotenv` rather than hardcoding. Every Page Object MUST import `dotenv/config` so `.env` values are accessible."
      : "15. **Environment Setup**: Assume the project manages configuration dynamically. Do NOT inject `import 'dotenv/config';`. Use the project's native configuration strategy as inferred from existing Page Objects or Utility helpers.";

    return `
## STRICT RULES - PAGE OBJECT MODEL (Detected: ${arch})

1. **BDD Triad**: Generate a Gherkin \`.feature\` file, a \`.steps.ts\` file, and a \`.page.ts\` file.
2. **Strict POM**: ALL locators and driver commands belong ONLY inside Page Object methods. Step definitions MUST call page methods only.
3. **Page Classes extend BasePage**: Import and extend \`BasePage\` from \`../pages/BasePage\`.
4. **Locators**: Use accessibility-id (\`~id\`) as the PRIMARY strategy. Fall back to \`resource-id\` or \`xpath\` only when necessary.
5. **Reuse**: If an existing step or page method matches, DO NOT create a new one.
6. **Mobile Gestures**: Import \`MobileGestures\` from \`../utils/MobileGestures\` for swipe, longPress, scrollToText, handleAlert.
7. **Action Utilities**: Import \`ActionUtils\` from \`../utils/ActionUtils\` for all element interactions: \`ActionUtils.tap(selector)\`, \`ActionUtils.type(selector, text)\`, \`ActionUtils.clear(selector)\`, \`ActionUtils.tapByText(text)\`, \`ActionUtils.tapByIndex(selector, n)\`, \`ActionUtils.tapAndWait(tap, waitFor)\`, \`ActionUtils.hideKeyboard()\`, \`ActionUtils.tapBack()\`. Do NOT call \`$(selector).click()\` or \`$(selector).setValue()\` directly inside Page Objects — always go through ActionUtils.
8. **API Mocking**: If the test requires specific backend state, use \`MockServer\` from \`../utils/MockServer\`.
9. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
10. **Data-Driven**: If the scenario involves multiple users/values, use a Scenario Outline with Examples.
11. **WebView Screens**: Use \`this.switchToWebView()\` before interacting with web elements and \`this.switchToNativeContext()\` to return to native.
12. **App Lifecycle**: Use \`this.openDeepLink(url)\` for direct navigation. Use \`this.handlePermissionDialog(accept)\` for system popups.
13. **TSConfig Autowiring**: If your implementation creates a NEW top-level architectural directory (e.g., \`models/\`, \`types/\`, \`helpers/\`), you MUST also actively update \`tsconfig.json\` in the target project via standard file editing tools. You must append the corresponding path alias (e.g., \`"@models/*": ["./models/*"]\`) to \`compilerOptions.paths\`, and ENSURE your newly generated TypeScript files strictly use that alias in their imports.
14. **No Inline Comments**: DO NOT include any inline comments (\`//\` or \`/* */\`) in generated code arrays. This inflates completion tokens unnecessarily. Code should be self-documenting.
${envStrategyRule}
${platform === 'both' ? `
## CROSS-PLATFORM RULES (platform: both)

When platform is "both", generate SEPARATE Page Objects per platform:
- \`pages/LoginPage.android.ts\` -- Uses Android locators
- \`pages/LoginPage.ios.ts\` -- Uses iOS locators
- \`pages/LoginPage.ts\` -- Platform router
` : ''}
`;
  }

  /**
   * Builds a "Known Screen Locator Block" from existing page objects.
   * Injected into the generation prompt to prevent the LLM from calling
   * inspect_ui_hierarchy for screens that already have Page Objects.
   *
   * The LLM reads this block and knows:
   *   ✅ These screens = use existing Page Object methods. NO inspect call.
   *   ❌ Screens NOT listed = new screens. Call inspect_ui_hierarchy.
   */
  private buildKnownScreenMap(
    existingPageObjects: { path: string; publicMethods: string[] }[]
  ): string {
    if (!existingPageObjects || existingPageObjects.length === 0) {
      return ''; // No existing pages — all screens are new, inspect everything
    }

    const screenLines = existingPageObjects.map(po => {
      const className = po.path.split('/').pop()?.replace('.ts', '') ?? po.path;
      const methods = po.publicMethods.length > 0
        ? po.publicMethods.slice(0, 6).map(m => `   ${m}()`).join('\n')
        : '   (no public methods detected)';
      return `✅ ${className} (${po.path})\n${methods}`;
    });

    return `
## 🧠 KNOWN SCREEN LOCATORS — DO NOT RE-INSPECT THESE SCREENS

The following screens have existing Page Objects with known locators and methods.
For any navigation step that passes through these screens, use their existing methods.
🚫 DO NOT call inspect_ui_hierarchy for any screen listed below.

${screenLines.join('\n\n')}

❌ Any screen NOT listed above has no Page Object yet.
   → Call inspect_ui_hierarchy ONLY for that new screen.
   → Use stepHints=[...steps for that screen] when calling inspect_ui_hierarchy.

NAVIGATION RULE:
If the user says "login to app" → use the login Page Object's login method in Background:
If the user says "reach [Screen]" → use that Screen's navigation method if it exists above.
If the user says "reach [Screen]" and it's NOT listed → it's new, call inspect_ui_hierarchy.

    BACKGROUND PATTERN (use when user describes a pre-condition like "login first"):
    \`\`\`gherkin
    Background:
      Given I am logged in as a standard user
    \`\`\`
    Map this to the login Page Object's method. Do NOT generate new login locators.
    `;
  }

  private resolvePagesDir(projectRoot: string, configuredPath: string): string {
    const configured = path.join(projectRoot, configuredPath);
    if (fs.existsSync(configured)) return configured;

    // Auto-detect
    for (const candidate of ['src/pages', 'pages', 'src/pageObjects', 'test/pages']) {
      const full = path.join(projectRoot, candidate);
      if (fs.existsSync(full) && fs.readdirSync(full).some(f => f.endsWith('.ts'))) {
        Logger.warn(`pagesRoot "${configuredPath}" not found. Using detected: ${candidate}`);
        return full;
      }
    }
    return configured;
  }
}
