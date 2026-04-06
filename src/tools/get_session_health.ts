import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/SessionManager.js";
import { textResult } from "./_helpers.js";

export function registerGetSessionHealth(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "get_session_health",
    {
      title: "Get Session Health",
      description: "GET SESSION METRICS. Use to debug session issues, check connection states, or view active Appium connections. Returns memory, uptime, device caps, and singleton pool metrics.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      const metrics = sessionManager.getSessionHealthMetrics();
      return textResult(JSON.stringify(metrics, null, 2), metrics as any);
    }
  );
}
