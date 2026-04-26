import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/execution/SessionManager.js";
import { textResult } from "./_helpers.js";

export function registerEndAppiumSession(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "end_appium_session",
    {
      title: "End Appium Session",
      description: `TRIGGER: Disconnect from device after inspection or live testing.
RETURNS: Confirmation of session termination.
NEXT: Continue planning or exit.
COST: Low (~50 tokens)
ERROR_HANDLING: Standard

Terminates the active Appium session and frees the device. No args needed.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (<= 10 words), then proceed to next step.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (_args) => {
      await sessionManager.endAllSessions();
      return textResult('Appium sessions terminated.');
    }
  );
}
