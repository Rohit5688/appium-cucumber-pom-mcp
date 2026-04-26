import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import { textResult } from "./_helpers.js";

export function registerInjectAppBuild(
  server: McpServer,
  configService: McpConfigService
): void {
  server.registerTool(
    "inject_app_build",
    {
      title: "Inject App Build",
      description: `TRIGGER: DEPRECATED — Use manage_config({ operation: 'inject_app' }) instead.
RETURNS: Updated mcp-config.json confirmation.
NEXT: Call start_appium_session with the new app path.
COST: Low (~50 tokens)

⚠️ DEPRECATED: Use manage_config({ operation: 'inject_app', platform, appPath }) instead. This tool will be removed in v2.0.

LEGACY: Updates the app path in mcp-config.json for the specified platform. Set forceWrite: true for CI paths where the file does not exist locally yet.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios"]),
        appPath: z.string(),
        forceWrite: z.boolean().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      configService.updateAppPath(args.projectRoot, args.platform, args.appPath, args.forceWrite);
      return textResult(`Updated ${args.platform} app path to: ${args.appPath}`);
    }
  );
}
