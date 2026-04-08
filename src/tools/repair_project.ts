import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectMaintenanceService } from "../services/ProjectMaintenanceService.js";
import { textResult } from "./_helpers.js";

export function registerRepairProject(
  server: McpServer,
  projectMaintenanceService: ProjectMaintenanceService
): void {
  server.registerTool(
    "repair_project",
    {
      title: "Repair Project",
      description: `REPAIR MISSING FILES. Use when setup was interrupted or files were accidentally deleted. Regenerates ONLY missing baseline files — never overwrites existing custom code. Safe to run at any time. Returns: list of files regenerated.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios", "both"]).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => textResult(await projectMaintenanceService.repairProject(args.projectRoot, args.platform))
  );
}
