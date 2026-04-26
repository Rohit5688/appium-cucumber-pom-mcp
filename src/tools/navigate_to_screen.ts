import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";
import { NavigationGraphService } from "../services/nav/NavigationGraphService.js";

/**
 * navigate_to_screen — P5 Deep Navigation Shortcut Service
 *
 * Uses the nav graph path-finder to emit a ready-to-paste Cucumber navigation
 * prelude for any target screen, sourced from the persisted navigation graph.
 *
 * LLM benefit: Instead of manually searching step files for navigation patterns,
 * the agent calls this once and receives the exact Cucumber step sequence to
 * reach the target screen — reusing existing steps where possible.
 */
export function registerNavigateToScreen(
  server: McpServer,
  navigationGraphServices: Map<string, NavigationGraphService>
): void {
  server.registerTool(
    "navigate_to_screen",
    {
      description: `TRIGGER: Before writing a test that starts mid-app (non-login screen) OR when you need to know how to reach a specific screen.
RETURNS: Ready-to-paste Cucumber navigation steps — reuses existing step definitions from your project. Includes confidence score and risk factors.
NEXT: Paste returned steps into the Feature file Background or Scenario → they handle all intermediate screens automatically.
COST: Low (reads .AppForge/navigation-graph.json, pure path computation, ~50-100 tokens)
PREREQUISITE: navigation graph must have data. Run start_appium_session + inspect_ui_hierarchy first to populate it, OR run export_navigation_map to see what's already known.`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the AppForge project."),
        targetScreen: z.string().describe("Name of the destination screen (e.g. 'ProductDetail', 'Checkout', 'Settings')."),
        fromScreen: z.string().optional().describe("Starting screen name. If omitted, uses the app entry point.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { projectRoot, targetScreen, fromScreen } = args as {
        projectRoot: string;
        targetScreen: string;
        fromScreen?: string;
      };

      try {
        // Get or create nav graph service for this project
        let navGraph = navigationGraphServices.get(projectRoot);
        if (!navGraph) {
          navGraph = new NavigationGraphService(projectRoot);
          navigationGraphServices.set(projectRoot, navGraph);
        }

        const knownScreens = navGraph.getKnownScreens(projectRoot);

        if (knownScreens.length === 0) {
          return textResult(
            `[NAVIGATE TO SCREEN] Navigation graph is empty for this project.\n\n` +
            `NEXT: Run start_appium_session → then inspect_ui_hierarchy on each key screen to build the graph.\n` +
            `Or run export_navigation_map to check if a static graph already exists.`
          );
        }

        // Fuzzy match targetScreen against known screens (case-insensitive contains)
        const targetLower = targetScreen.toLowerCase();
        const matched = knownScreens.find(s => s.toLowerCase() === targetLower)
          ?? knownScreens.find(s => s.toLowerCase().includes(targetLower))
          ?? knownScreens.find(s => targetLower.includes(s.toLowerCase()));

        if (!matched) {
          return textResult(
            `[NAVIGATE TO SCREEN] Screen "${targetScreen}" not found in navigation graph.\n\n` +
            `Known screens (${knownScreens.length}):\n` +
            knownScreens.map(s => `  • ${s}`).join('\n') + '\n\n' +
            `HINT: Try inspect_ui_hierarchy on that screen to add it to the graph.`
          );
        }

        // Determine start
        const entryPoints = navGraph.getEntryPoints();
        const resolvedFrom = fromScreen ?? (entryPoints[0] ?? knownScreens[0] ?? '');

        // Find shortest path
        const navigationPath = await navGraph.suggestNavigationSteps(resolvedFrom, matched);

        if (!navigationPath) {
          return textResult(
            `[NAVIGATE TO SCREEN] No path found from "${resolvedFrom}" → "${matched}".\n\n` +
            `This means the navigation graph has no recorded edge sequence connecting these screens.\n` +
            `NEXT: Use inspect_ui_hierarchy while manually navigating the app to build the graph.`
          );
        }

        // Build the output
        const lines: string[] = [
          `[NAVIGATE TO SCREEN] Path: "${resolvedFrom}" → "${matched}"`,
          `Confidence: ${Math.round(navigationPath.confidence * 100)}%`,
          `Steps: ${navigationPath.steps.length} | Est. time: ${Math.round((navigationPath.estimatedDuration ?? 0) / 1000)}s`,
          '',
        ];

        // Risk factors
        if (navigationPath.riskFactors && navigationPath.riskFactors.length > 0) {
          lines.push('⚠️ Risk factors:');
          for (const r of navigationPath.riskFactors) lines.push(`   • ${r}`);
          lines.push('');
        }

        // Cucumber step sequence
        lines.push('📋 Paste into Feature file (Background or Scenario):');
        lines.push('```gherkin');

        for (const step of navigationPath.steps) {
          if (step.stepDefinition) {
            lines.push(`  And ${step.stepDefinition}`);
          } else {
            const action = step.action;
            const el = action.triggerElement;
            const target = el?.accessibilityId ?? el?.id ?? el?.text ?? action.description ?? 'element';
            lines.push(`  And I ${action.action} on "${target}"  # ${step.fromScreen} → ${step.toScreen}`);
          }
        }

        lines.push('```');

        // Step definitions to create (if any are missing)
        const missingSteps = navigationPath.steps.filter(s => !s.stepDefinition);
        if (missingSteps.length > 0) {
          lines.push('');
          lines.push(`⚠️ ${missingSteps.length} step(s) need to be created — generate_cucumber_pom can scaffold them.`);
        }

        // Quality breakdown
        if (navigationPath.pathQuality) {
          const q = navigationPath.pathQuality;
          lines.push('');
          lines.push(`Quality: completeness=${Math.round(q.completenessScore * 100)}% | reliability=${Math.round(q.reliabilityScore * 100)}% | cross-platform=${Math.round(q.crossPlatformScore * 100)}%`);
        }

        return textResult(lines.join('\n'));
      } catch (err: any) {
        throw McpErrors.testExecutionFailed(`Navigate to screen failed: ${err instanceof Error ? err.message : String(err)}`, 'navigate_to_screen', { cause: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  );
}
