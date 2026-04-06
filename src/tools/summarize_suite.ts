import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { SummarySuiteService } from "../services/SummarySuiteService.js";
import { textResult } from "./_helpers.js";

export function registerSummarizeSuite(
  server: McpServer,
  configService: McpConfigService,
  summarySuiteService: SummarySuiteService
): void {
  server.registerTool(
    "summarize_suite",
    {
      title: "Summarize Suite",
      description: "TEST RUN SUMMARY. Use after run_cucumber_test or when the user asks 'what were the test results / how many passed'. Parses the Cucumber JSON report. Returns: { summary, totalScenarios, passed, failed, skipped, duration, failingScenarios[] }.",
      inputSchema: z.object({
        projectRoot: z.string(),
        reportFile: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      let reportDir = 'reports';
      let pt = await import('path');
      try {
        const config = configService.read(args.projectRoot);
        reportDir = configService.getReporting(config).outputDir;
      } catch { /* use default */ }

      const reportFile = args.reportFile
        ?? pt.join(reportDir, 'cucumber-report.json');

      const summary = await summarySuiteService.summarize(args.projectRoot, reportFile);
      const data = {
        summary: summary.plainEnglishSummary,
        total: summary.totalScenarios,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        duration: summary.duration,
        failedScenarios: summary.failedScenarios,
        hint: summary.failed > 0 ? "Call self_heal_test for any failing scenarios listed above." : "Tests passed."
      };
      return textResult(JSON.stringify(data, null, 2), data);
    }
  );
}
