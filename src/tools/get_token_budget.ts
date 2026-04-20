import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TokenBudgetService } from "../services/config/TokenBudgetService.js";

export function registerGetTokenBudget(
  server: McpServer
): void {
  server.registerTool(
    "get_token_budget",
    {
      title: "Get Token Budget",
      description: `Returns estimated token usage for the current session. Use to check costs and identify token-heavy operations. Returns a formatted report with per-tool breakdown.

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      const report = TokenBudgetService.getInstance().getBudgetReport();
      return {
        content: [{ type: "text", text: report.formattedReport }]
      };
    }
  );
}
