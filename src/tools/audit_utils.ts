import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UtilAuditService } from "../services/audit/UtilAuditService.js";
import { textResult } from "./_helpers.js";

export function registerAuditUtils(
  server: McpServer,
  utilAuditService: UtilAuditService
): void {
  server.registerTool(
    "audit_utils",
    {
      title: "Audit Utils",
      description: `TRIGGER: Check for missing Appium API surface wrappers.
RETURNS: Report of missing utils helper methods with count of implemented vs expected actions.
NEXT: Implement missing helpers → Ensure custom wrapper coverage.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Standard

Scans the utils layer to report missing helper methods. Custom-wrapper-aware.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        customWrapperPackage: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const result = await utilAuditService.audit(args.projectRoot, args.customWrapperPackage);
      const data = { msg: "🔧 Util coverage suggestions", ...result };
      return textResult(JSON.stringify(data, null, 2), data);
    }
  );
}
