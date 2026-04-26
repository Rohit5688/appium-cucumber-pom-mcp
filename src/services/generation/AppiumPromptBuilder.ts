import path from 'path';
import { McpConfigService, type McpConfig } from '../config/McpConfigService.js';
import type { CodebaseAnalysisResult } from '../analysis/CodebaseAnalyzerService.js';
import { Logger } from '../../utils/Logger.js';


export class AppiumPromptBuilder {
  constructor(protected facade: any) { }

  /**
   * Generates a structured system prompt for the LLM.
   * Adapts to the project's detected architecture pattern (POM vs YAML vs Facade).
   * Now includes navigation context to help LLMs understand existing navigation paths.
   */
  public async generateAppiumPrompt(projectRoot: string, testDescription: string, config: McpConfig, analysis: CodebaseAnalysisResult, testName?: string, learningPrompt?: string, screenXml?: string, screenshotBase64?: string): Promise<string> {
    const configService = new McpConfigService();
    const codegen = configService.getCodegen(config);
    const suffixStr = codegen.namingConvention.pageObjectSuffix;
    const caseStyle = codegen.namingConvention.caseStyle;
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

    const namingBlock = `
## NAMING CONVENTION
- Page Object suffix: "${suffixStr}" (e.g. Login${suffixStr}, Home${suffixStr})
- Case style: ${caseStyle} (e.g. ${caseStyle === 'camelCase' ? 'loginPage' : 'Login' + suffixStr})
- File names must match: ${caseStyle === 'camelCase' ? 'login' + suffixStr : 'Login' + suffixStr}.ts
- Step definition files: ${caseStyle === 'camelCase' ? 'login' : 'Login'}.steps.ts
CRITICAL: Use EXACTLY this naming in all class names, file names, and imports.
`;
    const tagBlock = codegen.tagTaxonomy.length > 0
      ? `
## TAG TAXONOMY (ONLY use tags from this list)
Valid tags: ${codegen.tagTaxonomy.join(', ')}
Do NOT invent new tags. If a scenario doesn't match any tag, omit tags for that scenario.
`
      : '';
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
    paths.pagesRoot = path.relative(projectRoot, this.facade.navContextBuilder.resolvePagesDir(projectRoot, paths.pagesRoot));
    const existingStepsSummary = (analysis.existingStepDefinitions ?? [])
      .map(s => `  File: ${s.file}\n    Steps: ${(s.steps ?? []).map(st => `${st.type}('${st.pattern}')`).join(', ')}`)
      .join('\n') || '  (none found)';
    const existingPagesSummary = (analysis.existingPageObjects ?? [])
      .map(p => `  ${p.path}: [${(p.publicMethods ?? []).join(', ')}]`)
      .join('\n') || '  (none found)';
    const knownScreenMap = this.facade.navContextBuilder.buildKnownScreenMap(analysis.existingPageObjects);
    const existingUtilsSummary = (analysis.existingUtils ?? []).length > 0
      ? (analysis.existingUtils ?? []).map(u => `  ${u.path}: [${(u.publicMethods ?? []).join(', ')}]`).join('\n')
      : '  (none found)';
    const navigationContext = await this.facade.navContextBuilder.generateNavigationContext(
      projectRoot,
      testDescription,
      analysis
    );
    const hybridBlock = this.facade.hybridEngine.buildHybridBlock(analysis);
    const estimatedBaseTokens = this.estimateTokens(hybridBlock) +
      this.estimateTokens(existingStepsSummary) +
      this.estimateTokens(existingPagesSummary) +
      this.estimateTokens(navigationContext);
    const PROMPT_TOKEN_BUDGET = 3500;
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
    const locatorFileEntry = (analysis.architecturePattern === 'yaml-locators' || analysis.architecturePattern === 'facade')
      ? '{ "path": "locators/example.yaml", "content": "..." }'
      : '{ "path": "pages/ExamplePage.ts", "content": "..." }';
    return `
🚨🚨 **[CRITICAL ANTI-LOOPHOLE MANDATE FOR FAST MODELS]** 🚨🚨
1. DO NOT BE SNEAKY. Do not look for loopholes in instructions.
2. Follow the EXACT sequence of instructions given. Do not skip steps.
3. If a tool output says [HALT], [REJECTION], or [CONTEXT MISSING], you MUST stop and follow the specific corrective action provided.
4. Do NOT hallucinate tool calls (e.g., claiming you called a tool without actually doing it).
5. You MUST read and follow ALL rules in this prompt, not just the first few.
──────────────────────────────────────────────────────────────────────────

⚡⚡ **[PRE-GENERATION MANDATES — READ BEFORE WRITING ANY CODE]**
1. Import \`Given\`, \`When\`, \`Then\`, \`Before\`, \`After\` ONLY from **\`@wdio/cucumber-framework\`** — NEVER from \`@cucumber/cucumber\`.
2. Use ONLY WebdriverIO with \`$()\` selectors and Appium locator strategies. Do NOT import Playwright, TestForge, or web-testing fixtures.
3. BasePage strategy for THIS project: see ## PROJECT CONFIGURATION below. Do NOT override it.
4. **[PHASE 4 — SERIALIZE LARGE GENERATIONS]**: If generating a large Page Object AND complex step definitions simultaneously, you MUST do it in two turns: (a) generate & write \`jsonPageObjects\` first, wait for compilation success, (b) THEN generate \`.feature\` and \`.steps.ts\` files.
──────────────────────────────────────────────────────────────────────────

You are an expert Mobile Automation Engineer specializing in **Appium + WebdriverIO + @wdio/cucumber-framework** BDD testing.
Generate a COMPLETE Appium/WebdriverIO Cucumber POM test suite from this plain English request:

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

## PROJECT CONFIGURATION
${codegenContext}

${this.getArchitectureRules(analysis, platform)}

${learningPrompt ?? ''}

## EXISTING CODE (REUSE THESE — DO NOT DUPLICATE)
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
   * Returns architecture-specific rules for the generation prompt.
   * Adapts to the project's existing locator strategy.
   */
  public getArchitectureRules(analysis: CodebaseAnalysisResult, platform: string): string {
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

    const envStrategyRule = analysis.envConfig?.present
      ? "15. **Environment Setup**: Assume the project uses a `.env` file (e.g., `process.env.APP_URL`). Use WebdriverIO's config loading or `dotenv` rather than hardcoding. Every Page Object MUST import `dotenv/config` so `.env` values are accessible."
      : "15. **Environment Setup**: Assume the project manages configuration dynamically. Do NOT inject `import 'dotenv/config';`. Use the project's native configuration strategy as inferred from existing Page Objects or Utility helpers.";
    return `
## STRICT RULES - PAGE OBJECT MODEL (Detected: ${arch})

1. **BDD Triad**: Generate a Gherkin \`.feature\` file, a \`.steps.ts\` file, and a \`.page.ts\` file.
2. **Strict POM**: ALL locators and driver commands belong ONLY inside Page Object methods — accessed via ActionUtils (see Rule 7). Step definitions MUST call page methods only — NEVER call \`$()\` or \`driver\` directly in step files.
3. **Page Classes**: Follow the BasePage strategy declared in ## PROJECT CONFIGURATION above — do NOT override it. Do NOT hardcode \`extends BasePage\` if the project uses compose or custom strategy.
4. **Locators**: Use accessibility-id (\`~id\`) as the PRIMARY strategy. Fall back to \`resource-id\` or \`xpath\` only when \`inspect_ui_hierarchy\` confirms no accessibility-id exists.
5. **Reuse**: If an existing step or page method matches, DO NOT create a new one.
6. **Mobile Gestures**: Import \`MobileGestures\` from \`../utils/MobileGestures\` for swipe, longPress, scrollToText, handleAlert.
7. **Action Utilities — The ONLY Approved Driver Layer**: Import \`ActionUtils\` from \`../utils/ActionUtils\` for ALL element interactions. \`ActionUtils\` IS the approved way to call the WebdriverIO driver — it wraps \`$()\` internally. API: \`ActionUtils.tap(selector)\`, \`.type(selector, text)\`, \`.clear(selector)\`, \`.tapByText(text)\`, \`.tapByIndex(selector, n)\`, \`.tapAndWait(tap, waitFor)\`, \`.hideKeyboard()\`, \`.tapBack()\`. Do NOT call \`$(selector).click()\` or \`$(selector).setValue()\` directly.
8. **API Mocking**: If the test requires specific backend state, use \`MockServer\` from \`../utils/MockServer\`.
9. **Tags**: Add appropriate tags (\`@smoke\`, \`@android\`, \`@ios\`, \`@regression\`).
10. **Data-Driven**: If the scenario involves multiple users/values, use a Scenario Outline with Examples.
11. **WebView Screens**: Use \`this.switchToWebView()\` before interacting with web elements and \`this.switchToNativeContext()\` to return to native.
12. **App Lifecycle**: Use \`this.openDeepLink(url)\` for direct navigation. Use \`this.handlePermissionDialog(accept)\` for system popups.
13. **TSConfig Autowiring**: If your implementation creates a NEW top-level architectural directory (e.g., \`models/\`, \`types/\`, \`helpers/\`), update \`tsconfig.json\` to add the corresponding path alias and use that alias in all generated imports.
14. **No Inline Comments**: DO NOT include any inline comments (\`//\` or \`/* */\`) in generated code arrays. Code is self-documenting.
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
   * P1: Estimate token count for a text string.
   * Uses a simple heuristic: ~4 characters per token (conservative estimate).
   * This helps prevent LLM context overflow.
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}