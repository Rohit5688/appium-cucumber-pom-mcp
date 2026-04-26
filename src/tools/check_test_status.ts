import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/execution/ExecutionService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerCheckTestStatus(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "check_test_status",
    {
      title: "Check Test Status",
      description: `TRIGGER: Poll a running test job after run_cucumber_test.
RETURNS: { found, job: { jobId, status, startedAt, completedAt?, result? } }
NEXT: If status="running" → wait. If "completed"/"failed" → read result and call self_heal_test if needed.
COST: Low (~50-100 tokens per poll)
ERROR_HANDLING: Standard

⚙️ SERVER-SIDE SLEEP: When waitSeconds > 0 and the job is still running, the server will sleep that many seconds before responding — so a single call is efficient and won't spin-loop. Must stay under 55s per call.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({
        jobId: z.string().describe("The jobId returned by run_cucumber_test."),
        waitSeconds: z.number().min(0).max(55).default(0).describe(
          "Seconds to sleep server-side before responding if the job is still running. Max 55 (stays inside the 60s MCP socket window). Use 25-30 for typical Appium runs."
        )
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const waitMs = Math.round((args.waitSeconds ?? 0) * 1000);
      const response = await executionService.getTestStatus(args.jobId, waitMs);

      if (!response.found) {
        const data = {
          found: false,
          error: `No job found for jobId "${args.jobId}". Jobs are ephemeral — they're lost if the MCP server restarts. Call run_cucumber_test again to start a new job.`
        };
        return textResult(JSON.stringify(data, null, 2), data);
      }

      const { job } = response;

      // Provide a directed hint based on current status
      let hint: string;
      if (job.status === 'running') {
        const progressInfo = job.progress 
          ? ` (${job.progress.elapsedSeconds}s elapsed / ~${job.progress.estimatedTotal}s estimated)`
          : '';
        hint = `⏳ Test still running${progressInfo}. Call check_test_status again with waitSeconds: 25 to poll again.`;
      } else if (job.status === 'completed') {
        hint = job.result?.success
          ? "✅ Tests passed. Call summarize_suite to get the final report."
          : "❌ Tests completed with failures. Call self_heal_test with result.output to fix broken selectors.";
      } else {
        hint = "💥 Test job failed to run (infrastructure error — not a test failure). Check result.error for details.";
      }

      const data = {
        found: true,
        job: {
          jobId: job.jobId,
          status: job.status,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          result: job.result
        },
        hint
      };

      return textResult(truncate(JSON.stringify(data, null, 2), "call again to poll"), data);
    }
  );
}
