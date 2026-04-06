import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { AppForgeError } from "../utils/ErrorFactory.js";
import { textResult } from "./_helpers.js";

export function registerRequestUserClarification(
  server: McpServer
): void {
  server.registerTool(
    "request_user_clarification",
    {
      title: "Request User Clarification",
      description: "ASK THE USER A QUESTION. Use ONLY when you cannot proceed and no reasonable assumption is possible. This halts the workflow and presents the question to the user. PREFER making a sensible default assumption over stopping. NEVER call this in a loop — if the user already answered, proceed. Returns: the question displayed to the user.",
      inputSchema: z.object({
        question: z.string(),
        context: z.string(),
        options: z.array(z.string()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => textResult(
          `⚠️ SYSTEM HALT — HUMAN INPUT REQUIRED\n\n**Question**: ${args.question}\n\n**Context**: ${args.context}\n${args.options ? '\n**Options**:\n' + args.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n') : ''}\n\nPlease answer the question above before continuing.`
        ));
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
