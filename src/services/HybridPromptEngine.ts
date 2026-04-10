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
   * Scoring:
   *   +10 per public method  (depth of implementation)
   *   +5  per locator        (locator coverage)
   *   -50 if ASTScrutinizer flagged this file (lazy/incomplete code)
   *
   * Returns null if no Page Objects exist.
   */
  public selectChampion(analysis: CodebaseAnalysisResult): ChampionCandidate | null {
    if (!analysis.existingPageObjects?.length) return null;

    let best: ChampionCandidate | null = null;
    let topScore = -Infinity;

    for (const po of analysis.existingPageObjects) {
      let score = 0;
      score += (po.publicMethods?.length ?? 0) * 10;
      score += (po.locators?.length ?? 0) * 5;

      // Penalise files that ASTScrutinizer flagged as containing lazy scaffolding
      const hasWarning = (analysis.warnings ?? []).some(w => w.includes(po.path));
      if (hasWarning) score -= 50;

      // Skip anonymous or trivially named objects (e.g. "AnonymousClass", "AnonymousObject")
      if (po.className.startsWith('Anonymous')) continue;

      if (score > topScore) {
        topScore = score;
        best = {
          path: po.path,
          className: po.className,
          score,
          snippet: this.buildSnippet(po)
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
