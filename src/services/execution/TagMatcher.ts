import path from 'path';
import { SharedExecState } from './SharedExecState.js';



export class TagMatcher {
  constructor(protected state: SharedExecState, protected facade: any) { }

  get sessionManager() { return this.state.sessionManager; }
  get jobs() { return this.state.jobs; }

  /**
   * Validates Cucumber tag expression against an allowlist.
   * Issue #17: Prevent shell injection via unsanitised tags parameter.
   * Valid characters:
   * @ , alphanumeric, spaces, parentheses, logical operators (!, &, |, comma)
   */
  public validateTagExpression(tags: string): boolean {
    if (!tags || tags.trim() === '') return true;
    const allowedPattern = /^[@\w\s()!&|,]+$/;
    return allowedPattern.test(tags);
  }

  /**
   * Simple tag matching logic for preview mode.
   * Note: This is a simplified implementation and may not handle all complex tag expressions.
   */
  public matchesTags(scenarioTags: string, expression: string): boolean {
    if (!expression) return true;
    const availableTags = scenarioTags
      .split(/\s+/)
      .filter(t => t.startsWith('@'))
      .map(t => t.substring(1));
    const requiredTags = expression
      .split(/\s+/)
      .filter(t => t.startsWith('@'))
      .map(t => t.substring(1));
    return requiredTags.every(req => availableTags.includes(req));
  }

  /**
   * Counts the number of scenarios that match the given tag expression.
   * Used by preview mode to estimate test duration.
   */
  public async countScenarios(projectRoot: string, tags?: string): Promise<number> {
    const fs = await import('fs');
    const glob = await import('glob');
    const featuresPath = path.join(projectRoot, 'src', 'features');
    if (!fs.existsSync(featuresPath)) {
      return 0;
    }

    const featureFiles = glob.sync(path.join(featuresPath, '**', '*.feature'));
    let totalScenarios = 0;
    for (const file of featureFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
          // Check if tags match (simplified matching - looks for tags in preceding lines)
          if (!tags) {
            totalScenarios++;
          } else {
            // Look backwards for tags
            let tagLine = '';
            for (let j = i - 1; j >= 0; j--) {
              const prevLine = lines[j].trim();
              if (prevLine.startsWith('@')) {
                tagLine = prevLine + ' ' + tagLine;
              } else if (prevLine === '') {
                continue;
              } else {
                break;
              }
            }

            // Simple tag matching (doesn't handle complex expressions perfectly)
            if (this.matchesTags(tagLine, tags)) {
              totalScenarios++;
            }
          }
        }
      }
    }

    return totalScenarios;
  }
}