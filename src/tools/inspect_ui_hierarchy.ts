import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/execution/ExecutionService.js";
import { textResult, truncate, getPlatformSkill } from "./_helpers.js";
import { toMcpErrorResponse, McpError, McpErrorCode } from "../types/ErrorSystem.js";
import { PreFlightService } from "../services/setup/PreFlightService.js";
import { SessionManager } from "../services/execution/SessionManager.js";

export function registerInspectUiHierarchy(
  server: McpServer,
  executionService: ExecutionService
): void {
  server.registerTool(
    "inspect_ui_hierarchy",
    {
      title: "Inspect UI Hierarchy",
      description: `TRIGGER: Need to see current screen OR analyze UI structure OR build selectors
RETURNS: { source: xml, elements: Array<{id, text, class, xpath, locatorStrategy}>, snapshot: base64 }
NEXT: Use elements for generate_cucumber_pom OR self_heal_test if element not found
COST: Medium-High (live: fetches XML+screenshot from device, ~500-1000 tokens | offline: parse only, ~200 tokens)
ERROR_HANDLING: Throws if no active session (mode 1) OR invalid XML (mode 2). Suggests start_appium_session.

Mode 1 (NO ARGS): Live fetch from active session. Mode 2 (xmlDump): Offline parse. Returns locator strategies for Page Objects.

OUTPUT: Ack (≤10 words), proceed.`,
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
        // If session check failed, return a guided error suggesting start_appium_session
        const sessionFailure = report.checks.find(c => c.name === 'session_check' && !c.passed);
        if (sessionFailure) {
          const err = new McpError(sessionFailure.message, McpErrorCode.SESSION_NOT_FOUND, {
            toolName: 'inspect_ui_hierarchy',
            suggestedNextTools: ['start_appium_session']
          });
          return toMcpErrorResponse(err, 'inspect_ui_hierarchy');
        }
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
