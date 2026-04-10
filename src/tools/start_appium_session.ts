import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/SessionManager.js";
import { ContextManager } from '../services/ContextManager.js';
import { textResult } from "./_helpers.js";
import { SelfHealingService } from '../services/SelfHealingService.js';
import { TokenBudgetService } from '../services/TokenBudgetService.js';
import { toMcpErrorResponse } from '../types/ErrorSystem.js';

export function registerStartAppiumSession(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "start_appium_session",
    {
      title: "Start Appium Session",
      description: `TRIGGER: User says 'connect to device / start session / inspect app / see screen'
RETURNS: { sessionId, platform, device, navigationHints }
NEXT: inspect_ui_hierarchy (no args) to see current screen
COST: High (launches app, ~60-120s, establishes driver connection)
ERROR_HANDLING: Throws if Appium unreachable, device offline, or app not found.

Connects to device via mcp-config.json capabilities. Resets context/token budget. Deep-link/activity shortcuts in navigationHints.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        profileName: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        ContextManager.getInstance().reset();
        TokenBudgetService.getInstance().reset();
        const sessionService = await sessionManager.getSession(args.projectRoot, args.profileName, true);
        SelfHealingService.getInstance().resetAttemptCounts();
        const driver = sessionService.getDriver()!;
        const caps = driver.capabilities as any;
        const sessionInfo = {
          sessionId: driver.sessionId,
          platformName: caps.platformName ?? 'unknown',
          deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? 'unknown',
          appPackage: caps['appium:appPackage'] ?? caps.appPackage,
          bundleId: caps['appium:bundleId'] ?? caps.bundleId,
          navigationHints: {
            deepLinkAvailable: !!(caps['appium:appPackage'] || caps.appPackage || caps['appium:bundleId'] || caps.bundleId),
            androidPackage: caps['appium:appPackage'] ?? caps.appPackage ?? null,
            androidDefaultActivity: caps['appium:appActivity'] ?? caps.appActivity ?? null,
            iosBundle: caps['appium:bundleId'] ?? caps.bundleId ?? null,
            shortcutNote: 'Use openDeepLink(url) from BasePage to jump directly to any deep-linked screen. For Android, use startActivity(package, activity) to open any Activity directly without UI navigation.'
          }
        };
        const hints = sessionInfo.navigationHints;
        const output = [
          `✅ Session started | Device: ${sessionInfo.deviceName} | Platform: ${sessionInfo.platformName}`,
          `App: ${sessionInfo.appPackage || sessionInfo.bundleId || 'unknown'}`,
          '',
          '📍 Navigation Shortcuts Available:',
          hints.androidPackage ? `  Android startActivity: package=${hints.androidPackage}, activity=${hints.androidDefaultActivity}` : '',
          hints.iosBundle ? `  iOS bundle: ${hints.iosBundle}` : '',
          `  Deep links: openDeepLink(url) — use for any screen with a deep link`,
          '',
          'Next: Call inspect_ui_hierarchy with stepHints=[...your steps] for the NEW screen you are building.',
          '🚫 Do NOT call inspect_ui_hierarchy for screens that already have Page Objects.'
        ].filter(Boolean).join('\n');
        const data = {
          sessionId: sessionInfo.sessionId,
          platform: sessionInfo.platformName,
          device: sessionInfo.deviceName,
          appPackage: sessionInfo.appPackage,
          bundleId: sessionInfo.bundleId,
          hint: `✅ Session started on ${sessionInfo.deviceName} (${sessionInfo.platformName}). NEXT: Call inspect_ui_hierarchy (no args) to fetch live XML and see what's on screen.`
        };
        return textResult(JSON.stringify(data, null, 2), data);
      } catch (error: any) {
        return toMcpErrorResponse(error, 'start_appium_session');
      }
    }
  );
}
