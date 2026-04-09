import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NavigationGraphService } from "../services/NavigationGraphService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerExtractNavigationMap(
  server: McpServer,
  navigationGraphServices: Map<string, NavigationGraphService>
): void {
  server.registerTool(
    "extract_navigation_map",
    {
      title: "Extract Navigation Map",
      description: `EXTRACT APP NAVIGATION FLOW. Use when the user says 'understand the app flow / map the navigation / how do I get to X screen'. Analyzes existing step definitions, page objects, and test flows to build a navigation graph. Helps LLMs understand multi-screen app navigation patterns for intelligent test generation. Returns: { navigationMap: graph of screen connections, reusableFlows: common navigation paths, suggestions: how to reuse existing navigation steps }.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        targetScreen: z.string().optional(),
        includeCommonFlows: z.boolean().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => {
          // Instance pooling: reuse NavigationGraphService per project to prevent memory leaks
          if (!navigationGraphServices.has(args.projectRoot)) {
            navigationGraphServices.set(args.projectRoot, new NavigationGraphService(args.projectRoot));
          }
          const navService = navigationGraphServices.get(args.projectRoot)!;
          const result = await navService.extractNavigationMap(args.projectRoot);
          return textResult(JSON.stringify(result, null, 2));
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
        if (err instanceof McpError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'ERROR',
                code: err.code,
                message: err.message,
                remediation: err.message
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
