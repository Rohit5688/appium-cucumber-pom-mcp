import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EnvironmentCheckService } from "../services/EnvironmentCheckService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerCheckEnvironment(
  server: McpServer,
  environmentCheckService: EnvironmentCheckService
): void {
  server.registerTool(
    "check_environment",
    {
      title: "Check Environment",
      description: "PRE-FLIGHT CHECK. Use when the user says 'is my environment ready / why isn't Appium connecting / tests won't start / check my setup'. Verifies the entire Appium stack: Node.js, Appium server, drivers, Android SDK, Xcode, connected device/emulator, app binary, node_modules, and mcp-config.json. Returns: { summary, ready, failCount, warnCount }.",
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
      const hint = report.ready ? "✅ Environment ready. Call setup_project to scaffold your tests." : "❌ Environment issues found. Fix the failures before continuing.";
      const body = truncate(JSON.stringify({ summary: report.summary, data: { ready: report.ready, failCount, warnCount }, hint }, null, 2));
      return textResult(body, {
        summary: report.summary,
        ready: report.ready,
        failCount: report.checks.filter((c: any) => c.status === 'fail').length,
        warnCount: report.checks.filter((c: any) => c.status === 'warn').length
      });
    }
  );
}
