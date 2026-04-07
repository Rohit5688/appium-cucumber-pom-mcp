import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/ExecutionService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerInspectUiHierarchy(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "inspect_ui_hierarchy",
    {
      title: "Inspect UI Hierarchy",
      description: "SEE WHAT'S ON SCREEN. Two modes: (1) NO ARGS — fetches live XML and screenshot from the active Appium session. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. (2) Pass xmlDump — parses offline with no session needed. Returns: { source, elements[], snapshot }. Use locatorStrategies to build accurate Page Object selectors.",
      inputSchema: z.object({
        projectRoot: z.string().optional(),
        xmlDump: z.string().optional(),
        screenshotBase64: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Get projectRoot from args or active session
      let projectRoot = (args as any).projectRoot;

      // If no projectRoot provided, fallback to process.cwd()
      if (!projectRoot) {
        projectRoot = process.cwd();
      }

      if (!projectRoot) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              action: 'ERROR',
              code: 'MISSING_PROJECT_ROOT',
              message: 'projectRoot is required when no active session exists',
              hint: 'Either start a session with start_appium_session or provide projectRoot parameter'
            }, null, 2)
          }],
          isError: true
        };
      }

      const result = await executionService.inspectHierarchy(
        projectRoot,
        args.xmlDump as string | undefined,
        args.screenshotBase64 as string | undefined,
        (args as any).stepHints as string[] | undefined
      );
      const data = result;
      return textResult(truncate(JSON.stringify(data, null, 2), "pass xmlDump with a specific subtree to reduce output"), data);
    }
  );
}
