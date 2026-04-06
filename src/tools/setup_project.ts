import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ProjectSetupService } from "../services/ProjectSetupService.js";
import type { McpConfigService } from "../services/McpConfigService.js";
import { textResult } from "./_helpers.js";

export function registerSetupProject(
  server: McpServer,
  projectSetupService: ProjectSetupService,
  configService: McpConfigService
): void {
  server.registerTool(
    "setup_project",
    {
      title: "Setup Project",
      description: "FIRST-TIME SETUP. Use when starting a brand-new mobile automation project. Call ONCE for a new empty directory. Scaffolds the complete structure: mcp-config.json, BasePage, Cucumber feature, step definitions, wdio config, and hooks. Returns: log of all files created. Next: use manage_config to configure your Appium capabilities.",
      inputSchema: z.object({
        projectRoot: z.string(),
        platform: z.enum(["android", "ios", "both"]).optional(),
        appName: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const platform = args.platform ?? 'android';
      const appName = args.appName ?? 'MyApp';
      const result = await projectSetupService.setup(args.projectRoot, platform, appName);
      configService.migrateIfNeeded(args.projectRoot);
      return textResult(`${result}\n\n✅ Project scaffolded. Next: use manage_config (operation: 'read') to review your capabilities, then start_appium_session to connect to your device.`);
    }
  );
}
