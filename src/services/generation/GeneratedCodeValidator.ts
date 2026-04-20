/**
 * GeneratedCodeValidator — lightweight structural validation for LLM-generated code.
 *
 * Design Principles:
 *  - NO external dependencies (no TypeScript compiler, no AST libraries).
 *  - Structural checks only: balanced braces, required imports, Given/When/Then presence.
 *  - Method resolution: detect method calls in step files that don't exist in page objects.
 *  - Never throws. Returns a typed ValidationResult for the caller to act on.
 *  - Token-efficient: fast regex path, no file I/O.
 *
 * NOT a replacement for tsc. This is a "fast pre-gate" — catches obvious failures
 * (missing imports, hallucinated methods, unbalanced code) before they reach the disk.
 */

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;            // Short code, e.g. 'MISSING_IMPORT'
  message: string;
}

export interface MethodResolutionResult {
  /** Methods called in step definitions that have no match in any page object */
  unresolved: Array<{ method: string; suggestion?: string }>;
  /** Methods confirmed to exist (in generated PO or existing POs) */
  resolved: string[];
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  methodResolution?: MethodResolutionResult;
  /** 0.0–1.0 composite quality score */
  score: number;
}

export interface ValidationInput {
  /** Generated step definition TypeScript source (may be empty string if not generated) */
  stepDefinitions: string;
  /** Generated page object TypeScript source (may be empty string if not generated) */
  pageObject: string;
  /** Public method names from all existing page objects in the project */
  existingPageObjectMethods?: string[];
}

export class GeneratedCodeValidator {

  /**
   * Entry point. Validates generated step definitions and page object code.
   * Safe: never throws. Returns ValidationResult with issues list.
   */
  public validate(input: ValidationInput): ValidationResult {
    const issues: ValidationIssue[] = [];

    // --- Step Definition Checks ---
    if (input.stepDefinitions.trim().length > 0) {
      this.checkBalancedBraces(input.stepDefinitions, 'stepDefinitions', issues);
      this.checkCucumberImport(input.stepDefinitions, issues);
      this.checkStepDecoratorPresence(input.stepDefinitions, issues);
      this.checkNoPlaywrightImport(input.stepDefinitions, issues);
    }

    // --- Page Object Checks ---
    if (input.pageObject.trim().length > 0) {
      this.checkBalancedBraces(input.pageObject, 'pageObject', issues);
      this.checkNoPlaywrightImport(input.pageObject, issues);
      this.checkAsyncAwaitConsistency(input.pageObject, issues);
      this.checkNoInlineDriverCalls(input.pageObject, issues);
    }

    // --- Method Resolution ---
    let methodResolution: MethodResolutionResult | undefined;
    if (input.stepDefinitions.trim().length > 0) {
      methodResolution = this.resolveMethodCalls(
        input.stepDefinitions,
        input.pageObject,
        input.existingPageObjectMethods ?? []
      );

      // Unresolved methods are warnings, not hard errors — the LLM may legitimately
      // create new methods that don't appear in the existing inventory snapshot.
      for (const u of methodResolution.unresolved) {
        const hint = u.suggestion ? ` Did you mean: "${u.suggestion}"?` : '';
        issues.push({
          severity: 'warning',
          code: 'UNRESOLVED_METHOD',
          message: `Method call "${u.method}" not found in any known Page Object.${hint}`,
        });
      }
    }

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    const score = Math.max(0, 1.0 - errors.length * 0.3 - warnings.length * 0.05);

    return {
      valid: errors.length === 0,
      issues,
      methodResolution,
      score,
    };
  }

  // ─── Structural Checks ────────────────────────────────────────────────────

  /**
   * Balanced brace check — catches truncated or malformed code blocks.
   * Ignores braces inside string literals and comments (simplified but sufficient).
   */
  private checkBalancedBraces(code: string, source: string, issues: ValidationIssue[]): void {
    let braces = 0;
    let parens = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString: string | null = null;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const next = code[i + 1] ?? '';

      // Track line comment
      if (!inString && !inBlockComment && ch === '/' && next === '/') {
        inLineComment = true;
      }
      if (inLineComment && ch === '\n') {
        inLineComment = false;
        continue;
      }
      if (inLineComment) continue;

      // Track block comment
      if (!inString && ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
      if (inBlockComment && ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
        continue;
      }
      if (inBlockComment) continue;

      // Track string literals (simplified — handles ' " ` but not escape sequences inside)
      if (!inString && (ch === "'" || ch === '"' || ch === '`')) {
        inString = ch;
        continue;
      }
      if (inString && ch === inString) {
        inString = null;
        continue;
      }
      if (inString) continue;

      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '(') parens++;
      else if (ch === ')') parens--;

      if (braces < 0 || parens < 0) {
        issues.push({
          severity: 'error',
          code: 'UNBALANCED_BRACES',
          message: `[${source}] Unexpected closing bracket/paren before matching open — code may be truncated.`,
        });
        return; // One unbalanced error per source is enough
      }
    }

    if (braces !== 0) {
      issues.push({
        severity: 'error',
        code: 'UNBALANCED_BRACES',
        message: `[${source}] Mismatched curly braces (net: ${braces > 0 ? '+' : ''}${braces}). Code block is incomplete.`,
      });
    }
    if (parens !== 0) {
      issues.push({
        severity: 'warning',
        code: 'UNBALANCED_PARENS',
        message: `[${source}] Mismatched parentheses (net: ${parens > 0 ? '+' : ''}${parens}).`,
      });
    }
  }

  /**
   * Verifies that step definitions import from @wdio/cucumber-framework.
   *
   * Appium 3 + WDIO v9 contract:
   *   - Given/When/Then/Before/After MUST come from '@wdio/cucumber-framework'
   *   - '@cucumber/cucumber' is bundled internally by @wdio/cucumber-framework;
   *     importing it directly causes version conflicts and is an architectural violation.
   */
  private checkCucumberImport(stepDefs: string, issues: ValidationIssue[]): void {
    const hasWdioImport = stepDefs.includes('@wdio/cucumber-framework');
    const hasDirectCucumberImport = stepDefs.includes('@cucumber/cucumber');

    if (!hasWdioImport && !hasDirectCucumberImport) {
      issues.push({
        severity: 'error',
        code: 'MISSING_IMPORT',
        message: 'Step definitions must import Given/When/Then from "@wdio/cucumber-framework" (Appium 3 / WDIO v9). No such import found.',
      });
    } else if (hasDirectCucumberImport && !hasWdioImport) {
      // Using the old direct import — treat as error in Appium 3 context
      issues.push({
        severity: 'error',
        code: 'WRONG_IMPORT_DIRECT',
        message:
          'Step definitions import from "@cucumber/cucumber" directly. ' +
          'With Appium 3 + WDIO v9, use "@wdio/cucumber-framework" instead. ' +
          '"@cucumber/cucumber" is bundled internally and must not be imported directly.',
      });
    }
    // hasWdioImport is the happy path — no issue emitted
  }

  /**
   * Verifies at least one Given/When/Then/And/But call exists in the step file.
   */
  private checkStepDecoratorPresence(stepDefs: string, issues: ValidationIssue[]): void {
    const stepPattern = /^(Given|When|Then|And|But)\s*\(/m;
    if (!stepPattern.test(stepDefs)) {
      issues.push({
        severity: 'error',
        code: 'NO_STEP_DEFINITIONS',
        message: 'Step definition file has no Given/When/Then/And/But calls. File appears empty or malformed.',
      });
    }
  }

  /**
   * Rejects Playwright imports — AppForge is Appium/WebdriverIO only.
   */
  private checkNoPlaywrightImport(code: string, issues: ValidationIssue[]): void {
    if (/from\s+['"]@playwright\/test['"]/m.test(code) || /require\(['"]@playwright/m.test(code)) {
      issues.push({
        severity: 'error',
        code: 'WRONG_FRAMEWORK',
        message: 'Generated code imports from "@playwright/test". This project uses Appium + WebdriverIO. Remove all Playwright imports.',
      });
    }
  }

  /**
   * Checks that methods using `await` are declared `async`.
   * Catches the "await without async" pattern.
   */
  private checkAsyncAwaitConsistency(code: string, issues: ValidationIssue[]): void {
    const awaitCount = (code.match(/\bawait\b/g) ?? []).length;
    const asyncCount = (code.match(/\basync\b/g) ?? []).length;

    if (awaitCount > 0 && asyncCount === 0) {
      issues.push({
        severity: 'error',
        code: 'AWAIT_WITHOUT_ASYNC',
        message: 'Page Object uses "await" but no methods are declared "async". All Appium interactions must be async.',
      });
    }
  }

  /**
   * Warns when Page Objects call driver directly ($(selector).click()) instead of ActionUtils.
   * This is an architectural violation in AppForge's POM pattern.
   */
  private checkNoInlineDriverCalls(pageObject: string, issues: ValidationIssue[]): void {
    // Match: $(selector).click() or $(selector).setValue() patterns inside class methods
    const inlineDriverPattern = /\$\s*\(\s*['"`~].+?['"`]\s*\)\s*\.\s*(click|setValue|clearValue|getText|getAttribute)\s*\(/g;
    if (inlineDriverPattern.test(pageObject)) {
      issues.push({
        severity: 'warning',
        code: 'INLINE_DRIVER_CALL',
        message: 'Page Object calls driver directly (e.g. $(selector).click()). Use ActionUtils.tap()/type() instead to follow the AppForge POM pattern.',
      });
    }
  }

  // ─── Method Resolution ────────────────────────────────────────────────────

  /**
   * Extracts `instance.method(` calls from step definitions and cross-references
   * them against the generated page object and the existing page object inventory.
   *
   * Strategy: "warn, don't block" — unresolved methods are warnings because
   * the generated page object may legitimately introduce new methods that are
   * correct but simply weren't in the pre-existing inventory.
   */
  private resolveMethodCalls(
    stepDefs: string,
    pageObjectCode: string,
    existingMethods: string[]
  ): MethodResolutionResult {
    // Extract instance.method( calls from step definitions
    const callPattern = /\bawait\s+\w+\.(\w+)\s*\(/g;
    const calls = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = callPattern.exec(stepDefs)) !== null) {
      if (m[1]) calls.add(m[1]);
    }

    // Collect all available methods
    const available = new Set<string>(existingMethods);

    // Extract methods from the newly generated page object
    const generatedMethodPattern = /\basync\s+(\w+)\s*\(/g;
    while ((m = generatedMethodPattern.exec(pageObjectCode)) !== null) {
      if (m[1]) available.add(m[1]);
    }

    const resolved: string[] = [];
    const unresolved: Array<{ method: string; suggestion?: string }> = [];

    for (const call of calls) {
      if (available.has(call)) {
        resolved.push(call);
      } else {
        const suggestion = this.findClosestMatch(call, [...available]);
        unresolved.push({ method: call, suggestion });
      }
    }

    return { unresolved, resolved };
  }

  /**
   * Finds the closest existing method name using a simple edit-distance heuristic.
   * Returns undefined if no close match found (distance > 2).
   */
  private findClosestMatch(target: string, candidates: string[]): string | undefined {
    let best: string | undefined;
    let bestDist = 3; // Only suggest if within 2 edits

    for (const c of candidates) {
      const d = this.levenshtein(target, c);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  /**
   * Standard Levenshtein distance. Capped at small strings for performance.
   * Input strings longer than 40 chars are considered too different to suggest.
   */
  private levenshtein(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 3) return 99;
    if (a.length > 40 || b.length > 40) return 99;

    const dp: number[][] = Array.from({ length: b.length + 1 }, (_, i) =>
      Array.from({ length: a.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        dp[i]![j] = b[i - 1] === a[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
    return dp[b.length]![a.length]!;
  }
}
