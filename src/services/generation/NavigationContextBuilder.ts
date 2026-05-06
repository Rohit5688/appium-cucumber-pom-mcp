import fs from 'fs';
import path from 'path';
import type { CodebaseAnalysisResult } from '../analysis/CodebaseAnalyzerService.js';
import { NavigationGraphService } from '../nav/NavigationGraphService.js';
import { Logger } from '../../utils/Logger.js';


export class NavigationContextBuilder {
  constructor(protected facade: any) { }

  /**
   * Generate navigation context to help LLMs understand existing navigation paths.
   * This addresses the user's concern: "When We say to reuse any existing steps 
   * to understand navigation upto certain part of application the LLM doesnt understand that"
   *
   * P0 FIX: Implements graceful degradation with fallback guidance when navigation extraction fails.
   * P1 FIX: Implements token budget awareness to prevent context overflow.
   */
  public async generateNavigationContext(projectRoot: string, testDescription: string, analysis: CodebaseAnalysisResult, maxTokens = 1000): Promise<string> {
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
            const sectionTokens = this.facade?.promptBuilder?.estimateTokens(section) ?? 20;

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
  public generateBasicNavigationGuidance(analysis: CodebaseAnalysisResult): string {
    const navigationSteps = analysis.existingStepDefinitions
      .flatMap(stepFile => stepFile.steps)
      .filter(step => this.isNavigationStep(step.pattern))
      .slice(0, 10);
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
  public inferTargetScreen(testDescription: string): string | null {
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

    const screenMatch = lowerDesc.match(/(?:test|on|navigate to|open|visit)\s+(?:the\s+)?(\w+)\s*(?:screen|page|view)?/);
    if (screenMatch) {
      return screenMatch[1] + 'screen';
    }

    return null;
  }

  /**
   * Check if a step pattern involves navigation
   */
  public isNavigationStep(stepPattern: string): boolean {
    const navigationKeywords = [
      'navigate', 'go to', 'open', 'visit', 'click', 'tap', 'press',
      'swipe', 'scroll', 'back', 'return', 'close', 'menu', 'sidebar',
      'login', 'logout', 'sign in', 'sign out', 'switch to'
    ];
    const lowerPattern = stepPattern.toLowerCase();
    return navigationKeywords.some(keyword => lowerPattern.includes(keyword));
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
  public buildKnownScreenMap(existingPageObjects: { path: string; publicMethods: string[] }[]): string {
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

  public resolvePagesDir(projectRoot: string, configuredPath: string): string {
    const configured = path.join(projectRoot, configuredPath);
    if (fs.existsSync(configured)) return configured;
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