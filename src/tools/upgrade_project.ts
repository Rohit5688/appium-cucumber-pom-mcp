import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectMaintenanceService } from "../services/ProjectMaintenanceService.js";
import type { McpConfigService } from "../services/McpConfigService.js";
import { textResult } from "./_helpers.js";

export function registerUpgradeProject(
  server: McpServer,
  projectMaintenanceService: ProjectMaintenanceService,
  configService: McpConfigService
): void {
  server.registerTool(
    "upgrade_project",
    {
      title: "Upgrade Project",
      description: "UPGRADE EXISTING PROJECT. Use when the user says 'update dependencies / upgrade the project / it is outdated'. Upgrades npm packages, migrates mcp-config.json, repairs missing files, and reports utility coverage gaps. Safe to re-run — never overwrites custom code. Returns: upgrade log with warnings.",
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const upgradeResult = await projectMaintenanceService.upgradeProject(args.projectRoot);
      configService.migrateIfNeeded(args.projectRoot);
      return textResult(upgradeResult);
    }
  );
}
