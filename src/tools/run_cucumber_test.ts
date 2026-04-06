import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/ExecutionService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerRunCucumberTest(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "run_cucumber_test",
    {
      title: "Run Cucumber Test",
      description: "RUN TESTS. Use when the user says 'run my tests / execute / run @smoke'. Executes the Appium Cucumber suite. Auto-detects execution command from mcp-config.json. Supports Cucumber tag expressions and platform filtering. Returns: { success, output, stats, reportPath }. If tests fail, pass the output to self_heal_test.",
      inputSchema: z.object({
        projectRoot: z.string(),
        tags: z.string().optional(),
        platform: z.enum(["android", "ios"]).optional(),
        specificArgs: z.string().optional(),
        overrideCommand: z.string().optional(),
        timeoutMs: z.number().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const result = await executionService.runTest(args.projectRoot, {
        tags: args.tags,
        platform: args.platform,
        specificArgs: args.specificArgs,
        overrideCommand: args.overrideCommand,
        timeoutMs: args.timeoutMs
      });
      const hint = result.success
        ? "✅ All tests passed. Call summarize_suite to generate the final report."
        : "❌ Some tests failed. Call self_heal_test with the output to fix broken selectors.";
      const data = { ...result, hint };
      return textResult(truncate(JSON.stringify(data, null, 2), "use tags argument to scope the run"), data);
    }
  );
}
