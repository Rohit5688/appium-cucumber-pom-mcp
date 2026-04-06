import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import { textResult } from "./_helpers.js";

export function registerManageConfig(
  server: McpServer,
  configService: McpConfigService
): void {
  server.registerTool(
    "manage_config",
    {
      title: "Manage Config",
      description: "READ OR UPDATE PROJECT CONFIG. Use when the user wants to check or change Appium capabilities, device settings, app paths, or cloud provider. 'read' returns the full mcp-config.json. 'write' does a partial merge — only keys you provide are updated, all others are preserved. Returns: current config on read, updated confirmation on write.",
      inputSchema: z.object({
        projectRoot: z.string(),
        operation: z.enum(["read", "write"]),
        config: z.record(z.string(), z.any()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      if (args.operation === "read") {
        return textResult(JSON.stringify(configService.read(args.projectRoot), null, 2));
      } else {
        // Validate currentEnvironment is in environments list
        if (args.operation === 'write' && args.config) {
          const incoming = args.config as any;
          if (incoming.currentEnvironment && incoming.environments) {
            if (!incoming.environments.includes(incoming.currentEnvironment)) {
              return textResult(JSON.stringify({
                error: 'INVALID_ENVIRONMENT',
                message: `currentEnvironment "${incoming.currentEnvironment}" is not in environments: [${incoming.environments.join(', ')}]`,
                fix: `Either add "${incoming.currentEnvironment}" to the environments array, or choose an existing one.`
              }));
            }
          } else if (incoming.currentEnvironment) {
            try {
              const existing = configService.read(args.projectRoot);
              const validEnvs = configService.getEnvironments(existing);
              if (validEnvs.length > 1 && !validEnvs.includes(incoming.currentEnvironment)) {
                return textResult(JSON.stringify({
                  error: 'INVALID_ENVIRONMENT',
                  message: `currentEnvironment "${incoming.currentEnvironment}" is not in: [${validEnvs.join(', ')}]`,
                  fix: `Add "${incoming.currentEnvironment}" to environments first, then set it as currentEnvironment.`
                }));
              }
            } catch { /* allow write if config unreadable */ }
          }
        }
        configService.write(args.projectRoot, args.config);
        return textResult("Configuration updated successfully.");
      }
    }
  );
}
