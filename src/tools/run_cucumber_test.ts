import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/ExecutionService.js";
import { textResult, truncate } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";
import { ShellSecurityEngine } from "../utils/ShellSecurityEngine.js";
import { EnvironmentCheckService } from "../services/EnvironmentCheckService.js";

export function registerRunCucumberTest(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "run_cucumber_test",
    {
      title: "Run Cucumber Test",
      description: `TRIGGER: User says 'run tests / execute / run @smoke' OR after validate_and_write
RETURNS: Async: { status: "started", jobId } | Sync: { success, output, stats, reportPath }
NEXT: check_test_status with jobId (async) OR self_heal_test if failures OR summarize_suite for report
COST: High (runs full test suite, ~60-120s boot + test time, returns full output logs)
ERROR_HANDLING: Async mode prevents MCP timeout. Throws if mcp-config invalid or Appium unreachable.

🚀 ASYNC MODE (default): Returns jobId immediately. Use check_test_status(jobId, waitSeconds:30) to poll. Pass runAsync:false only for <30s runs.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        tags: z.string().optional().describe("Cucumber tag expression, e.g. '@smoke' or '@login and @android'"),
        platform: z.enum(["android", "ios"]).optional(),
        specificArgs: z.string().optional(),
        overrideCommand: z.string().optional(),
        timeoutMs: z.number().optional().describe("Execution timeout in milliseconds. Default: 7200000 (2 hours). Max: 14400000 (4 hours)."),
        runAsync: z.boolean().default(true).describe("When true (default), fires execution in background and returns a jobId immediately. Use check_test_status to poll results. Set false only for very short runs (<30s)."),
        preview: z.boolean().optional().describe("When true, shows what would be executed without running the tests. Returns command, scenario count, and estimated duration.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // PREVIEW MODE: Show what would be executed without running
      if (args.preview) {
        try {
          // Security validation: mirror runtime checks to prevent preview from accepting unsafe input
          if (args.tags) {
            const tagPattern = /^[@\w\s()!&|,]+$/;
            if (!tagPattern.test(args.tags)) {
              throw McpErrors.invalidParameter(
                'tags',
                'Invalid tag expression. Allowed characters: @, alphanumeric, spaces, parentheses, and logical operators (!, &, |, comma).',
                'run_cucumber_test'
              );
            }
          }
          if (args.specificArgs) {
            const specificArgsArr = args.specificArgs.split(/\s+/).filter(a => a.length > 0);
            const argsCheck = ShellSecurityEngine.validateArgs(specificArgsArr, 'run_cucumber_test');
            if (!argsCheck.safe) {
              throw McpErrors.shellInjectionDetected(
                ShellSecurityEngine.formatViolations(argsCheck),
                'run_cucumber_test'
              );
            }
          }
          if (args.overrideCommand) {
            const overrideArgs = args.overrideCommand.split(/\s+/).filter(a => a.length > 0);
            const overrideCheck = ShellSecurityEngine.validateArgs(overrideArgs, 'run_cucumber_test');
            if (!overrideCheck.safe) {
              throw McpErrors.shellInjectionDetected(
                ShellSecurityEngine.formatViolations(overrideCheck),
                'run_cucumber_test'
              );
            }
          }

          const command = await executionService.buildCommand(
            args.projectRoot,
            args.tags,
            args.platform
          );
          const estimatedScenarios = await executionService.countScenarios(
            args.projectRoot,
            args.tags
          );
          
          // Estimate duration: ~30s per scenario (conservative)
          const estimatedMinutes = Math.ceil((estimatedScenarios * 30) / 60);
          const estimatedDuration = estimatedMinutes < 1 
            ? '<1 minute' 
            : estimatedMinutes === 1 
              ? '~1 minute'
              : `~${estimatedMinutes} minutes`;
          
          const previewData = {
            preview: true,
            command,
            estimatedScenarios,
            estimatedDuration,
            effectiveTags: args.tags || 'all scenarios',
            platform: args.platform || 'from config',
            hint: '✅ Preview complete. Set preview:false to execute.'
          };
          
          return textResult(JSON.stringify(previewData, null, 2), previewData);
        } catch (err: any) {
          throw McpErrors.configValidationFailed(
            err.message || 'Failed to generate preview',
            'run_cucumber_test'
          );
        }
      }

      // ENVIRONMENT READINESS CHECK: Prevent wasting time on doomed runs
      // Check if the environment is ready before spawning a long-running test process
      const envCheckService = new EnvironmentCheckService();
      const platform = args.platform || 'android'; // Default fallback
      const envResult = await envCheckService.check(args.projectRoot, platform);
      
      if (!envResult.ready) {
        const issues = envResult.checks
          .filter((c: any) => c.status === 'fail')
          .map((c: any) => `  ❌ ${c.name}: ${c.message}`)
          .join('\n');
        
        throw McpErrors.projectValidationFailed(
          `Environment not ready for test execution:\n${issues}\n\n💡 Run check_environment for detailed diagnostics.`,
          'run_cucumber_test'
        );
      }

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

      if (!result.success) {
        // Include test output in the error details (truncate to keep payload small)
        const summary = truncate(JSON.stringify({ output: result.output, stats: result.stats }, null, 2));
        throw McpErrors.testExecutionFailed(summary, "run_cucumber_test");
      }

      const hint = "✅ All tests passed. Call summarize_suite to generate the final report.";
      const data = { ...result, hint };
      return textResult(truncate(JSON.stringify(data, null, 2), "use tags argument to scope the run"), data);
    }
  );
}
