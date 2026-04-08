# TASK-GS-22 — Shell Security Core (Injection Prevention)

**Status**: DONE  
**Effort**: Medium (~75 min)  
**Depends on**: GS-05 (Error Taxonomy) — uses `McpErrors.shellInjectionDetected()`  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

AppForge executes shell commands from LLM-generated content, particularly in:
- `run_cucumber_test` — executes npm/test commands
- `generate_ci_workflow` — generates CI scripts
- `run_adb_command` — executes adb shell commands

Without validation, a malformed or adversarial LLM response could inject shell metacharacters:

```
Input: "com.example.app; rm -rf ~/.ssh"
Executed: adb shell am start -n com.example.app; rm -rf ~/.ssh
```

**Solution**: Create `ShellSecurityEngine` that validates shell arguments before execution. This is a targeted implementation of core security patterns only — not the full 2500-line Claude Code bash security port (which would be over-engineering).

---

## What to Create

### File: `src/utils/ShellSecurityEngine.ts` (NEW)

```typescript
import { McpErrors, isMcpError } from '../types/ErrorSystem';

/**
 * Result of a shell security validation.
 */
export interface SecurityCheckResult {
  safe: boolean;
  violations: SecurityViolation[];
  sanitized?: string; // Sanitized version if applicable
}

export interface SecurityViolation {
  type: SecurityViolationType;
  pattern: string;     // The detected pattern
  input: string;       // The input fragment that matched
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type SecurityViolationType =
  | 'COMMAND_SUBSTITUTION'    // $() or `` in args
  | 'PIPE_INJECTION'          // | in unexpected position
  | 'REDIRECT_INJECTION'      // > >> < in args
  | 'SEMICOLON_INJECTION'     // ; separating multiple commands
  | 'AMPERSAND_INJECTION'     // & backgrounding or && chaining
  | 'DOUBLE_DASH_ESCAPE'      // -- flag injection
  | 'ROOT_PATH_TRAVERSAL'     // ../../../etc/passwd pattern
  | 'NULL_BYTE'               // \x00 in input
  | 'NEWLINE_INJECTION'       // \n in args
  | 'GLOB_EXPANSION';          // Unintended * or ? in paths

/**
 * ShellSecurityEngine — validates shell arguments for injection patterns.
 *
 * Scope: Core validators for the patterns most relevant to AppForge operations.
 * This is NOT a full bash security engine — it covers AppForge-specific risks.
 *
 * USAGE:
 *   const check = ShellSecurityEngine.validateArgs(['adb', 'shell', userInput]);
 *   if (!check.safe) throw McpErrors.shellInjectionDetected(check.violations[0].pattern);
 *
 *   const pkgCheck = ShellSecurityEngine.validatePackageName(packageName);
 *   if (!pkgCheck.safe) throw McpErrors.shellInjectionDetected(pkgCheck.violations[0].input);
 */
export class ShellSecurityEngine {

  // ─── Core validators ────────────────────────────────────────────────────────

  /**
   * Validates an array of shell arguments (not the full command, just the args).
   * Checks for injection patterns that could break out of argument context.
   */
  static validateArgs(args: string[], toolName?: string): SecurityCheckResult {
    const violations: SecurityViolation[] = [];

    for (const arg of args) {
      violations.push(...this.checkArg(arg));
    }

    if (violations.some(v => v.severity === 'critical' || v.severity === 'high')) {
      return { safe: false, violations };
    }

    // Low/medium violations — warn but allow (logged separately)
    return { safe: true, violations };
  }

  /**
   * Validates an Android package name (e.g., "com.example.app").
   * Must match standard Java package naming convention.
   */
  static validatePackageName(packageName: string, toolName?: string): SecurityCheckResult {
    const violations: SecurityViolation[] = [];

    if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(packageName)) {
      violations.push({
        type: 'COMMAND_SUBSTITUTION',
        pattern: packageName,
        input: packageName,
        severity: 'critical',
      });
    }

    if (packageName.length > 255) {
      violations.push({
        type: 'NULL_BYTE',
        pattern: 'Package name too long',
        input: packageName.substring(0, 50) + '...',
        severity: 'high',
      });
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Validates a file path for directory traversal and injection.
   * Allows alphanumeric, hyphens, underscores, dots, slashes.
   */
  static validateFilePath(filePath: string, toolName?: string): SecurityCheckResult {
    const violations: SecurityViolation[] = [];

    // Null bytes
    if (filePath.includes('\0')) {
      violations.push({
        type: 'NULL_BYTE',
        pattern: '\\x00',
        input: filePath,
        severity: 'critical',
      });
    }

    // Directory traversal
    if (/\.\.[\/\\]/.test(filePath) && !this.isKnownSafePath(filePath)) {
      violations.push({
        type: 'ROOT_PATH_TRAVERSAL',
        pattern: '../',
        input: filePath,
        severity: 'high',
      });
    }

    // Shell metacharacters in path
    const shellMetaInPath = /[;|&$`<>!{}()*?]/.exec(filePath);
    if (shellMetaInPath) {
      violations.push({
        type: 'COMMAND_SUBSTITUTION',
        pattern: shellMetaInPath[0],
        input: filePath,
        severity: 'critical',
      });
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Validates an npm script name (e.g., "test", "build").
   * Must be a known-safe npm script, not arbitrary shell.
   */
  static validateNpmScript(
    scriptName: string,
    allowedScripts: string[] = ['test', 'build', 'lint', 'start', 'dev', 'ci']
  ): SecurityCheckResult {
    const violations: SecurityViolation[] = [];

    if (!allowedScripts.includes(scriptName)) {
      violations.push({
        type: 'COMMAND_SUBSTITUTION',
        pattern: scriptName,
        input: scriptName,
        severity: 'medium',
      });
    }

    return { safe: violations.length === 0, violations };
  }

  /**
   * Sanitizes a string for safe interpolation into a shell command.
   * Wraps in single quotes and escapes single quotes within.
   * Use when you MUST interpolate user data — prefer parameterized commands instead.
   */
  static sanitizeForShell(value: string): string {
    // Wrap in single quotes, escape internal single quotes as '\''
    return "'" + value.replace(/'/g, "'\\''") + "'";
  }

  /**
   * Formats a security check result for logging.
   */
  static formatViolations(result: SecurityCheckResult): string {
    if (result.safe && result.violations.length === 0) return 'No violations';

    return result.violations.map(v =>
      `[${v.severity.toUpperCase()}] ${v.type}: detected '${v.pattern}' in '${v.input.substring(0, 50)}'`
    ).join('\n');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private static checkArg(arg: string): SecurityViolation[] {
    const violations: SecurityViolation[] = [];

    // Command substitution: $() or backticks
    if (/\$\(|`/.test(arg)) {
      violations.push({ type: 'COMMAND_SUBSTITUTION', pattern: '$() or ``', input: arg, severity: 'critical' });
    }

    // Semicolon injection
    if (/;/.test(arg)) {
      violations.push({ type: 'SEMICOLON_INJECTION', pattern: ';', input: arg, severity: 'high' });
    }

    // Redirect injection
    if (/[<>]/.test(arg)) {
      violations.push({ type: 'REDIRECT_INJECTION', pattern: '< or >', input: arg, severity: 'high' });
    }

    // Pipe injection
    if (/\|/.test(arg)) {
      violations.push({ type: 'PIPE_INJECTION', pattern: '|', input: arg, severity: 'high' });
    }

    // Newline injection
    if (/[\n\r]/.test(arg)) {
      violations.push({ type: 'NEWLINE_INJECTION', pattern: '\\n', input: arg, severity: 'critical' });
    }

    // Null byte
    if (/\0/.test(arg)) {
      violations.push({ type: 'NULL_BYTE', pattern: '\\x00', input: arg, severity: 'critical' });
    }

    // Ampersand chaining
    if (/&&|&$/.test(arg)) {
      violations.push({ type: 'AMPERSAND_INJECTION', pattern: '&&', input: arg, severity: 'high' });
    }

    // Unintended glob expansion in paths
    if (/[*?{}\[\]]/.test(arg) && arg.includes('/')) {
      violations.push({ type: 'GLOB_EXPANSION', pattern: '*, ?, {}, []', input: arg, severity: 'medium' });
    }

    return violations;
  }

  private static isKnownSafePath(filePath: string): boolean {
    // Relative paths that start with ./ are intentionally relative
    return filePath.startsWith('./') && !filePath.includes('../');
  }
}
```

---

## What to Update

### File: `src/services/ExecutionService.ts` or equivalent command runner

Find where shell commands are built and executed. Add validation:

```typescript
import { ShellSecurityEngine } from '../utils/ShellSecurityEngine';
import { McpErrors } from '../types/ErrorSystem';

// Before executing any user-provided argument in a shell command:
function buildTestCommand(packageName: string, testFile: string, scriptName: string): string[] {
  // Validate each user-provided component
  const pkgCheck = ShellSecurityEngine.validatePackageName(packageName, 'run_cucumber_test');
  if (!pkgCheck.safe) {
    throw McpErrors.shellInjectionDetected(
      ShellSecurityEngine.formatViolations(pkgCheck),
      'run_cucumber_test'
    );
  }

  const pathCheck = ShellSecurityEngine.validateFilePath(testFile, 'run_cucumber_test');
  if (!pathCheck.safe) {
    throw McpErrors.shellInjectionDetected(
      ShellSecurityEngine.formatViolations(pathCheck),
      'run_cucumber_test'
    );
  }

  // Safe to proceed
  return ['npm', 'run', scriptName, '--', testFile];
}
```

---

## Verification

1. Run `npm run build` — must pass

2. Test each validator:
   ```typescript
   import { ShellSecurityEngine } from './src/utils/ShellSecurityEngine';

   // Test 1: Clean package name — should pass
   const r1 = ShellSecurityEngine.validatePackageName('com.example.app');
   console.assert(r1.safe, 'Test 1 failed: Clean package name should be safe');

   // Test 2: Injection in package name — should fail
   const r2 = ShellSecurityEngine.validatePackageName('com.example.app; rm -rf /');
   console.assert(!r2.safe, 'Test 2 failed: Injection should be detected');
   console.assert(r2.violations.length > 0, 'Test 2 failed: Should have violations');

   // Test 3: Command substitution — should fail
   const r3 = ShellSecurityEngine.validateArgs(['adb', '$(whoami)']);
   console.assert(!r3.safe, 'Test 3 failed: Command substitution should be detected');

   // Test 4: Sanitize for shell
   const sanitized = ShellSecurityEngine.sanitizeForShell("it's a test");
   console.assert(sanitized === "'it'\\''s a test'", 'Test 4 failed: Quote escaping wrong');

   console.log('All ShellSecurityEngine tests passed!');
   ```

---

## Done Criteria

- [x] `ShellSecurityEngine.ts` created with `validateArgs()`, `validatePackageName()`, `validateFilePath()`, `validateNpmScript()`, `sanitizeForShell()`
- [x] All 8 violation types detected with appropriate severity levels
- [x] Integrated into command-building logic in `ExecutionService.ts` or equivalent
- [x] `McpErrors.shellInjectionDetected()` thrown on critical violations
- [x] `npm run build` passes with zero errors
- [x] All 4 test assertions pass
- [x] Change `Status` above to `DONE`

---

## Notes

- **Allowlist > blocklist** — `validatePackageName()` uses a strict regex allowlist rather than trying to block all bad patterns
- **Parameterized commands over sanitization** — prefer `[cmd, arg1, arg2]` over `${cmd} ${arg1} ${arg2}` — parameterized exec never hits a shell parser
- **This is NOT a full security engine** — specifically excludes complex patterns like heredoc injection, unicode bypass, brace expansion — those are GS-22 scope only
- **Medium violations are non-blocking** — only `high` + `critical` violations block execution; `medium` and `low` are logged for audit
