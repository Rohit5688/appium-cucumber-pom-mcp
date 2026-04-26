import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/execution/SessionManager.js";
import { textResult } from "./_helpers.js";

export function registerGetSessionHealth(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "get_session_health",
    {
      title: "Get Session Health",
      description: `TRIGGER: When debugging session issues, checking connection state, or diagnosing unexpected failures.
RETURNS: { memory, uptime, deviceCaps, singletonPoolMetrics } — full session diagnostic snapshot.
NEXT: If unhealthy → call start_appium_session to reset | If healthy → continue test workflow.
COST: Low (reads in-memory session state, ~50-100 tokens)

GET SESSION METRICS. Use to debug session issues, check connection states, or view active Appium connections.

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      const metrics = sessionManager.getSessionHealthMetrics();
      return textResult(JSON.stringify(metrics, null, 2), metrics as any);
    }
  );
}
