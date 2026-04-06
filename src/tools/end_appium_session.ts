import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/SessionManager.js";
import { textResult } from "./_helpers.js";

export function registerEndAppiumSession(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "end_appium_session",
    {
      title: "End Appium Session",
      description: "DISCONNECT FROM DEVICE. Terminates the active Appium session and frees the device. Call when inspection or live testing is complete. No args needed. Returns: confirmation.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (_args) => {
      await sessionManager.endAllSessions();
      return textResult('Appium sessions terminated.');
    }
  );
}
