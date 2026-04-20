import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectMaintenanceService } from "../services/setup/ProjectMaintenanceService.js";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerUpgradeProject(
  server: McpServer,
  projectMaintenanceService: ProjectMaintenanceService,
  configService: McpConfigService
): void {
  server.registerTool(
    "upgrade_project",
    {
      title: "Upgrade Project",
      description: `TRIGGER: User says 'update dependencies / upgrade project / outdated'
RETURNS: { log: string[], warnings: string[], packagesUpdated: number }
NEXT: Run npm install → check_environment to verify upgrade
COST: Medium (reads package.json, migrates config, ~200-400 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed if config invalid before upgrade.

Upgrades npm packages, migrates mcp-config.json, repairs missing files. Safe to re-run.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        preview: z.boolean().optional().describe(
          "When true, shows what files would be written and validation results without making changes."
        )
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      // PREVIEW MODE: Show what would change without modifying files
      if (args.preview) {
        try {
          configService.read(args.projectRoot);
        } catch (err: any) {
          const detail = `mcp-config.json is invalid or unreadable: ${err?.message || String(err)}`;
          throw McpErrors.projectValidationFailed(detail, 'upgrade_project');
        }
        const previewData = await projectMaintenanceService.upgradeProject(args.projectRoot, true);
        try {
          const parsed = typeof previewData === 'string' ? JSON.parse(previewData) : previewData;
          return textResult(JSON.stringify({
            preview: true,
            ...parsed,
            hint: '✅ Preview complete. Set preview:false to execute.'
          }, null, 2));
        } catch (e) {
          return textResult(JSON.stringify({
            preview: true,
            result: previewData,
            hint: '✅ Preview complete. Set preview:false to execute.'
          }, null, 2));
        }

      }
      // Validate mcp-config before attempting an upgrade. If config is invalid,
      // surface a structured MCP error so callers can act (don't proceed).
      try {
        configService.read(args.projectRoot);
      } catch (err: any) {
        const detail = `mcp-config.json is invalid or unreadable: ${err?.message || String(err)}`;
        throw McpErrors.projectValidationFailed(detail, 'upgrade_project');
      }

      const upgradeResult = await projectMaintenanceService.upgradeProject(args.projectRoot);
      configService.migrateIfNeeded(args.projectRoot);
      return textResult(upgradeResult);

    }
  );
}
