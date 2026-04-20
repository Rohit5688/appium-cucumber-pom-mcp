import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NavigationGraphService } from "../services/nav/NavigationGraphService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { textResult } from "./_helpers.js";

export function registerExportNavigationMap(
  server: McpServer,
  navigationGraphServices: Map<string, NavigationGraphService>
): void {
  server.registerTool(
    "export_navigation_map",
    {
      title: "Export Navigation Map",
      description: `VISUALIZE APP NAVIGATION. Returns the known screen navigation graph as a Mermaid diagram.

Automatically performs static analysis of your PageObjects and step definitions to build the map — no active Appium session required. For new projects with no code yet, returns a conceptual seed map based on mcp-config to give the LLM a starting framework.

For richer maps, combine with start_appium_session + inspect_ui_hierarchy to record live screen transitions.

Returns: Mermaid diagram string, known screens, and source mode (static/live/seed).

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        forceRebuild: z.boolean().default(false).describe("Force re-analysis of all PageObjects and step files, ignoring cache.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      return await safeExecute(async () => {
        if (!navigationGraphServices.has(args.projectRoot)) {
          navigationGraphServices.set(args.projectRoot, new NavigationGraphService(args.projectRoot));
        }
        const navService = navigationGraphServices.get(args.projectRoot)!;

        // Always run static analysis first — this is the core fix.
        // extractNavigationMap() parses PageObjects + step definitions without needing a live session.
        await navService.extractNavigationMap(args.projectRoot, args.forceRebuild ?? false);

        const diagram = navService.exportMermaidDiagram(args.projectRoot);
        const knownScreens = navService.getKnownScreens(args.projectRoot);
        const source = navService.getMapSource();

        const sourceNote = source === 'seed'
          ? '🌱 **Seed Map**: No PageObjects or step definitions found yet. This is a conceptual scaffold to guide your first test. Build real screens by writing PageObjects and running inspect_ui_hierarchy.'
          : source === 'static'
          ? '📂 **Static Analysis**: Map built from existing PageObjects and step definitions without a live session.'
          : '📡 **Live + Static**: Map enriched with both static analysis and live session exploration.';

        return textResult(
          `## App Navigation Map\n\n${sourceNote}\n\nKnown screens: ${knownScreens.length}\n\n${diagram}\n\n` +
          `*To enrich this map: use start_appium_session + inspect_ui_hierarchy to record live screen transitions.*`
        );
      });
    }
  );
}
