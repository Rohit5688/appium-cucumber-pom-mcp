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
      description: `TRIGGER: Setup interrupted OR files accidentally deleted
RETURNS: { filesRegenerated: string[], skipped: string[] }
NEXT: check_environment to verify repair → Continue with workflow
COST: Low (checks file existence, writes missing files, ~100-200 tokens)
ERROR_HANDLING: None - always succeeds, regenerates only missing baseline files.

Regenerates ONLY missing baseline files. Never overwrites custom code. Safe to re-run.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios", "both"]).optional(),
        preview: z.boolean().optional().describe("When true, shows which baseline files would be regenerated without writing.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      // PREVIEW: return list of files that would be repaired without modifying disk
      if (args.preview) {
        const previewData = await projectMaintenanceService.repairProject(args.projectRoot, args.platform, true);
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
      const result = await projectMaintenanceService.repairProject(args.projectRoot, args.platform, false);
      return textResult(JSON.stringify(result, null, 2));
    }
  );
}
