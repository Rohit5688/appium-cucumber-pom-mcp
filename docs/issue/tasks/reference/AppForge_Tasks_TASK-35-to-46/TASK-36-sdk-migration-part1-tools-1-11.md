# TASK-36 — SDK Migration Part 1: Migrate Tools 1–11 to `registerTool()`

**Status**: DONE
**Effort**: Medium (~60 min)
**Depends on**: TASK-35 should be DONE (truncation makes output safer during migration)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

AppForge uses the deprecated `setRequestHandler(ListToolsRequestSchema)` /
`setRequestHandler(CallToolRequestSchema)` pattern. The MCP SDK now requires
`server.registerTool()` exclusively. Without this migration, tool annotations,
`structuredContent`, and future SDK versions will not work.

This task migrates the **first 11 tools** only. Do NOT touch the remaining tools —
they are covered in TASK-37 and TASK-38. Do NOT change any handler logic.
This is a pure structural refactor.

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

---

## What to Change

### Step 1 — Add Zod import

At the top of `src/index.ts`, ensure this import exists:
```typescript
import { z } from "zod";
```

---

### Step 2 — Remove the old `ListToolsRequestSchema` handler

Find and **delete** the entire block:
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [ ... ]
}));
```

This block lists all tools as a big array. Delete the entire thing — it will be
replaced by individual `registerTool` calls.

---

### Step 3 — Start converting `CallToolRequestSchema` handler

Find the block:
```typescript
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments as any;
    switch (request.params.name) {
```

Leave this block in place for now. In TASK-38 (Part 3) you will delete it entirely
once all tools are migrated. For now, move tools OUT of it one by one.

---

### Step 4 — Register the first 11 tools using `registerTool()`

Add these registrations inside `setupToolHandlers()`, BEFORE the remaining
`setRequestHandler` call. Each block below is complete — copy exactly.

**Tool 1: `setup_project`**
```typescript
this.server.registerTool(
  "setup_project",
  {
    title: "Setup Project",
    description: "FIRST-TIME SETUP. Use when starting a brand-new mobile automation project. Call ONCE for a new empty directory. Scaffolds the complete structure: mcp-config.json, BasePage, Cucumber feature, step definitions, wdio config, and hooks. Returns: log of all files created. Next: use manage_config to configure your Appium capabilities.",
    inputSchema: z.object({
      projectRoot: z.string(),
      platform: z.enum(["android", "ios", "both"]).optional(),
      appName: z.string().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const platform = args.platform ?? 'android';
    const appName = args.appName ?? 'MyApp';
    const result = await this.projectSetupService.setup(args.projectRoot, platform, appName);
    this.configService.migrateIfNeeded(args.projectRoot);
    return this.textResult(`${result}\n\n✅ Project scaffolded. Next: use manage_config (operation: 'read') to review your capabilities, then start_appium_session to connect to your device.`);
  }
);
```

**Tool 2: `upgrade_project`**
```typescript
this.server.registerTool(
  "upgrade_project",
  {
    title: "Upgrade Project",
    description: "UPGRADE EXISTING PROJECT. Use when the user says 'update dependencies / upgrade the project / it is outdated'. Upgrades npm packages, migrates mcp-config.json, repairs missing files, and reports utility coverage gaps. Safe to re-run — never overwrites custom code. Returns: upgrade log with warnings.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => {
    const upgradeResult = await this.projectMaintenanceService.upgradeProject(args.projectRoot);
    this.configService.migrateIfNeeded(args.projectRoot);
    return this.textResult(upgradeResult);
  }
);
```

**Tool 3: `repair_project`**
```typescript
this.server.registerTool(
  "repair_project",
  {
    title: "Repair Project",
    description: "REPAIR MISSING FILES. Use when setup was interrupted or files were accidentally deleted. Regenerates ONLY missing baseline files — never overwrites existing custom code. Safe to run at any time. Returns: list of files regenerated.",
    inputSchema: z.object({
      projectRoot: z.string(),
      platform: z.enum(["android", "ios", "both"]).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => this.textResult(await this.projectMaintenanceService.repairProject(args.projectRoot, args.platform))
);
```

**Tool 4: `manage_config`**
```typescript
this.server.registerTool(
  "manage_config",
  {
    title: "Manage Config",
    description: "READ OR UPDATE PROJECT CONFIG. Use when the user wants to check or change Appium capabilities, device settings, app paths, or cloud provider. 'read' returns the full mcp-config.json. 'write' does a partial merge — only keys you provide are updated, all others are preserved. Returns: current config on read, updated confirmation on write.",
    inputSchema: z.object({
      projectRoot: z.string(),
      operation: z.enum(["read", "write"]),
      config: z.record(z.any()).optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    if (args.operation === "read") {
      return this.textResult(JSON.stringify(this.configService.read(args.projectRoot), null, 2));
    } else {
      this.configService.write(args.projectRoot, args.config);
      return this.textResult("Configuration updated successfully.");
    }
  }
);
```

**Tool 5: `inject_app_build`**
```typescript
this.server.registerTool(
  "inject_app_build",
  {
    title: "Inject App Build",
    description: "UPDATE APP FILE PATH. Use after a new build or when pointing to a different .apk/.ipa/.app file. Updates the app path in mcp-config.json for the specified platform. Set forceWrite: true for CI paths where the file does not exist locally yet. Returns: confirmation with the new path.",
    inputSchema: z.object({
      projectRoot: z.string(),
      platform: z.enum(["android", "ios"]),
      appPath: z.string(),
      forceWrite: z.boolean().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    this.configService.updateAppPath(args.projectRoot, args.platform, args.appPath, args.forceWrite);
    return this.textResult(`Updated ${args.platform} app path to: ${args.appPath}`);
  }
);
```

**Tool 6: `analyze_codebase`**
```typescript
this.server.registerTool(
  "analyze_codebase",
  {
    title: "Analyze Codebase",
    description: "⚠️ TOKEN-INTENSIVE — ONLY FOR TINY PROJECTS (<5 files). Reads every source file to extract existing steps, page objects, and utilities for reuse in code generation. For ANY real project, use execute_sandbox_code (Turbo Mode) instead — it uses 98% fewer tokens and returns only the data you request. Returns: { existingSteps[], existingPageObjects[], existingUtils[] }.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const config = this.configService.read(args.projectRoot);
    const paths = this.configService.getPaths(config);
    const result = await this.analyzerService.analyze(args.projectRoot, paths);
    return this.textResult(this.truncate(JSON.stringify(result, null, 2), "use execute_sandbox_code for targeted analysis"));
  }
);
```

**Tool 7: `execute_sandbox_code`**
```typescript
this.server.registerTool(
  "execute_sandbox_code",
  {
    title: "Execute Sandbox Code",
    description: "🚀 TURBO MODE — USE FOR ALL PROJECT ANALYSIS. Runs a JavaScript snippet in a secure V8 sandbox without reading entire files. Always prefer this over analyze_codebase for real projects. Available APIs: forge.api.analyzeCodebase(projectRoot), forge.api.runTests(projectRoot), forge.api.readFile({ filePath, projectRoot }), forge.api.getConfig(projectRoot). Use `return <value>` in your script.",
    inputSchema: z.object({
      script: z.string(),
      timeoutMs: z.number().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy the full execute_sandbox_code case body from the switch statement exactly
    // (the apiRegistry setup and executeSandbox call) — do not change any logic
    const v = this.validateArgs(args as any, ['script']);
    if (v) return v;
    // ... rest of existing sandbox handler body
  }
);
```

> ⚠️ For Tool 7, copy the full body from the `case "execute_sandbox_code":` block
> in the switch statement. Paste it as the handler body verbatim. Do not rewrite it.

**Tool 8: `generate_cucumber_pom`**
```typescript
this.server.registerTool(
  "generate_cucumber_pom",
  {
    title: "Generate Cucumber POM",
    description: "WRITE A NEW TEST. Use when the user asks to 'write a test / create a scenario / add automation for X'. Returns a generation PROMPT pre-loaded with your project's existing steps, page objects, and architecture pattern. Does NOT write files itself. After generating, call validate_and_write to save. Returns: generation prompt text.",
    inputSchema: z.object({
      projectRoot: z.string(),
      testDescription: z.string(),
      testName: z.string().optional(),
      screenXml: z.string().optional(),
      screenshotBase64: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "generate_cucumber_pom": verbatim
  }
);
```

**Tool 9: `audit_utils`**
```typescript
this.server.registerTool(
  "audit_utils",
  {
    title: "Audit Utils",
    description: "CHECK UTILITY COVERAGE. Use when the user asks 'what helpers are missing / check my utilities / what Appium methods are not wrapped'. Scans for implementations of essential Appium wrappers and reports gaps. Returns: { coveragePercent, missing[], actionableSuggestions[] }.",
    inputSchema: z.object({
      projectRoot: z.string(),
      customWrapperPackage: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    const result = await this.utilAuditService.audit(args.projectRoot, args.customWrapperPackage);
    return this.textResult(JSON.stringify({ msg: "🔧 Util coverage suggestions", ...result }, null, 2));
  }
);
```

**Tool 10: `validate_and_write`**
```typescript
this.server.registerTool(
  "validate_and_write",
  {
    title: "Validate and Write",
    description: "SAVE FILES TO DISK. Use after generate_cucumber_pom to write the generated test code. Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax first — returns errors instead of writing if validation fails. Use dryRun: true to preview validation without writing. Returns: validation result and list of written files.",
    inputSchema: z.object({
      projectRoot: z.string(),
      files: z.array(z.object({ path: z.string(), content: z.string() })),
      dryRun: z.boolean().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  async (args) => this.textResult(await this.fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun))
);
```

**Tool 11: `run_cucumber_test`**
```typescript
this.server.registerTool(
  "run_cucumber_test",
  {
    title: "Run Cucumber Test",
    description: "RUN TESTS. Use when the user says 'run my tests / execute / run @smoke'. Executes the Appium Cucumber suite. Auto-detects execution command from mcp-config.json. Supports Cucumber tag expressions and platform filtering. Returns: { success, output, stats, reportPath }. If tests fail, pass the output to self_heal_test.",
    inputSchema: z.object({
      projectRoot: z.string(),
      tags: z.string().optional(),
      platform: z.enum(["android", "ios"]).optional(),
      specificArgs: z.string().optional(),
      overrideCommand: z.string().optional(),
      timeoutMs: z.number().optional()
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => {
    // Copy full body from case "run_cucumber_test": verbatim
  }
);
```

---

### Step 5 — Remove migrated tools from the switch statement

After adding all 11 `registerTool()` calls, go into the existing
`setRequestHandler(CallToolRequestSchema, ...)` switch statement and **delete**
the following cases entirely:

- `case "setup_project":`
- `case "upgrade_project":`
- `case "repair_project":`
- `case "manage_config":`
- `case "inject_app_build":`
- `case "analyze_codebase":`
- `case "execute_sandbox_code":`
- `case "generate_cucumber_pom":`
- `case "audit_utils":`
- `case "validate_and_write":`
- `case "run_cucumber_test":`

Leave all other cases in the switch intact for TASK-37 and TASK-38.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `case "setup_project":` — must not exist.
3. Search for `registerTool("setup_project"` — must exist.
4. All 11 migrated tools must appear as `registerTool` calls.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `z` (Zod) imported at top of file
- [ ] Tools 1–11 registered with `registerTool()` including Zod schemas and annotations
- [ ] Cases 1–11 removed from the switch statement
- [ ] No handler logic changed — only structural migration
- [ ] Change `Status` above to `DONE`
