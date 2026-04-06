# TASK-37 — SDK Migration Part 2: Migrate Tools 12–22 to `registerTool()`

**Status**: DONE
**Effort**: Medium (~60 min)
**Depends on**: TASK-36 must be DONE
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Continuation of the SDK migration. TASK-36 migrated tools 1–11. This task migrates
tools 12–22. The same rule applies: copy handler logic verbatim from the switch cases
— do NOT change any logic, only structure.

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

---

## What to Change

Add these 11 `registerTool()` calls inside `setupToolHandlers()`, after the 11 from
TASK-36. Then delete their corresponding switch cases.

---

**Tool 12: `inspect_ui_hierarchy`**
```typescript
this.server.registerTool(
  "inspect_ui_hierarchy",
  {
    title: "Inspect UI Hierarchy",
    description: "SEE WHAT'S ON SCREEN. Two modes: (1) NO ARGS — fetches live XML and screenshot from the active Appium session. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. (2) Pass xmlDump — parses offline with no session needed. Returns: { source, elements[], snapshot }. Use locatorStrategies to build accurate Page Object selectors.",
    inputSchema: z.object({
      xmlDump: z.string().optional(),
      screenshotBase64: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "inspect_ui_hierarchy": verbatim
  }
);
```

**Tool 13: `self_heal_test`**
```typescript
this.server.registerTool(
  "self_heal_test",
  {
    title: "Self Heal Test",
    description: "FIX BROKEN TESTS. Use when a test failure says 'element not found / no such element / selector not found'. Parses the error and current XML to find the correct replacement selector. Returns: { candidates[], promptForLLM }. After getting candidates, use verify_selector to confirm the best one works.",
    inputSchema: z.object({
      testOutput: z.string(),
      xmlHierarchy: z.string(),
      screenshotBase64: z.string().optional(),
      attempt: z.number().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "self_heal_test": verbatim
  }
);
```

**Tool 14: `set_credentials`**
```typescript
this.server.registerTool(
  "set_credentials",
  {
    title: "Set Credentials",
    description: "SAVE CREDENTIALS SECURELY. Stores cloud provider credentials, API keys, or service env vars in the project .env file. Use for BrowserStack, Sauce Labs, or any external service. Values stored in .env and excluded from git. Returns: confirmation of keys saved.",
    inputSchema: z.object({
      projectRoot: z.string(),
      credentials: z.record(z.string())
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => this.textResult(await this.credentialService.setEnv(args.projectRoot, args.credentials))
);
```

**Tool 15: `manage_users`**
```typescript
this.server.registerTool(
  "manage_users",
  {
    title: "Manage Users",
    description: "MANAGE TEST USERS. Use when the user wants to add or view test account credentials for different environments (staging, prod). Stores users with roles in users.{env}.json. Generates a typed getUser() helper. Returns: list of users on read, confirmation on write.",
    inputSchema: z.object({
      projectRoot: z.string(),
      operation: z.enum(["read", "write"]),
      env: z.string().optional(),
      users: z.array(z.object({
        username: z.string(),
        password: z.string(),
        role: z.string().optional()
      })).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => this.textResult(await this.credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users))
);
```

**Tool 16: `audit_mobile_locators`**
```typescript
this.server.registerTool(
  "audit_mobile_locators",
  {
    title: "Audit Mobile Locators",
    description: "LOCATOR HEALTH CHECK. Use when the user says 'check my locators / are my selectors stable / too many XPaths'. Scans Page Objects and YAML locator files. Flags XPath (❌ brittle), CSS class/ID (⚠️ fragile), accessibility-id (✅ stable). Returns a health report with per-file breakdown, health score percentage, and specific lines to fix.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const config = this.configService.read(args.projectRoot);
    const paths = this.configService.getPaths(config);
    const report = await this.auditLocatorService.audit(args.projectRoot, [paths.pagesRoot, 'locators', 'src/locators']);
    return this.textResult(report.markdownReport);
  }
);
```

**Tool 17: `summarize_suite`**
```typescript
this.server.registerTool(
  "summarize_suite",
  {
    title: "Summarize Suite",
    description: "TEST RUN SUMMARY. Use after run_cucumber_test or when the user asks 'what were the test results / how many passed'. Parses the Cucumber JSON report. Returns: { summary, totalScenarios, passed, failed, skipped, duration, failingScenarios[] }.",
    inputSchema: z.object({
      projectRoot: z.string(),
      reportFile: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "summarize_suite": verbatim
  }
);
```

**Tool 18: `check_environment`**
```typescript
this.server.registerTool(
  "check_environment",
  {
    title: "Check Environment",
    description: "PRE-FLIGHT CHECK. Use when the user says 'is my environment ready / why isn't Appium connecting / tests won't start / check my setup'. Verifies the entire Appium stack: Node.js, Appium server, drivers, Android SDK, Xcode, connected device/emulator, app binary, node_modules, and mcp-config.json. Returns: { summary, ready, failCount, warnCount }.",
    inputSchema: z.object({
      projectRoot: z.string(),
      platform: z.enum(["android", "ios", "both"]).optional(),
      appPath: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "check_environment": verbatim
  }
);
```

**Tool 19: `generate_ci_workflow`**
```typescript
this.server.registerTool(
  "generate_ci_workflow",
  {
    title: "Generate CI Workflow",
    description: "SET UP CI/CD PIPELINE. Use when the user says 'add GitHub Actions / create a CI pipeline / automate my test runs'. Generates a pre-configured workflow file for GitHub Actions or GitLab CI — reads deviceName, execution command, and report path from mcp-config.json automatically. Returns: file path and workflow content.",
    inputSchema: z.object({
      projectRoot: z.string(),
      provider: z.enum(["github", "gitlab"]),
      platform: z.enum(["android", "ios"]).optional(),
      nodeVersion: z.string().optional(),
      appiumVersion: z.string().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "generate_ci_workflow": verbatim
  }
);
```

**Tool 20: `train_on_example`**
```typescript
this.server.registerTool(
  "train_on_example",
  {
    title: "Train on Example",
    description: "TEACH A PROJECT RULE. Use when a generation was wrong and you know the correct pattern, or after fixing a broken selector. Saves the rule to .AppForge/mcp-learning.json. All future generate_cucumber_pom calls will incorporate it. Returns: confirmation with the rule ID.",
    inputSchema: z.object({
      projectRoot: z.string(),
      issuePattern: z.string(),
      solution: z.string(),
      tags: z.array(z.string()).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const rule = this.learningService.learn(args.projectRoot, args.issuePattern, args.solution, args.tags ?? []);
    return this.textResult(`✅ Learned rule "${rule.id}": When encountering "${rule.pattern}" → apply: ${rule.solution}`);
  }
);
```

**Tool 21: `export_team_knowledge`**
```typescript
this.server.registerTool(
  "export_team_knowledge",
  {
    title: "Export Team Knowledge",
    description: "EXPORT LEARNED RULES. Generates a human-readable Markdown table of all rules taught via train_on_example. Use to review what the AI knows about your project, onboard new team members, or audit the knowledge base. Returns: Markdown document with all learned rules.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => this.textResult(this.learningService.exportToMarkdown(args.projectRoot))
);
```

**Tool 22: `suggest_refactorings`**
```typescript
this.server.registerTool(
  "suggest_refactorings",
  {
    title: "Suggest Refactorings",
    description: "FIND CODE QUALITY ISSUES. Use when the user says 'clean up my test code / check for duplicate steps / is my code DRY'. Finds duplicate step definitions, potentially unused Page Object methods, and XPath over-usage percentage. Returns: { report, duplicateStepCount, unusedMethodCount, xpathOverusePercent }.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const config = this.configService.read(args.projectRoot);
    const paths = this.configService.getPaths(config);
    const analysis = await this.analyzerService.analyze(args.projectRoot, paths);
    return this.textResult(this.refactoringService.generateRefactoringSuggestions(analysis));
  }
);
```

---

### Remove migrated cases from switch statement

Delete these 11 cases from the existing switch:
- `case "inspect_ui_hierarchy":`
- `case "self_heal_test":`
- `case "set_credentials":`
- `case "manage_users":`
- `case "audit_mobile_locators":`
- `case "summarize_suite":`
- `case "check_environment":`
- `case "generate_ci_workflow":`
- `case "train_on_example":`
- `case "export_team_knowledge":`
- `case "suggest_refactorings":`

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Count `registerTool(` occurrences — must be 22 (11 from TASK-36 + 11 here).
3. None of the 11 case names above should appear in the switch statement.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] Tools 12–22 registered with `registerTool()` including Zod schemas and annotations
- [ ] Cases 12–22 removed from the switch statement
- [ ] No handler logic changed
- [ ] Change `Status` above to `DONE`
