import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NavigationGraphService } from "../services/nav/NavigationGraphService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError, McpErrorCode } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerExtractNavigationMap(
  server: McpServer,
  navigationGraphServices: Map<string, NavigationGraphService>
): void {
  server.registerTool(
    "extract_navigation_map",
    {
      title: "Extract Navigation Map",
      description: `TRIGGER: Map the app / discover nav / crawl the site
RETURNS: { navigationMap: graph of screen connections, reusableFlows: common navigation paths, suggestions: how to reuse existing navigation steps }
NEXT: export_navigation_map to view diagram
COST: Medium (static analysis, ~200-500 tokens)

Analyzes existing step definitions, page objects, and test flows to build a navigation graph. Helps LLMs understand multi-screen app navigation patterns for intelligent test generation.

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
          const details = {
            question: err.question,
            context: err.context,
            options: err.options ?? []
          };
          const mcpErr = new McpError('CLARIFICATION_REQUIRED', McpErrorCode.INVALID_PARAMETER, { toolName: 'extract_navigation_map', cause: new Error(JSON.stringify(details)) });
          throw mcpErr;
        }
        throw err;
      }
    }
  );
}
