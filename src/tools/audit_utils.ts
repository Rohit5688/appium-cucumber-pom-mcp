import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { UtilAuditService } from "../services/UtilAuditService.js";
import { textResult } from "./_helpers.js";

export function registerAuditUtils(
  server: McpServer,
  utilAuditService: UtilAuditService
): void {
  server.registerTool(
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
      const result = await utilAuditService.audit(args.projectRoot, args.customWrapperPackage);
      const data = { msg: "🔧 Util coverage suggestions", ...result };
      return textResult(JSON.stringify(data, null, 2), data);
    }
  );
}
