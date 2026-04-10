import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PreFlightService } from "../services/PreFlightService.js";
import { SessionManager } from "../services/SessionManager.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerCheckAppiumReady(server: McpServer): void {
  server.registerTool(
    "check_appium_ready",
    {
      title: "Check Appium Ready",
      description: `Checks if Appium server is running and the current session is valid. Use this at the beginning of a test session to verify readiness before running tests.

NOTE: This tool surfaces failures by throwing McpErrors (e.g., appiumNotReachable or projectValidationFailed). Callers should catch exceptions rather than relying on returned JSON to detect failures.

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

      // If checks indicate Appium or session problems, throw structured McpError
      if (!report.allPassed) {
        // Use appiumNotReachable for Appium-specific failures, otherwise generic project validation
        const hasAppiumFailure = report.checks?.some((c: any) => c.name?.toLowerCase?.().includes('appium') && !c.passed && c.severity === 'error');
        if (hasAppiumFailure) {
          throw McpErrors.appiumNotReachable(appiumUrl, "check_appium_ready");
        }
        // Use human-readable formatted report as summary/details
        throw McpErrors.projectValidationFailed(formatted, "check_appium_ready");
      }
      
      return { content: [{ type: "text", text: formatted }] };
    }
  );
}
