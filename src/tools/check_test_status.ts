import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/ExecutionService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerCheckTestStatus(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "check_test_status",
    {
      title: "Check Test Status",
      description: `POLL A RUNNING TEST JOB. Use after run_cucumber_test returns a jobId to check whether the tests have finished.

How to use:
1. Call run_cucumber_test (returns { status: "started", jobId: "job_..." })
2. Call check_test_status with that jobId and waitSeconds: 30
3. If status is still "running", call again with waitSeconds: 25 (must stay under 55s per call)
4. When status is "completed" or "failed", read the result and call self_heal_test if needed

⚙️ SERVER-SIDE SLEEP: When waitSeconds > 0 and the job is still running, the server will sleep that many seconds before responding — so a single call is efficient and won't spin-loop.

Returns: { found, job: { jobId, status, startedAt, completedAt?, result? } }

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
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
        hint = "⏳ Test still running. Call check_test_status again with waitSeconds: 25 to poll again.";
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
