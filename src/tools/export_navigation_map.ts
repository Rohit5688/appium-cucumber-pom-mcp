import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NavigationGraphService } from "../services/NavigationGraphService.js";
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
      description: `VISUALIZE APP NAVIGATION. Returns the known screen navigation graph as a Mermaid diagram. Use to understand what screens AppForge has explored and how to navigate between them. Also shows visit counts and confidence scores for each path. Returns: Mermaid diagram string.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      return await safeExecute(async () => {
        if (!navigationGraphServices.has(args.projectRoot)) {
          navigationGraphServices.set(args.projectRoot, new NavigationGraphService(args.projectRoot));
        }
        const navService = navigationGraphServices.get(args.projectRoot)!;
        const diagram = navService.exportMermaidDiagram(args.projectRoot);
        const knownScreens = navService.getKnownScreens(args.projectRoot);
        
        return textResult(
          `## App Navigation Map\n\nKnown screens: ${knownScreens.length}\n\n${diagram}\n\n` +
          `*Use start_appium_session + inspect_ui_hierarchy to explore more screens and build the map.*`
        );
      });
    }
  );
}
