import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/ExecutionService.js";
import { textResult, truncate, getPlatformSkill } from "./_helpers.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";
import { PreFlightService } from "../services/PreFlightService.js";
import { SessionManager } from "../services/SessionManager.js";

export function registerInspectUiHierarchy(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "inspect_ui_hierarchy",
    {
      title: "Inspect UI Hierarchy",
      description: `SEE WHAT'S ON SCREEN. Two modes: (1) NO ARGS — fetches live XML and screenshot from the active Appium session. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. (2) Pass xmlDump — parses offline with no session needed. Returns: { source, elements[], snapshot }. Use locatorStrategies to build accurate Page Object selectors.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string().optional(),
        xmlDump: z.string().optional(),
        screenshotBase64: z.string().optional(),
        includeRawXml: z.boolean().optional()
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
      return toMcpErrorResponse(new Error('projectRoot is required when no active session exists. Start a session with start_appium_session or provide projectRoot.'), 'inspect_ui_hierarchy');
    }

      // Pre-flight check
      const sessionManager = SessionManager.getInstance();
      const sessionInfo = sessionManager.getSessionInfo(projectRoot);
      const sessionId = sessionInfo?.sessionId;
      const preFlight = PreFlightService.getInstance();
      const report = await preFlight.runChecks('http://127.0.0.1:4723', sessionId);
      
      if (!report.allPassed) {
        return toMcpErrorResponse(new Error(preFlight.formatReport(report)), 'inspect_ui_hierarchy');
      }

      const result = await executionService.inspectHierarchy(
        projectRoot,
        args.xmlDump as string | undefined,
        args.screenshotBase64 as string | undefined,
        (args as any).stepHints as string[] | undefined,
        args.includeRawXml
      );
      const data = result;
      const platformContext = getPlatformSkill({ projectRoot });
      return textResult(truncate(JSON.stringify(data, null, 2), "pass xmlDump with a specific subtree to reduce output") + platformContext, data);
    }
  );
}
