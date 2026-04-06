# TASK-38 — SDK Migration Part 3: Migrate Tools 23–30 + Remove Old Handlers

**Status**: DONE
**Effort**: Medium (~60 min)
**Depends on**: TASK-37 must be DONE
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Final part of the SDK migration. Migrates the last 8 tools, then deletes the
old `setRequestHandler` blocks entirely. After this task, `ListToolsRequestSchema`
and `CallToolRequestSchema` imports can be removed if unused.

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

---

## What to Change

### Step 1 — Register the final 8 tools

**Tool 23: `export_bug_report`**
```typescript
this.server.registerTool(
  "export_bug_report",
  {
    title: "Export Bug Report",
    description: "GENERATE JIRA BUG REPORT. Use when a failed test needs to be tracked in a ticket. Formats the test failure into a Jira-ready report with auto-classified severity, reproduction steps, environment details, and suggested fix. Returns: Markdown ready to paste into Jira.",
    inputSchema: z.object({
      testName: z.string(),
      rawError: z.string(),
      platform: z.string().optional(),
      deviceName: z.string().optional(),
      appVersion: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => this.textResult(this.bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion))
);
```

**Tool 24: `generate_test_data_factory`**
```typescript
this.server.registerTool(
  "generate_test_data_factory",
  {
    title: "Generate Test Data Factory",
    description: "CREATE FAKE TEST DATA. Use when tests need realistic randomized data or the user says 'generate test data / mock data / create a data factory'. Returns a generation prompt to create a typed Faker.js factory.",
    inputSchema: z.object({
      entityName: z.string(),
      schemaDefinition: z.string()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => this.textResult(this.testDataService.generateDataFactoryPrompt(args.entityName, args.schemaDefinition))
);
```

**Tool 25: `request_user_clarification`**
```typescript
this.server.registerTool(
  "request_user_clarification",
  {
    title: "Request User Clarification",
    description: "ASK THE USER A QUESTION. Use ONLY when you cannot proceed and no reasonable assumption is possible. This halts the workflow and presents the question to the user. PREFER making a sensible default assumption over stopping. NEVER call this in a loop — if the user already answered, proceed. Returns: the question displayed to the user.",
    inputSchema: z.object({
      question: z.string(),
      context: z.string(),
      options: z.array(z.string()).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => this.textResult(
    `⚠️ SYSTEM HALT — HUMAN INPUT REQUIRED\n\n**Question**: ${args.question}\n\n**Context**: ${args.context}\n${args.options ? '\n**Options**:\n' + args.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n') : ''}\n\nPlease answer the question above before continuing.`
  )
);
```

**Tool 26: `analyze_coverage`**
```typescript
this.server.registerTool(
  "analyze_coverage",
  {
    title: "Analyze Coverage",
    description: "FIND MISSING TEST COVERAGE. Use when the user says 'what screens are not tested / find coverage gaps / what scenarios am I missing'. Parses .feature files to identify untested screens and missing edge cases. Returns: { report, prompt with suggestions }.",
    inputSchema: z.object({
      projectRoot: z.string(),
      featureFilesPaths: z.array(z.string())
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const report = this.coverageAnalysisService.analyzeCoverage(args.projectRoot, args.featureFilesPaths);
    const prompt = this.coverageAnalysisService.getCoveragePrompt(report);
    return this.textResult(JSON.stringify({ report, prompt }, null, 2));
  }
);
```

**Tool 27: `migrate_test`**
```typescript
this.server.registerTool(
  "migrate_test",
  {
    title: "Migrate Test",
    description: "CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping.",
    inputSchema: z.object({
      sourceCode: z.string(),
      sourceFileName: z.string(),
      sourceFramework: z.enum(["espresso", "xcuitest", "detox"]),
      sourceLanguage: z.enum(["java", "swift", "javascript"])
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => this.textResult(this.migrationService.generateMigrationPrompt(args.sourceCode, args.sourceFileName, { sourceFramework: args.sourceFramework, sourceLanguage: args.sourceLanguage }))
);
```

**Tool 28: `start_appium_session`**
```typescript
this.server.registerTool(
  "start_appium_session",
  {
    title: "Start Appium Session",
    description: "CONNECT TO DEVICE. Use when the user says 'connect to the device / start a session / inspect the app / I want to see what's on screen'. Connects to Appium and starts a session on the device in mcp-config.json. Returns: { sessionId, platform, device, hint }. After success, call inspect_ui_hierarchy with no args to see the current screen.",
    inputSchema: z.object({
      projectRoot: z.string(),
      profileName: z.string().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "start_appium_session": verbatim
  }
);
```

**Tool 29: `end_appium_session`**
```typescript
this.server.registerTool(
  "end_appium_session",
  {
    title: "End Appium Session",
    description: "DISCONNECT FROM DEVICE. Terminates the active Appium session and frees the device. Call when inspection or live testing is complete. No args needed. Returns: confirmation.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (_args) => {
    await this.appiumSessionService.endSession();
    return this.textResult('Appium session terminated.');
  }
);
```

**Tool 30: `verify_selector`**
```typescript
this.server.registerTool(
  "verify_selector",
  {
    title: "Verify Selector",
    description: "TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.",
    inputSchema: z.object({
      selector: z.string(),
      projectRoot: z.string().optional(),
      oldSelector: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => {
    const verification = await this.selfHealingService.verifyHealedSelector(args.selector);
    if (verification.exists && args.projectRoot && args.oldSelector) {
      this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
      (verification as any).note = "Success automatically learned to rule base.";
    }
    return this.textResult(JSON.stringify(verification, null, 2));
  }
);
```

**Tool 31: `workflow_guide`**
```typescript
this.server.registerTool(
  "workflow_guide",
  {
    title: "Workflow Guide",
    description: "START HERE IF UNSURE. Returns the recommended step-by-step tool call sequence for common AppForge tasks. Call this FIRST if you don't know which tool to use or how to start. No side effects — safe to call at any time. Returns: { workflows: { [name]: { description, steps[] } } }.",
    inputSchema: z.object({
      workflow: z.enum(["new_project", "write_test", "run_and_heal", "inspect_device", "all"]).optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "workflow_guide": verbatim
  }
);
```

---

### Step 2 — Delete the entire old `setRequestHandler` blocks

After all 30+ tools are registered, delete these two entire blocks from
`setupToolHandlers()`:

```typescript
// DELETE THIS ENTIRE BLOCK:
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...]
}));

// DELETE THIS ENTIRE BLOCK:
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    ...
    switch (request.params.name) {
      ...
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (err: any) {
    ...
  }
});
```

The error handling in the switch catch block needs to be preserved — move it into a
shared `safeHandler` wrapper or keep it inline in the tools that need it.

---

### Step 3 — Remove unused imports

At the top of `src/index.ts`, remove these imports if they are now unused:
```typescript
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
```

---

### Step 4 — Remove static `import('fs')` inside `generate_ci_workflow`

The handler for `generate_ci_workflow` uses dynamic imports:
```typescript
const fs = await import('fs');
const path = await import('path');
```

These should be static. Ensure `fs` and `path` are imported at the top of the file
(they almost certainly already are). Remove the dynamic imports inside the handler.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `setRequestHandler` — must return **zero** matches in `src/index.ts`.
3. Search for `ListToolsRequestSchema` — must return zero matches.
4. Count `registerTool(` — must equal 31 (tools 1–30 + `workflow_guide`).
5. Search for `import('fs')` — must return zero matches.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] Tools 23–31 registered with `registerTool()`
- [x] Both `setRequestHandler` blocks fully deleted
- [x] `ListToolsRequestSchema` and `CallToolRequestSchema` imports removed
- [x] Dynamic `import('fs')` / `import('path')` replaced with static imports
- [x] 31 total `registerTool()` calls in file (actually 32 as we migrated extract_navigation_map too)
- [x] Change `Status` above to `DONE`
