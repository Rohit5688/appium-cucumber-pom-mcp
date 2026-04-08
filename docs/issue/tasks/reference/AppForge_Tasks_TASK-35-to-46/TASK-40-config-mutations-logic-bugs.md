# TASK-40 — Config Mutations + Logic Bugs (TASK-32 Breakdown)

**Status**: DONE
**Effort**: Medium (~2 hours)
**Depends on**: Nothing — standalone, can run in parallel with SDK migration
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Six specific bugs from the production audit. Each is in a separate file and
can be fixed independently. Do them in the order listed — none depend on each other
but they are ordered from highest to lowest impact.

---

## Bug 1 — `McpConfigService.read()` mutates disk (AUDIT-02)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\McpConfigService.ts`

**Problem**: `read()` checks the config version and if it's old, calls `this.write()`
silently. So every read-only tool call mutates `mcp-config.json` on disk.

**Fix**: Find the version check inside `read()` that calls `this.write()`.
Remove it. Create a separate `migrateIfNeeded()` method:

```typescript
public migrateIfNeeded(projectRoot: string): void {
  const raw = this.readRaw(projectRoot);
  if (!raw.version || raw.version === '1.0.0') {
    raw.version = this.CURRENT_VERSION;
    this.write(projectRoot, raw);
    this.generateSchema(projectRoot);
  }
}
```

The `read()` method must call **only** `readRaw()` and return — never write.
`migrateIfNeeded()` is already called from `setup_project` and `upgrade_project`
handlers — that is the correct and only place it should run.

---

## Bug 2 — `manage_config` write uses shallow merge (AUDIT-01)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\McpConfigService.ts`

**Problem**: If this was not fixed by TASK-11, verify now. Search for:
```typescript
const newConfig = { ...existingConfig, ...config };
```
If found, it means TASK-11 was not applied. Replace with:
```typescript
const newConfig = McpConfigService.deepMerge(existingConfig, config);
```

And add the `deepMerge` static method if missing (the full implementation is in
TASK-11).

---

## Bug 3 — `run_cucumber_test` crashes when `project` key missing (Issue 10a)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\ExecutionService.ts`

**Problem**: `config?.project.executionCommand` throws TypeError when `project`
is undefined.

**Fix**: Find this line (approximate):
```typescript
} else if (config?.project.executionCommand) {
```

Replace with:
```typescript
} else if (config?.project?.executionCommand) {
```

One character change — add `?` before `.executionCommand`.

Also add smart fallback below it:
```typescript
} else {
  const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
    ? 'wdio.conf.ts'
    : fs.existsSync(path.join(projectRoot, 'wdio.conf.js'))
      ? 'wdio.conf.js'
      : null;
  if (defaultConf) {
    command = `npx wdio run ${defaultConf}`;
    console.warn(`[AppForge] ℹ️ No executionCommand configured — using detected: ${command}`);
  } else {
    throw new AppForgeError(
      ErrorCode.E008_PRECONDITION_FAIL,
      'No test execution command found.',
      ['Add "project": { "executionCommand": "npx wdio run wdio.conf.ts" } to mcp-config.json',
       'Or pass overrideCommand to run_cucumber_test']
    );
  }
}
```

---

## Bug 4 — `self_heal_test` missing `id=` prefix on resource-id selectors (AUDIT-10)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\SelfHealingService.ts`

**Problem**: When the healer finds a `resource-id` candidate, it returns the raw
attribute value (e.g. `com.app:id/login_button`) without the WebdriverIO
`id=` prefix, causing the selector to fail.

**Fix**: Find where `alternativeSelectors` or selector candidates are built from
XML attributes. When the strategy is `resource-id`, prepend `id=`:

```typescript
// When building selector candidates from parsed XML:
if (strategy === 'resource-id' && !selector.startsWith('id=')) {
  selector = `id=${selector}`;
}
```

Search for where `resourceId` or `resource-id` attributes are read from the XML
node and add this prefix guard.

---

## Bug 5 — `EnvironmentCheckService` JSON parse crash (AUDIT-12)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\EnvironmentCheckService.ts`

**Problem**: The Appium driver list check calls `JSON.parse()` on the output of
`appium driver list --installed --json`. If Appium prints warnings before the JSON
(common in some versions), the parse throws and the entire check crashes.

**Fix**: Find the `JSON.parse(stdout)` call for the driver check. Wrap it:

```typescript
try {
  const drivers = JSON.parse(stdout);
  // existing logic using drivers...
} catch (parseError) {
  // JSON parse failed — Appium may have printed warnings before JSON
  // Extract JSON by finding the first '[' or '{'
  const jsonStart = stdout.indexOf('[') !== -1
    ? stdout.indexOf('[')
    : stdout.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const drivers = JSON.parse(stdout.slice(jsonStart));
      // existing logic using drivers...
    } catch {
      checks.push({ name: 'Appium Drivers', status: 'warn', message: 'Could not parse driver list output.', fixHint: 'Run: appium driver list --installed' });
    }
  } else {
    checks.push({ name: 'Appium Drivers', status: 'warn', message: 'Could not parse driver list output.', fixHint: 'Run: appium driver list --installed' });
  }
}
```

---

## Bug 6 — `manage_users` writes helper to wrong directory (AUDIT-08)

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\CredentialService.ts`

**Problem**: The `getUser.ts` helper is written to a hardcoded `utils/` path
instead of the dynamic `paths.utilsRoot` from config.

**Fix**: Find where `getUser.ts` is written. The path currently uses something like:
```typescript
const helperPath = path.join(projectRoot, 'utils', 'getUser.ts');
```

Replace with:
```typescript
const config = this.configService.read(projectRoot);
const utilsRoot = config.paths?.utilsRoot ?? 'src/utils';
const helperPath = path.join(projectRoot, utilsRoot, 'getUser.ts');
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `this.write(` inside `read()` method of `McpConfigService` — must return zero.
3. Search for `config?.project.executionCommand` (without `?.`) — must return zero.
4. Search for `JSON.parse(stdout)` in `EnvironmentCheckService` — must be inside try/catch.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `read()` in `McpConfigService` never calls `write()` internally
- [x] `migrateIfNeeded()` method exists as standalone public method
- [x] `config?.project?.executionCommand` with optional chaining
- [x] Smart wdio fallback in execution service when no command configured
- [x] `id=` prefix applied to resource-id selector candidates in `SelfHealingService`
- [x] `JSON.parse` for Appium driver list wrapped in try/catch with fallback
- [x] `getUser.ts` written to `paths.utilsRoot` from config, not hardcoded `utils/`
- [x] Change `Status` above to `DONE`
