# TASK-42 — God Object Refactor: Split `index.ts` into `src/tools/`

**Status**: DONE
**Effort**: Large (~3 hours)
**Depends on**: TASK-38 must be DONE (all tools on registerTool pattern first)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

After TASK-36/37/38, `src/index.ts` has 31 `registerTool()` calls inline.
It's still a 1,300+ line file where finding "what does `run_cucumber_test` do"
requires scrolling past 30 unrelated tools. This task moves each tool into its
own file under `src/tools/`, leaving `index.ts` as a ~60-line wiring file.

**This is a pure structural refactor. Zero logic changes.**

---

## Target Structure

```
src/
  tools/
    setup_project.ts
    upgrade_project.ts
    repair_project.ts
    manage_config.ts
    inject_app_build.ts
    analyze_codebase.ts
    execute_sandbox_code.ts
    generate_cucumber_pom.ts
    audit_utils.ts
    validate_and_write.ts
    run_cucumber_test.ts
    inspect_ui_hierarchy.ts
    self_heal_test.ts
    set_credentials.ts
    manage_users.ts
    audit_mobile_locators.ts
    summarize_suite.ts
    check_environment.ts
    generate_ci_workflow.ts
    train_on_example.ts
    export_team_knowledge.ts
    suggest_refactorings.ts
    export_bug_report.ts
    generate_test_data_factory.ts
    request_user_clarification.ts
    analyze_coverage.ts
    migrate_test.ts
    start_appium_session.ts
    end_appium_session.ts
    verify_selector.ts
    workflow_guide.ts
  index.ts  ← 60 lines only
```

---

## What Each Tool File Looks Like

Each file exports a single function that calls `server.registerTool()`.
It receives the server instance and all services as parameters.

**Pattern (use for every tool file):**

```typescript
// src/tools/setup_project.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import type { ProjectSetupService } from "../services/ProjectSetupService.js";
import type { McpConfigService } from "../services/McpConfigService.js";

export function registerSetupProject(
  server: Server,
  projectSetupService: ProjectSetupService,
  configService: McpConfigService
): void {
  server.registerTool(
    "setup_project",
    {
      title: "Setup Project",
      description: "...",  // copy from current registerTool call in index.ts
      inputSchema: z.object({ ... }),  // copy from current registerTool call
      annotations: { ... }  // copy from current registerTool call
    },
    async (args) => {
      // copy handler body verbatim from index.ts
    }
  );
}
```

---

## Step-by-Step Instructions

### Step 1 — Create `src/tools/` directory

```bash
mkdir src/tools
```

### Step 2 — For each tool, create its file

Open `src/index.ts`. For each `registerTool()` call:

1. Create `src/tools/{tool_name}.ts` using the pattern above.
2. Import only the services that tool's handler actually uses.
3. Copy the `registerTool()` call (title, description, inputSchema, annotations,
   handler) into the export function — verbatim, no changes.
4. The handler references `this.xxxService` — replace with the parameter name
   (e.g. `this.projectSetupService` → `projectSetupService`).
5. The handler calls `this.textResult()` and `this.truncate()` — move these
   as standalone helper functions into a shared file:

```typescript
// src/tools/_helpers.ts
export function textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text" as const, text }] };
  if (structured) result.structuredContent = structured;
  return result;
}

const CHARACTER_LIMIT = 25_000;
export function truncate(text: string, tip?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const suffix = tip
    ? `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. Tip: ${tip}]`
    : `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars]`;
  return text.slice(0, CHARACTER_LIMIT) + suffix;
}
```

Import `textResult` and `truncate` from `_helpers.ts` in each tool file.

### Step 3 — Rewrite `src/index.ts` as a wiring file

After all 31 tool files are created, replace the body of `setupToolHandlers()`
with import + register calls:

```typescript
import { registerSetupProject } from "./tools/setup_project.js";
import { registerUpgradeProject } from "./tools/upgrade_project.js";
// ... 29 more imports

private setupToolHandlers() {
  registerSetupProject(this.server, this.projectSetupService, this.configService);
  registerUpgradeProject(this.server, this.projectMaintenanceService, this.configService);
  // ... 29 more register calls
  this.server.onerror = (error) => console.error("[MCP Error]", error);
}
```

`index.ts` should end up ~80 lines: imports, class with service instantiation,
`setupToolHandlers()` that calls register functions, and `run()`.

---

## Do This in Batches

Split into 3 sub-sessions if needed. Each sub-session builds fine:

- **Sub-session A**: Create tool files for tools 1–11, update index.ts.
- **Sub-session B**: Create tool files for tools 12–22, update index.ts.
- **Sub-session C**: Create tool files for tools 23–31, finalize index.ts.

After each sub-session: `npm run build` must pass.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. `src/tools/` directory exists with 31 `.ts` files + `_helpers.ts`.
3. `src/index.ts` is under 100 lines.
4. Search for `registerTool(` in `src/index.ts` — must return **zero** matches.
5. Search for `registerTool(` in `src/tools/` — must return 31 matches.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `src/tools/` directory contains 31 tool files + `_helpers.ts`
- [ ] `src/index.ts` is under 100 lines
- [ ] No `registerTool` calls remain in `index.ts`
- [ ] All 31 tools still functional (same logic, just in separate files)
- [ ] `textResult()` and `truncate()` in `_helpers.ts` shared by all tool files
- [ ] Change `Status` above to `DONE`
