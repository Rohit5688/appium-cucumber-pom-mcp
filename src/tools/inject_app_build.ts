import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import { textResult } from "./_helpers.js";

export function registerInjectAppBuild(
  server: McpServer,
  configService: McpConfigService
): void {
  server.registerTool(
    "inject_app_build",
    {
      title: "Inject App Build",
      description: "UPDATE APP FILE PATH. Use after a new build or when pointing to a different .apk/.ipa/.app file. Updates the app path in mcp-config.json for the specified platform. Set forceWrite: true for CI paths where the file does not exist locally yet. Returns: confirmation with the new path.",
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
