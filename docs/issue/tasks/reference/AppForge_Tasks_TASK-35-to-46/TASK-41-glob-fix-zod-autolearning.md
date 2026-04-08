# TASK-41 — Glob Exclusions + Zod Validation + Auto-Learning (TASK-27 Phase 1)

**Status**: DONE
**Effort**: Medium (~60 min)
**Depends on**: TASK-38 must be DONE (Zod schemas live in registerTool calls)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Three independent improvements. Each is small. Do them in the order listed.

---

## Fix 1 — YAML Glob Exclusions in `TestGenerationService`

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

**Problem**: The YAML locator file discovery runs `**/*.yaml` against `projectRoot`
and sweeps in Python `.venv` packages, `node_modules`, and other irrelevant
directories, flooding the generation prompt with garbage data.

**Fix**: Find every `glob.sync(` or equivalent recursive file search for
`.yaml` / `.yml` files in `TestGenerationService.ts`. Add exclusions:

```typescript
// BEFORE (any variation of this pattern):
const yamlFiles = glob.sync('**/*.yaml', { cwd: projectRoot });

// AFTER:
const yamlFiles = glob.sync('**/*.yaml', {
  cwd: projectRoot,
  ignore: [
    '**/node_modules/**',
    '**/.venv/**',
    '**/dist/**',
    '**/.AppForge/**',
    '**/crew_ai/**',
    '**/__pycache__/**'
  ]
});
```

Also fix any `pagesDir` path resolution that doesn't match the actual location.
If `config.paths.pagesRoot` points to a non-existent directory, fall back to
auto-detection:

```typescript
private resolvePagesDir(projectRoot: string, configuredPath: string): string {
  const configured = path.join(projectRoot, configuredPath);
  if (fs.existsSync(configured)) return configured;

  // Auto-detect
  for (const candidate of ['src/pages', 'pages', 'src/pageObjects', 'test/pages']) {
    const full = path.join(projectRoot, candidate);
    if (fs.existsSync(full) && fs.readdirSync(full).some(f => f.endsWith('.ts'))) {
      console.warn(`[AppForge] ⚠️ pagesRoot "${configuredPath}" not found. Using detected: ${candidate}`);
      return full;
    }
  }
  return configured;
}
```

---

## Fix 2 — Auto-Learning in `verify_selector`

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

**Problem**: `verify_selector` only auto-learns when both `projectRoot` AND
`oldSelector` are explicitly passed. Engineers forget to pass these. The auto-learn
should trigger whenever the selector works, storing the successful selector for
future reference.

**Fix**: Find the `verify_selector` `registerTool` handler (added in TASK-38).
The current logic:

```typescript
if (verification.exists && args.projectRoot && args.oldSelector) {
  this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
  (verification as any).note = "Success automatically learned to rule base.";
}
```

Update to log even without `oldSelector`, and always attempt to store:

```typescript
if (verification.exists && args.projectRoot) {
  if (args.oldSelector) {
    // Full heal: record the old→new mapping
    this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
    (verification as any).note = "Selector verified and heal automatically learned.";
  } else {
    // Partial: still log the verified selector for future reference
    console.log(`[AppForge] ✅ Selector verified: ${args.selector}`);
    (verification as any).note = "Selector verified. Pass oldSelector to record the full heal mapping.";
  }
}
```

---

## Fix 3 — UTF-8 Encoding in `TestGenerationService` Prompts

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

**Problem**: Unicode characters (`→`, `—`, `✅`) appear garbled in prompts on
some systems. Root cause: file reads without explicit encoding, or string
concatenation through Buffer operations.

**Fix**: Find every `fs.readFileSync(filePath)` call inside `TestGenerationService`
that doesn't specify encoding. Add `'utf8'`:

```typescript
// BEFORE:
const content = fs.readFileSync(filePath).toString();

// AFTER:
const content = fs.readFileSync(filePath, 'utf8');
```

Search for `readFileSync` in `TestGenerationService.ts` — ensure every call
has `'utf8'` or `{ encoding: 'utf8' }` as the second argument.

Also check any template literal that concatenates with Buffer — convert explicitly:
```typescript
// BEFORE:
const prompt = Buffer.from(templateContent) + userInput;

// AFTER:
const prompt = Buffer.from(templateContent).toString('utf8') + userInput;
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `glob.sync('**/*.yaml'` — must have `ignore` array with `node_modules`.
3. Search for `readFileSync(` in `TestGenerationService.ts` — every call must have `'utf8'`.
4. Search for `reportHealSuccess` in `verify_selector` handler — must be called when `verification.exists` is true.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] YAML glob excludes `node_modules`, `.venv`, `dist`, `.AppForge`, `crew_ai`
- [x] `pagesDir` auto-detection fallback added when configured path doesn't exist
- [x] `verify_selector` auto-logs on success even without `oldSelector`
- [x] All `readFileSync` calls in `TestGenerationService` specify `'utf8'` encoding
- [x] Change `Status` above to `DONE`
