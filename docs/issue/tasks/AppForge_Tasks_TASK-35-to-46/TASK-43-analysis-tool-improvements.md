# TASK-43 — Analysis Tool Improvements: YAML Locators + Util Checklist + CI Generator

**Status**: DONE
**Effort**: Medium (~90 min)
**Depends on**: Nothing — standalone
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Three analysis tools return misleading output on real projects. All three have known
root causes and targeted fixes. Do them in order — each is independent.

---

## Fix 1 — `audit_mobile_locators`: Support YAML Locator Architecture

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\AuditLocatorService.ts`

**Problem**: The auditor only scans TypeScript Page Object files. Projects using
YAML locator files (selectors stored in `locators/*.yaml`) get 0 results.

**Step A** — Add architecture detection:

```typescript
private detectArchitecture(projectRoot: string, tsDirs: string[]): 'typescript' | 'yaml' | 'mixed' {
  const yamlSearchDirs = ['locators', 'src/locators', 'test/locators', 'resources'];
  const hasYaml = yamlSearchDirs.some(d => {
    const full = path.join(projectRoot, d);
    return fs.existsSync(full) &&
      fs.readdirSync(full).some(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  });
  const hasTs = tsDirs.some(d => {
    const full = path.join(projectRoot, d);
    return fs.existsSync(full) && fs.readdirSync(full).some(f => f.endsWith('.ts'));
  });
  if (hasYaml && hasTs) return 'mixed';
  if (hasYaml) return 'yaml';
  return 'typescript';
}
```

**Step B** — Add YAML parser:

```typescript
private parseYamlLocators(projectRoot: string): LocatorAuditEntry[] {
  const entries: LocatorAuditEntry[] = [];
  const searchDirs = ['locators', 'src/locators', 'test/locators'];

  for (const dir of searchDirs) {
    const fullDir = path.join(projectRoot, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = this.findFilesRecursive(fullDir, ['.yaml', '.yml'])
      .filter(f =>
        !f.includes('node_modules') &&
        !f.includes('.venv') &&
        !f.includes('crew_ai') &&
        !f.includes('dist')
      );

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w_]+)\s*:\s*["']?([^#\n'"]+?)["']?\s*(?:#.*)?$/);
        if (!match) continue;
        const [, name, selector] = match;
        const trimmed = selector.trim();
        if (!trimmed) continue;

        let strategy = 'unknown';
        let severity: 'ok' | 'warning' | 'critical' = 'ok';
        let recommendation = '';

        if (trimmed.startsWith('~')) {
          strategy = 'accessibility-id'; severity = 'ok';
          recommendation = '✅ Stable — accessibility-id is recommended';
        } else if (trimmed.startsWith('//') || trimmed.startsWith('(//')) {
          strategy = 'xpath'; severity = 'critical';
          recommendation = '❌ Replace XPath with accessibility-id (~) for stability';
        } else if (trimmed.includes(':id/')) {
          strategy = 'resource-id'; severity = 'warning';
          recommendation = '⚠️ Resource-id can break on app updates. Use accessibility-id where possible';
        } else if (trimmed.startsWith('-ios') || trimmed.startsWith('-android')) {
          strategy = 'mobile-selector'; severity = 'ok';
          recommendation = '✅ Mobile-selector strategies are acceptable';
        }

        if (strategy === 'unknown') continue;

        entries.push({
          file: path.relative(projectRoot, file),
          className: path.basename(file, path.extname(file)),
          locatorName: name,
          strategy,
          selector: trimmed,
          severity,
          recommendation
        });
      }
    }
  }
  return entries;
}
```

**Step C** — Update `audit()` to use both parsers:

```typescript
public async audit(projectRoot: string, dirs: string[] = []): Promise<LocatorAuditReport> {
  const arch = this.detectArchitecture(projectRoot, dirs);
  let allEntries: LocatorAuditEntry[] = [];

  if (arch === 'typescript' || arch === 'mixed') {
    allEntries.push(...await this.parseTypeScriptLocators(projectRoot, dirs));
  }
  if (arch === 'yaml' || arch === 'mixed') {
    allEntries.push(...this.parseYamlLocators(projectRoot));
  }

  // Build report from allEntries — same as existing logic
  // ...
}
```

---

## Fix 2 — `audit_utils`: Expand Hardcoded Checklist

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\UtilAuditService.ts`

**Problem**: Only 4 methods checked (`dragAndDrop`, `scrollIntoView`,
`assertScreenshot`, `handleOTP`). A real project with 34 utility files
showing "25% coverage" is meaningless.

**Fix**: Expand the checked methods to cover 20 essential categories:

```typescript
private readonly ESSENTIAL_APPIUM_METHODS = [
  // Gestures
  'tap', 'doubleTap', 'longPress', 'swipe', 'dragAndDrop', 'scroll', 'scrollIntoView',
  // Waits
  'waitForElement', 'waitForElementVisible', 'waitForElementClickable', 'waitForElementGone',
  // Assertions
  'assertText', 'assertVisible', 'assertScreenshot', 'assertElementExists',
  // Input
  'typeText', 'clearText', 'hideKeyboard',
  // Context
  'switchToWebView', 'switchToNativeApp',
  // Misc
  'handleOTP', 'takeScreenshot'
];
```

Also update the label in output:
```typescript
// BEFORE:
{ coveragePercent: 25, ... }

// AFTER — make it clear what this measures:
{
  checklistCoveragePercent: 45,
  checkedMethods: ESSENTIAL_APPIUM_METHODS,
  presentMethods: [...],
  missingMethods: [...],
  note: "Coverage is measured against a recommended checklist of core Appium utility patterns, not total method count."
}
```

---

## Fix 3 — `generate_ci_workflow`: Read Values from Config

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\CiWorkflowService.ts`

**Problem**: Device name, execution command, and report path are hardcoded
(`iPhone 14`, `npx cucumber-js`, `reports/`). They should come from
`mcp-config.json`.

The handler in `index.ts` already reads config before calling the service.
Verify these values are extracted and passed:

```typescript
// In the generate_ci_workflow handler:
const config = this.configService.read(args.projectRoot);

// Device name — read from first capabilities profile matching the platform
let deviceName = args.platform === 'ios' ? 'iPhone 14' : 'Pixel_6';
for (const profile of Object.values(config.mobile?.capabilitiesProfiles || {})) {
  const p = profile as any;
  if (p.platformName?.toLowerCase() === args.platform && p['appium:deviceName']) {
    deviceName = p['appium:deviceName'];
    break;
  }
}

// Execution command — read from config, fall back to wdio
const executionCommand = config.project?.executionCommand
  ?? `npx wdio run wdio.${args.platform ?? 'android'}.conf.ts`;

// Report path — read from config reporting section
const reportPath = config.reporting?.outputDir ?? '_results_/';

const workflow = this.ciWorkflowService.generate(args.provider, args.platform, {
  nodeVersion: args.nodeVersion,
  appiumVersion: args.appiumVersion,
  executionCommand,
  deviceName,
  reportPath
});
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Run `audit_mobile_locators` on a YAML-arch project — must return locator entries.
3. `audit_utils` output must contain `checklistCoveragePercent` and `note` field.
4. `generate_ci_workflow` output must use device name from mcp-config.json, not `iPhone 14`.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `audit_mobile_locators` detects and audits YAML locator files
- [x] YAML locator parser excludes `node_modules`, `.venv`, `crew_ai`
- [x] `audit_utils` checklist expanded to 20+ methods with clear coverage label
- [x] `generate_ci_workflow` reads device name, command, report path from config
- [x] Change `Status` above to `DONE`
