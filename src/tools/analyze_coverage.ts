import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CoverageAnalysisService } from "../services/CoverageAnalysisService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { AppForgeError } from "../utils/ErrorFactory.js";
import { textResult } from "./_helpers.js";

export function registerAnalyzeCoverage(
  server: McpServer,
  coverageAnalysisService: CoverageAnalysisService
): void {
  server.registerTool(
    "analyze_coverage",
    {
      title: "Analyze Coverage",
      description: "FIND MISSING TEST COVERAGE. Use when the user says 'what screens are not tested / find coverage gaps / what scenarios am I missing'. Parses .feature files to identify untested screens and missing edge cases. Returns: { report, prompt with suggestions }.",
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
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'CLARIFICATION_REQUIRED',
                question: err.question,
                context: err.context,
                options: err.options ?? []
              }, null, 2)
            }]
          };
        }
        if (err instanceof AppForgeError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'ERROR',
                code: err.code,
                message: err.message,
                remediation: err.details
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: "text" as const, text: JSON.stringify({
              action: 'ERROR',
              code: 'UNHANDLED_ERROR',
              message: err.message || String(err),
              hint: 'Verify that projectRoot is an absolute path, mcp-config.json is valid JSON, and the Appium server is running (if using live session tools).'
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}
