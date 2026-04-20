import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CoverageAnalysisService } from "../services/analysis/CoverageAnalysisService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError, McpErrorCode, toMcpErrorResponse } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerAnalyzeCoverage(
  server: McpServer,
  coverageAnalysisService: CoverageAnalysisService
): void {
  server.registerTool(
    "analyze_coverage",
    {
      title: "Analyze Coverage",
      description: `TRIGGER: User says 'what screens not tested / find coverage gaps / missing scenarios'
RETURNS: { report: string, prompt: string, gaps: Array<{screen, missingScenarios[]}> }
NEXT: Use prompt for generate_cucumber_pom to create missing tests
COST: Medium (parses all .feature files, ~200-400 tokens)
ERROR_HANDLING: None - always succeeds, may return empty gaps if full coverage.

Parses .feature files to identify untested screens and missing edge cases.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        featureFilesPaths: z.array(z.string())
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => {
          const report = coverageAnalysisService.analyzeCoverage(args.projectRoot, args.featureFilesPaths);
          const prompt = coverageAnalysisService.getCoveragePrompt(report);
          return textResult(JSON.stringify({ report, prompt }, null, 2));
        });
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          const details = {
            question: err.question,
            context: err.context,
            options: err.options ?? []
          };
          const mcpErr = new McpError('CLARIFICATION_REQUIRED', McpErrorCode.INVALID_PARAMETER, { toolName: 'analyze_coverage', cause: new Error(JSON.stringify(details)) });
          return toMcpErrorResponse(mcpErr, 'analyze_coverage');
        }
        return toMcpErrorResponse(err, 'analyze_coverage');
      }
    }
  );
}
