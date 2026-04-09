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
      description: `RUN TESTS. Use when the user says 'run my tests / execute / run @smoke'. Executes the Appium Cucumber suite. Auto-detects execution command from mcp-config.json. Supports Cucumber tag expressions and platform filtering.

🚀 ASYNC MODE (default): Returns immediately with { status: "started", jobId } — then call check_test_status with that jobId to poll results. This prevents MCP client timeout on long-running Appium boots (70-120s). Pass runAsync: false to block (only safe for <30s runs).

Returns: { status, jobId } on async start, or { success, output, stats, reportPath } on sync completion. After getting results, pass output to self_heal_test if tests failed.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        tags: z.string().optional().describe("Cucumber tag expression, e.g. '@smoke' or '@login and @android'"),
        platform: z.enum(["android", "ios"]).optional(),
        specificArgs: z.string().optional(),
        overrideCommand: z.string().optional(),
        timeoutMs: z.number().optional().describe("Execution timeout in milliseconds. Default: 7200000 (2 hours). Max: 14400000 (4 hours)."),
        runAsync: z.boolean().default(true).describe("When true (default), fires execution in background and returns a jobId immediately. Use check_test_status to poll results. Set false only for very short runs (<30s).")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const runOptions = {
        tags: args.tags,
        platform: args.platform,
        specificArgs: args.specificArgs,
        overrideCommand: args.overrideCommand,
        timeoutMs: args.timeoutMs ?? 7200000
      };

      // Async mode: fire-and-forget, return jobId immediately (avoids 60s MCP client socket timeout)
      if (args.runAsync !== false) {
        const jobId = executionService.runTestAsync(args.projectRoot, runOptions);
        const data = {
          status: "started",
          jobId,
          hint: "✅ Test job started. Call check_test_status with this jobId (suggest waitSeconds: 30) to poll for results. Appium typically needs 60-120s to boot and run a scenario."
        };
        return textResult(JSON.stringify(data, null, 2), data);
      }

      // Sync mode: await full execution (only safe for very short runs)
      const result = await executionService.runTest(args.projectRoot, runOptions);
      const hint = result.success
        ? "✅ All tests passed. Call summarize_suite to generate the final report."
        : "❌ Some tests failed. Call self_heal_test with the output to fix broken selectors.";
      const data = { ...result, hint };
      return textResult(truncate(JSON.stringify(data, null, 2), "use tags argument to scope the run"), data);
    }
  );
}
