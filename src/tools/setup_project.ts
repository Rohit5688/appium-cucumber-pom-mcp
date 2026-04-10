import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectSetupService } from "../services/ProjectSetupService.js";
import type { McpConfigService } from "../services/McpConfigService.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerSetupProject(
  server: McpServer,
  projectSetupService: ProjectSetupService,
  configService: McpConfigService
): void {
  server.registerTool(
    "setup_project",
    {
      title: "Setup Project",
      description: `FIRST-TIME SETUP. Use when starting a brand-new mobile automation project. TWO-PHASE PROCESS:

PHASE 1: First call creates mcp-config.json template with CONFIGURE_ME placeholders. STOP and wait for user to manually fill required fields.

PHASE 2: Second call (after user fills config) scaffolds the complete project structure: BasePage, Cucumber feature, step definitions, wdio config, and hooks.

DO NOT call manage_config between phases - it would overwrite the user's manual edits. Only call setup_project again after user confirms they've edited mcp-config.json.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then WAIT for user confirmation before proceeding.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios", "both"]).optional(),
        appName: z.string().optional(),
        preview: z.boolean().optional().describe("When true, shows the file structure that would be created without writing.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const platform = args.platform ?? 'android';
      const appName = args.appName ?? 'MyApp';

      // PREVIEW: show file structure without writing
      if (args.preview) {
        const preview = await projectSetupService.previewSetup(args.projectRoot, platform, appName);
        try {
          const parsed = typeof preview === 'string' ? JSON.parse(preview) : preview;
          return textResult(JSON.stringify({
            preview: true,
            ...parsed,
            hint: '✅ Preview complete. Set preview:false to execute.'
          }, null, 2));
        } catch (e) {
          return textResult(JSON.stringify({
            preview: true,
            result: preview,
            hint: '✅ Preview complete. Set preview:false to execute.'
          }, null, 2));
        }
      }

      const result = await projectSetupService.setup(args.projectRoot, platform, appName);

      // Parse the result to determine which phase completed
      let parsedResult: any;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        // If parsing fails, return the raw result
        return textResult(result);
      }

      // Only migrate config if Phase 2 completed successfully
      if (parsedResult.phase === 2 && parsedResult.status === 'SETUP_COMPLETE') {
        configService.migrateIfNeeded(args.projectRoot);
        // Ensure the JSON schema exists for IDE autocompletion (idempotent, best-effort)
        try {
          // ensureSchema is a thin, safe wrapper; migrateIfNeeded also generates schema,
          // but calling ensureSchema here guarantees the file after scaffolding.
          (configService as any).ensureSchema(args.projectRoot);
        } catch {
          // best-effort: do not fail setup if schema generation fails
        }
      }

      // Return appropriate message based on phase
      if (parsedResult.phase === 1) {
        // Phase 1: Template created, user needs to fill it manually
        // Surface structured error so caller knows manual action is required before Phase 2
        const detail = parsedResult.message || 'Phase 1 created mcp-config.json. Fill required fields and re-run setup_project for Phase 2.';
        throw McpErrors.projectValidationFailed(detail, 'setup_project');
      } else if (parsedResult.phase === 2 && parsedResult.status === 'SETUP_COMPLETE') {
        // Phase 2: Full setup complete
        return textResult(result);
      } else {
        // Phase 2 with errors (missing required fields, parse errors) — surface as validation failure
        const detail = parsedResult.message || result;
        throw McpErrors.projectValidationFailed(detail, 'setup_project');
      }
    }
  );
}
