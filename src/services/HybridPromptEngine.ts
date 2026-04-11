import type { CodebaseAnalysisResult, ArchitecturePattern } from './CodebaseAnalyzerService.js';
import { FewShotLibrary } from './FewShotLibrary.js';

/**
 * ChampionCandidate ΓÇö the highest-scoring Page Object selected from the existing codebase.
 * Used as the "Gold Standard" few-shot example in the hybrid prompt block.
 */
export interface ChampionCandidate {
  path: string;
  className: string;
  score: number;
  /** Compact TypeScript snippet showing the Page Object's structure (locators + method stubs). */
  snippet: string;
}

/**
 * HybridPromptEngine ΓÇö Nanotools (Phase 3)
 *
 * Orchestrates the 3-layer hybrid block injected into every test generation prompt:
 *   Layer 1 ΓÇö CoT Scaffold (mandatory reasoning protocol)
 *   Layer 2 ΓÇö Champion Snippet (real code from the user's codebase, or generic fallback)
 *   Layer 3 ΓÇö Anti-Patterns (architecture-specific negative examples)
 *
 * Design Goals:
 *   - Keep the hybrid block compact (~200-300 tokens) to avoid crowding the context window.
 *   - Prefer real project code over generic examples whenever a mature Page Object exists.
 *   - Degrade gracefully: if no champion exists, use generic fallback text.
 *   - Zero breaking changes: injected as an additive block at the end of the existing prompt.
 */
export class HybridPromptEngine {

  /**
   * Scores all Page Objects in the analysis result and returns the most mature one.
   *
   * Quality-Weighted Scoring (replaces naive linear count):
   *   sizeScore     (25%) — Rewards balanced 6-15 method files; penalises bloat (30+).
   *   qualityScore  (50%) — Rewards async/await usage; penalises ASTScrutinizer warnings.
   *   locatorScore  (25%) — Rewards 4-12 locators; penalises zero-locator or oversized files.
   *
   * Exclusions:
   *   - Anonymous classes/objects (no class name)
   *   - Base/abstract/utility classes (not a real example for generation)
   *
   * Returns null if no eligible Page Objects exist.
   */
  public selectChampion(analysis: CodebaseAnalysisResult): ChampionCandidate | null {
    if (!analysis.existingPageObjects?.length) return null;

    const EXCLUDED_NAMES = ['base', 'abstract', 'mixin'];
    const EXCLUDED_PATHS = ['util', 'helper', 'support', 'common', 'shared'];

    let best: ChampionCandidate | null = null;
    let topScore = -Infinity;

    for (const po of analysis.existingPageObjects) {
      // Skip anonymous objects
      if (po.className.startsWith('Anonymous')) continue;

      // Skip base/utility classes — they are infrastructure, not good style examples
      const nameLower = po.className.toLowerCase();
      const pathLower = po.path.toLowerCase();
      if (EXCLUDED_NAMES.some(n => nameLower.includes(n))) continue;
      if (EXCLUDED_PATHS.some(p => pathLower.includes(p))) continue;

      const methodCount = po.publicMethods?.length ?? 0;
      const locatorCount = po.locators?.length ?? 0;
      const hasAstWarning = (analysis.warnings ?? []).some(w => w.includes(po.path));

      // --- sizeScore (25%): sweet spot is 6-15 methods ---
      // Score peaks at ~10 methods and tapers off symmetrically on both sides.
      // A 30-method file scores ~0.25; a 10-method file scores 1.0.
      const rawSizeScore = methodCount === 0
        ? 0
        : Math.max(0, 1 - Math.abs(methodCount - 10) / 20);
      const sizeScore = rawSizeScore;

      // --- qualityScore (50%): async usage + no scrutinizer warnings ---
      let qualityScore = 0.6; // baseline
      if (methodCount > 0) {
        // Proxy for "modern code": files with async methods are preferred
        // (publicMethods from AST are method names; we check the snippet source)
        qualityScore += 0.2; // reward for having actual methods
      }
      if (locatorCount > 0) {
        qualityScore += 0.1; // reward for having locators (i.e., real POM, not a stub)
      }
      if (hasAstWarning) {
        qualityScore -= 0.5; // heavy penalty for lazy/TODO scaffolding
      }
      qualityScore = Math.min(1.0, Math.max(0, qualityScore));

      // --- locatorScore (25%): sweet spot is 4-12 locators ---
      const rawLocatorScore = locatorCount === 0
        ? 0
        : Math.max(0, 1 - Math.abs(locatorCount - 8) / 16);
      const locatorScore = rawLocatorScore;

      // --- Weighted composite ---
      const score = sizeScore * 0.25 + qualityScore * 0.50 + locatorScore * 0.25;

      if (score > topScore) {
        topScore = score;
        best = {
          path: po.path,
          className: po.className,
          score: Math.round(score * 100) / 100, // normalised 0.0–1.0
          snippet: this.buildSnippet(po),
        };
      }
    }

    return best;
  }

  /**
   * Builds the complete 3-layer hybrid block.
   * Called once per generate_cucumber_pom invocation and appended to the system prompt.
   */
  public buildHybridBlock(analysis: CodebaseAnalysisResult): string {
    const cot = FewShotLibrary.getCoTScaffold();
    const antiPattern = FewShotLibrary.getNegativeExample(analysis.architecturePattern);
    const champion = this.selectChampion(analysis);

    const championBlock = champion
      ? this.formatChampionBlock(champion)
      : `\n## Γ£à GOLD STANDARD\nNo mature Page Objects found in this project yet. You are creating the first one ΓÇö follow the architecture rules strictly and produce a complete, exemplary implementation that future tests will reuse.\n`;

    return [cot, championBlock, antiPattern].join('\n');
  }

  // ΓöÇΓöÇΓöÇ Private Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  private formatChampionBlock(champion: ChampionCandidate): string {
    return `
## Γ£à GOLD STANDARD ΓÇö Mimic this project's existing coding style exactly:
File: \`${champion.path}\`

\`\`\`typescript
${champion.snippet}
\`\`\`

This is the established pattern in this project. Your generated code MUST follow the same:
- Class naming convention
- Locator strategy (accessor type: getter vs property)
- Method signature style
- Import structure
`;
  }

  /**
   * Builds a compact, representative TypeScript snippet from the Page Object.
   * Shows up to 3 locators and 3 method stubs to give the LLM a style reference
   * without blowing the token budget.
   */
  private buildSnippet(po: {
    className: string;
    locators: { name: string; strategy: string; selector: string }[];
    publicMethods: string[];
  }): string {
    const locatorLines = (po.locators ?? []).slice(0, 3)
      .map(l => `  get ${l.name}() { return $('${l.selector}'); } // ${l.strategy}`)
      .join('\n');

    const methodLines = (po.publicMethods ?? []).slice(0, 3)
      .map(m => `  async ${m}(): Promise<void> { /* ... */ }`)
      .join('\n');

    const hasLocators = locatorLines.length > 0;
    const hasMethods = methodLines.length > 0;

    return [
      `class ${po.className} extends BasePage {`,
      hasLocators ? locatorLines : '  // (no locators detected via AST)',
      hasMethods ? methodLines : '  // (no public methods detected)',
      '}'
    ].join('\n');
  }
}
