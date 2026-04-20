import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentCheckService } from "../services/setup/EnvironmentCheckService.js";
import { textResult, truncate } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerCheckEnvironment(
  server: McpServer,
  environmentCheckService: EnvironmentCheckService
): void {
  server.registerTool(
    "check_environment",
    {
      title: "Check Environment",
      description: `TRIGGER: User says 'is environment ready / Appium not connecting / tests won't start / check setup'
RETURNS: { summary, ready, failCount, warnCount, checks: Array<{name, status, message}> }
NEXT: If ready → setup_project or start_appium_session | If not ready → Fix issues listed
COST: Medium (runs system checks: node, appium, SDK, devices, ~300-500 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed if environment not ready.

Verifies: Node.js, Appium server, drivers, Android SDK, Xcode, device/emulator, app binary, node_modules, mcp-config.json.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios", "both"]).optional(),
        appPath: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const report = await environmentCheckService.check(args.projectRoot, args.platform, args.appPath);
      const failCount = report.checks.filter((c: any) => c.status === 'fail').length;
      const warnCount = report.checks.filter((c: any) => c.status === 'warn').length;

      // Convert failures into structured McpError so the MCP layer can return a rich error
      if (!report.ready) {
        throw McpErrors.projectValidationFailed(report.summary, "check_environment");
      }

      const hint = "✅ Environment ready. Call setup_project to scaffold your tests.";
      const body = truncate(JSON.stringify({ summary: report.summary, data: { ready: report.ready, failCount, warnCount }, hint }, null, 2));
      return textResult(body, {
        summary: report.summary,
        ready: report.ready,
        failCount,
        warnCount
      });
    }
  );
}
