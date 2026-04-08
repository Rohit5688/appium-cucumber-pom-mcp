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
      description: `Requests structured clarification from the user. Use when the agent finds ambiguity that cannot be resolved autonomously.

WHEN TO USE:
- Found multiple matching elements with no clear priority
- File conflict with multiple plausible resolutions
- Platform ambiguity (iOS vs Android) without clear signal
- User intent unclear for a destructive operation

WHEN NOT TO USE:
- Avoid if the answer can be inferred from context
- Avoid asking multiple questions at once
- Avoid for simple boolean decisions — pick the safer option

PARAMETER: options — If provided, renders a numbered selection table. User can respond with just the number.

OUTPUT INSTRUCTIONS: Display the question as-is. Do not rephrase or add commentary.`,
      inputSchema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The clarification question (concise, ≤100 chars)'
          },
          context: {
            type: 'string',
            description: 'Background context explaining why clarification is needed'
          },
          options: {
            type: 'array',
            description: 'Structured response options. If provided, renders as numbered list.',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number', description: 'Option number (1, 2, 3...)' },
                label: { type: 'string', description: 'Human-readable description' },
                detail: { type: 'string', description: 'Technical detail (locator, path, etc.)' },
                recommended: { type: 'boolean', description: 'Marks the recommended option' }
              },
              required: ['id', 'label']
            }
          },
          defaultOption: {
            type: 'number',
            description: 'Default option to use if user does not respond within the session'
          }
        },
        required: ['question']
      } as any,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args: any) => {
      try {
        const { question, context, options, defaultOption } = args;

        let output = `❓ CLARIFICATION NEEDED\n`;
        output += `Question: ${question}\n`;

        if (context) {
          output += `Context: ${context}\n`;
        }

        if (options && Array.isArray(options) && options.length > 0) {
          output += `\nOptions:\n`;
          for (const opt of options) {
            const recommended = opt.recommended ? ' (recommended)' : '';
            const detail = opt.detail ? ` — ${opt.detail}` : '';
            output += `  [${opt.id}] ${opt.label}${recommended}${detail}\n`;
          }
          output += `\nReply with the option number (1-${options.length}):`;
        } else {
          output += `\nPlease provide your answer:`;
        }

        if (defaultOption !== undefined) {
          output += `\n(Default: option ${defaultOption} if unanswered)`;
        }

        return await safeExecute(async () => textResult(output));
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
