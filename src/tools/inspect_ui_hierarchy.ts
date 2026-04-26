import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/execution/ExecutionService.js";
import { textResult, truncate, getPlatformSkill } from "./_helpers.js";
import { McpError, McpErrorCode } from "../types/ErrorSystem.js";
import { PreFlightService } from "../services/setup/PreFlightService.js";
import { SessionManager } from "../services/execution/SessionManager.js";
import type { NavigationGraphService } from "../services/nav/NavigationGraphService.js";

/**
 * P7: Session-scoped "last screen" tracker — key is projectRoot.
 * Enables transition recording: previousScreen → currentScreen.
 * In-memory only; resets when server restarts.
 */
const lastScreenByProject = new Map<string, string>();

/**
 * Rank elements from hierarchy by locator strategy quality.
 * accessibility-id > resource-id/id > text > xpath (last resort)
 * Returns top 20 actionable elements with ranked selector.
 */
function rankLocators(data: any): string {
  const elements: any[] = (data as any).elements ?? [];
  if (elements.length === 0) return '';

  const ranked = elements
    .filter((el: any) => el.text || el.accessibilityId || el.resourceId || el.id || el.xpath)
    .map((el: any) => {
      let strategy: string;
      let selector: string;
      let quality: '✅ best' | '🟡 good' | '🟠 ok' | '🔴 brittle — prefer accessibility-id';

      if (el.accessibilityId) {
        strategy = 'accessibility-id'; selector = el.accessibilityId; quality = '✅ best';
      } else if (el.resourceId || el.id) {
        strategy = 'resource-id'; selector = el.resourceId ?? el.id; quality = '🟡 good';
      } else if (el.text && el.text.length <= 40) {
        strategy = 'text'; selector = el.text; quality = '🟠 ok';
      } else {
        strategy = 'xpath'; selector = el.xpath ?? '?'; quality = '🔴 brittle — prefer accessibility-id';
      }

      return { quality, strategy, selector, class: el.class ?? el.type ?? '' };
    })
    .slice(0, 20);

  if (ranked.length === 0) return '';
  return `\n\n[RANKED LOCATORS]\n${JSON.stringify(ranked, null, 2)}`;
}


export function registerInspectUiHierarchy(
  server: McpServer,
  executionService: ExecutionService,
  navigationGraphServices?: Map<string, NavigationGraphService>
): void {
  server.registerTool(
    "inspect_ui_hierarchy",
    {
      title: "Inspect UI Hierarchy",
      description: `TRIGGER: Need to see current screen OR analyze UI structure OR build selectors
RETURNS: { source: xml, elements: [] } + [RANKED LOCATORS] block sorted by quality: ✅ accessibility-id > 🟡 resource-id > 🟠 text > 🔴 xpath. Use ranked block — skip raw XML parsing.
NEXT: Pick selector from [RANKED LOCATORS] for generate_cucumber_pom OR self_heal_test if element not found
COST: Medium-High (live: fetches XML+screenshot from device, ~500-1000 tokens | offline: parse only, ~200 tokens)
ERROR_HANDLING: Throws if no active session (mode 1) OR invalid XML (mode 2). Suggests start_appium_session.

Mode 1 (NO ARGS): Live fetch from active session. Mode 2 (xmlDump): Offline parse. Returns locator strategies for Page Objects.
Auto-records screen transition into navigation graph when called with an active session.

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

      // If no projectRoot provided, warn — offline xmlDump mode can work without it.
      // Live session mode will fail downstream when querying SessionManager.
      if (!projectRoot) {
        console.warn('[AppForge] ⚠️ inspect_ui_hierarchy: projectRoot not provided. Live session lookup may fail.');
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
          throw err;
        }
        throw new McpError(preFlight.formatReport(report), McpErrorCode.INVALID_PARAMETER, { toolName: 'inspect_ui_hierarchy' });
      }

      const result = await executionService.inspectHierarchy(
        projectRoot,
        args.xmlDump as string | undefined,
        args.screenshotBase64 as string | undefined,
        (args as any).stepHints as string[] | undefined,
        args.includeRawXml
      );
      const data = result;

      // P7: Auto-record screen transition into navigation graph (fire-and-forget, never blocks)
      const xmlSource = (data as any).source as string | undefined;
      const isLiveInspect = !args.xmlDump && projectRoot && xmlSource;
      if (isLiveInspect && navigationGraphServices) {
        (async () => {
          try {
            let navGraph = navigationGraphServices!.get(projectRoot!);
            if (!navGraph) {
              // Lazy-init nav graph service for this project (ESM-safe dynamic import)
              const { NavigationGraphService: NGS } = await import('../services/nav/NavigationGraphService.js');
              navGraph = new NGS(projectRoot!) as NavigationGraphService;
              navigationGraphServices!.set(projectRoot!, navGraph);
            }
            const previousScreen = lastScreenByProject.get(projectRoot!);
            await navGraph.updateGraphFromSession(xmlSource!, previousScreen, 'inspect');

            // Extract current screen name from xml (use activity or package)
            const screenMatch = xmlSource!.match(/activity="([^"]+)"|package="([^"]+)"/);
            if (screenMatch) {
              const screenName = (screenMatch[1] || screenMatch[2] || 'unknown').split('.').pop() ?? 'unknown';
              lastScreenByProject.set(projectRoot!, screenName);
            }
          } catch {
            // Never propagate — navigation tracking is non-critical
          }
        })();
      }

      const platformContext = getPlatformSkill({ projectRoot });
      const rankedBlock = rankLocators(data);
      return textResult(truncate(JSON.stringify(data, null, 2), "pass xmlDump with a specific subtree to reduce output") + rankedBlock + platformContext, data);
    }
  );
}

