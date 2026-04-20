import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BugReportService } from "../services/collaboration/BugReportService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError, McpErrorCode, toMcpErrorResponse } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerExportBugReport(
  server: McpServer,
  bugReportService: BugReportService
): void {
  server.registerTool(
    "export_bug_report",
    {
      title: "Export Bug Report",
      description: `TRIGGER: Failed test needs tracking in ticket OR create Jira bug report
RETURNS: Markdown string (Jira-ready format with severity, steps, environment, fix suggestion)
NEXT: Copy Markdown to Jira → Create ticket
COST: Low (formats error into template, ~100-200 tokens)
ERROR_HANDLING: None - always succeeds, may request clarification for severity.

Auto-classifies severity, adds reproduction steps, environment details, suggested fix.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        testName: z.string(),
        rawError: z.string(),
        platform: z.string().optional(),
        deviceName: z.string().optional(),
        appVersion: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => textResult(bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion)));
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          const details = {
            question: err.question,
            context: err.context,
            options: err.options ?? []
          };
          const mcpErr = new McpError('CLARIFICATION_REQUIRED', McpErrorCode.INVALID_PARAMETER, { toolName: 'export_bug_report', cause: new Error(JSON.stringify(details)) });
          return toMcpErrorResponse(mcpErr, 'export_bug_report');
        }
        return toMcpErrorResponse(err, 'export_bug_report');
      }
    }
  );
}
