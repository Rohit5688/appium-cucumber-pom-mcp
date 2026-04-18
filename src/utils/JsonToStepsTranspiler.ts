/**
 * JsonToStepsTranspiler — Completion Token Efficiency Engine for AppForge
 *
 * Problem: Step definition files are ~60% boilerplate (imports, Given/When/Then,
 * POM instantiation). The LLM writes all of this as completion tokens.
 *
 * Solution: LLM outputs compact JSON describing ONLY the variable parts.
 * This transpiler generates the WDIO/Cucumber boilerplate automatically.
 */

export interface JsonStep {
  type: 'Given' | 'When' | 'Then';
  pattern: string;
  params?: string[];         // e.g. ["email: string", "password: string"]
  page?: string;             // POM class name, e.g. "LoginScreen"
  method?: string;           // method on above POM, e.g. "login"
  args?: string[];           // args to pass, e.g. ["email", "password"]
  body?: string[];           // raw body lines for complex steps (overrides page+method)
}

export interface JsonStepFile {
  path: string;
  pageImports: string[];     // POM class names to import
  steps: JsonStep[];
}

export class JsonToStepsTranspiler {
  /**
   * Transpiles a compact JSON step descriptor into a full wdio-cucumber
   * TypeScript step definition file.
   */
  public static transpile(stepFile: JsonStepFile, pagesDir = 'pages'): string {
    const lines: string[] = [];

    // ── Imports ──────────────────────────────────────────────────────────────
    lines.push("import { Given, When, Then } from '@wdio/cucumber-framework';");

    // Derive relative import paths
    const stepFileDepth = stepFile.path.split('/').length - 1;
    const relativePrefix = stepFileDepth > 1
      ? '../'.repeat(stepFileDepth - 1)
      : '../';

    for (const pageClass of stepFile.pageImports) {
      lines.push(`import { ${pageClass} } from '${relativePrefix}${pagesDir}/${pageClass}.js';`);
    }
    lines.push('');

    // ── Steps ─────────────────────────────────────────────────────────────────
    for (const step of stepFile.steps) {
      const stepFn = step.type; // Given | When | Then

      const fnParams = step.params && step.params.length > 0 ? step.params.join(', ') : '';

      lines.push(`${stepFn}(${JSON.stringify(step.pattern)}, async function(${fnParams}) {`);

      if (step.body && step.body.length > 0) {
        // Complex step: raw body provided by LLM
        for (const bodyLine of step.body) {
          lines.push(`  ${bodyLine}`);
        }
      } else if (step.page && step.method) {
        // Simple step: instantiate page object, call method
        const pageName = step.page;
        const varName = pageName.charAt(0).toLowerCase() + pageName.slice(1);
        lines.push(`  const ${varName} = new ${pageName}();`);
        const argsStr = step.args && step.args.length > 0 ? step.args.join(', ') : '';
        lines.push(`  await ${varName}.${step.method}(${argsStr});`);
      }

      lines.push('});');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Validates that a JSON step file descriptor is structurally sound.
   */
  public static validate(stepFile: JsonStepFile): string[] {
    const errors: string[] = [];

    if (!stepFile.path) errors.push('jsonSteps entry missing required field: path');
    if (!stepFile.steps || stepFile.steps.length === 0) {
      errors.push(`jsonSteps entry at "${stepFile.path}" has no steps`);
    }

    for (let i = 0; i < (stepFile.steps ?? []).length; i++) {
      const s = stepFile.steps[i]!;
      if (!['Given', 'When', 'Then'].includes(s.type)) {
        errors.push(`Step[${i}] at "${stepFile.path}" has invalid type: "${s.type as string}"`);
      }
      if (!s.pattern) {
        errors.push(`Step[${i}] at "${stepFile.path}" is missing a pattern`);
      }
      if (!s.body && !s.page) {
        errors.push(`Step[${i}] "${s.pattern}" must have either "page"+"method" or a "body" array`);
      }
      if (s.page && !s.method) {
        errors.push(`Step[${i}] "${s.pattern}" has "page" but is missing "method"`);
      }
    }

    return errors;
  }
}
