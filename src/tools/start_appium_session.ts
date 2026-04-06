import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/SessionManager.js";
import { textResult } from "./_helpers.js";

export function registerStartAppiumSession(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "start_appium_session",
    {
      title: "Start Appium Session",
      description: "CONNECT TO DEVICE. Use when the user says 'connect to the device / start a session / inspect the app / I want to see what's on screen'. Connects to Appium and starts a session on the device in mcp-config.json. Returns: { sessionId, platform, device, hint }. After success, call inspect_ui_hierarchy with no args to see the current screen.",
      inputSchema: z.object({
        projectRoot: z.string(),
        profileName: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const sessionService = await sessionManager.getSession(args.projectRoot, args.profileName, true);
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
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              action: 'ERROR',
              code: 'SESSION_START_FAILED',
              message: error.message || String(error),
              hint: 'Verify Appium server is running (npx appium), device/emulator is connected, and mcp-config.json has valid capabilities.'
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}
