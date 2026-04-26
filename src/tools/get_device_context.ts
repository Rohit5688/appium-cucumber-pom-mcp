import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "../services/execution/SessionManager.js";
import { textResult } from "./_helpers.js";

/**
 * get_device_context — lightweight 3-field summary of the active device.
 * Use this instead of get_session_health when you only need to know
 * if a session is active and what device/platform it's on.
 */
export function registerGetDeviceContext(
  server: McpServer,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "get_device_context",
    {
      description: `TRIGGER: Before any UI interaction — quick check if Appium session is active and which device/platform is targeted.
RETURNS: { sessionActive, deviceName, platform, sessionId } — 4 fields only. Fast, no verbose dump.
NEXT: If sessionActive=false → call start_appium_session | If true → proceed with inspect_ui_hierarchy or run_cucumber_test.
COST: Low (reads in-memory session state, ~10 tokens)`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (_args) => {
      try {
        const metrics = sessionManager.getSessionHealthMetrics() as any;
        const sessions: any[] = metrics?.sessions ?? [];
        const active = sessions.find((s: any) => s.status === 'active' || s.isActive);

        const ctx = active
          ? {
              sessionActive: true,
              sessionId: active.sessionId ?? active.id ?? 'unknown',
              deviceName: active.capabilities?.deviceName ?? active.deviceName ?? 'unknown',
              platform: (active.capabilities?.platformName ?? active.platform ?? 'unknown').toLowerCase()
            }
          : { sessionActive: false, sessionId: null, deviceName: null, platform: null };

        return textResult(JSON.stringify(ctx));
      } catch (err: any) {
        throw err;
      }
    }
  );
}
