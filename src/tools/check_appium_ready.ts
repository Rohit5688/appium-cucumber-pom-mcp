import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PreFlightService } from "../services/PreFlightService.js";
import { SessionManager } from "../services/SessionManager.js";

export function registerCheckAppiumReady(server: McpServer): void {
  server.registerTool(
    "check_appium_ready",
    {
      title: "Check Appium Ready",
      description: `Checks if Appium server is running and the current session is valid. Use this at the beginning of a test session to verify readiness before running tests.

OUTPUT INSTRUCTIONS: Display the check results as-is.`,
      inputSchema: z.object({
        appiumUrl: z.string().optional().describe('Appium server URL (default: http://127.0.0.1:4723)'),
        projectRoot: z.string().optional().describe('Project root to check for active sessions')
      })
    },
    async (args) => {
      const appiumUrl = args.appiumUrl ?? "http://127.0.0.1:4723";
      const projectRoot = args.projectRoot ?? process.cwd();
      const preFlight = PreFlightService.getInstance();
      
      const sessionManager = SessionManager.getInstance();
      const sessionInfo = sessionManager.getSessionInfo(projectRoot);
      const sessionId = sessionInfo?.sessionId;
      
      const report = await preFlight.runChecks(appiumUrl, sessionId);
      const formatted = preFlight.formatReport(report);
      
      return { content: [{ type: "text", text: formatted }] };
    }
  );
}
