import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { CredentialService } from "../services/config/CredentialService.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerManageConfig(
  server: McpServer,
  configService: McpConfigService,
  credentialService?: CredentialService
): void {
  server.registerTool(
    "manage_config",
    {
      title: "Manage Config",
      description: `TRIGGER: Need to read/update config OR change app path OR save credentials OR switch build
RETURNS: Read: full config object | Write/inject/set/activate: confirmation message
NEXT: If read → Use config for other tools | If write → verify with check_environment
COST: Low (file I/O only, ~50-100 tokens)
ERROR_HANDLING: Throws if projectRoot invalid or operation-specific params missing.

Operations: 'read', 'write' (partial merge), 'inject_app', 'set_credentials', 'activate_build'.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        operation: z.enum(["read", "write", "inject_app", "set_credentials", "activate_build"]),
        config: z.record(z.string(), z.any()).optional(),
        // Fields for inject_app operation
        appPath: z.string().optional(),
        platform: z.enum(["android", "ios"]).optional(),
        forceWrite: z.boolean().optional(),
        // Fields for set_credentials operation
        credentials: z.record(z.string(), z.string()).optional(),
        // Fields for activate_build operation
        buildName: z.string().optional(),
        // Preview flag: when true, show merged/affected config without writing
        preview: z.boolean().optional().describe("When true, shows the merged config or affected files without persisting changes.")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Helper: deep merge (immutably)
      const deepMerge = (target: any, source: any): any => {
        if (!source) return target;
        const out = Array.isArray(target) ? [...target] : { ...(target ?? {}) };
        for (const key of Object.keys(source)) {
          const val = source[key];
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            out[key] = deepMerge((target ?? {})[key], val);
          } else {
            out[key] = val;
          }
        }
        return out;
      };

      // PREVIEW handling for operations that would mutate config
      if (args.preview) {
        try {
          const existing = (() => {
            try {
              return configService.read(args.projectRoot);
            } catch {
              return null;
            }
          })();

          switch (args.operation) {
            case "read":
              return textResult(JSON.stringify({
                preview: true,
                existing: existing ?? {},
                hint: '✅ Preview complete. Set preview:false to execute.'
              }, null, 2));

            case "write": {
              const merged = deepMerge(existing ?? {}, args.config ?? {});
              // Validate merged currentEnvironment if present
              if (merged.currentEnvironment && merged.environments && !merged.environments.includes(merged.currentEnvironment)) {
                throw McpErrors.invalidParameter(
                  'currentEnvironment',
                  `"${merged.currentEnvironment}" is not in environments: [${(merged.environments || []).join(', ')}]`,
                  'manage_config'
                );
              }
               return textResult(JSON.stringify({
                 preview: true,
                 mergedConfig: merged,
                 hint: '✅ Preview complete. Set preview:false to execute.'
               }, null, 2));
            }

            case "inject_app": {
              if (!args.appPath || !args.platform) {
                throw McpErrors.invalidParameter(
                  'appPath/platform',
                  'Both appPath and platform are required for inject_app operation',
                  'manage_config'
                );
              }
              const previewConfig = JSON.parse(JSON.stringify(existing ?? {}));
              // Update capability profiles that match platform
              if (!previewConfig.mobile) previewConfig.mobile = { capabilitiesProfiles: {} };
              const profiles = previewConfig.mobile.capabilitiesProfiles || {};
              for (const [pname, caps] of Object.entries(profiles)) {
                if (caps && (caps as any).platformName) {
                  const plat = String((caps as any).platformName).toLowerCase();
                  if (plat.includes(args.platform)) {
                    (caps as any)['appium:app'] = args.appPath;
                  }
                }
              }
              // If no profiles exist, show where appPath would be set
              if (Object.keys(profiles).length === 0) {
                previewConfig.mobile.capabilitiesProfiles = {
                  myDevice: {
                    platformName: args.platform === 'ios' ? 'iOS' : 'Android',
                    'appium:app': args.appPath
                  }
                };
              }
               return textResult(JSON.stringify({
                 preview: true,
                 updatedConfigSnippet: previewConfig,
                 hint: '✅ Preview complete. Set preview:false to execute.'
               }, null, 2));
            }

            case "set_credentials": {
              if (!args.credentials) {
                throw McpErrors.invalidParameter(
                  'credentials',
                  'credentials object is required for set_credentials operation',
                  'manage_config'
                );
              }
              // Do not echo secret values — only show keys and count
              const keys = Object.keys(args.credentials);
               return textResult(JSON.stringify({
                 preview: true,
                 keys,
                 count: keys.length,
                 hint: '✅ Preview complete. Set preview:false to execute.'
               }, null, 2));
            }

            case "activate_build": {
              if (!args.buildName) {
                throw McpErrors.invalidParameter(
                  'buildName',
                  'buildName is required for activate_build operation',
                  'manage_config'
                );
              }
              const cfg: any = existing ?? {};
              const buildExists = Boolean(cfg.builds && cfg.builds[args.buildName]);
               return textResult(JSON.stringify({
                 preview: true,
                 buildName: args.buildName,
                 exists: buildExists,
                 hint: '✅ Preview complete. Set preview:false to execute.'
               }, null, 2));
            }

            default:
              throw McpErrors.invalidParameter(
                'operation',
                `Unknown operation: ${args.operation}`,
                'manage_config'
              );
          }
        } catch (err: any) {
          throw McpErrors.projectValidationFailed(err?.message || 'Preview failed', 'manage_config');
        }
      }

      // Non-preview (actual) operations — existing behavior
      switch (args.operation) {
        case "read":
          return textResult(JSON.stringify(configService.read(args.projectRoot), null, 2));

        case "write": {
          // Validate currentEnvironment is in environments list
          if (args.config) {
            const incoming = args.config as any;
            if (incoming.currentEnvironment && incoming.environments) {
              if (!incoming.environments.includes(incoming.currentEnvironment)) {
                throw McpErrors.invalidParameter(
                  'currentEnvironment',
                  `"${incoming.currentEnvironment}" is not in environments: [${incoming.environments.join(', ')}]`,
                  'manage_config'
                );
              }
            } else if (incoming.currentEnvironment) {
              try {
                const existing = configService.read(args.projectRoot);
                const validEnvs = configService.getEnvironments(existing);
                if (validEnvs.length > 1 && !validEnvs.includes(incoming.currentEnvironment)) {
                  throw McpErrors.invalidParameter(
                    'currentEnvironment',
                    `"${incoming.currentEnvironment}" is not in: [${validEnvs.join(', ')}]. Add it to environments first.`,
                    'manage_config'
                  );
                }
              } catch (err) {
                // Allow write if config unreadable (will be created)
                if ((err as any).code !== 'ENOENT') throw err;
              }
            }
          }
          configService.write(args.projectRoot, args.config);
          return textResult("Configuration updated successfully.");
        }

        case "inject_app": {
          if (!args.appPath || !args.platform) {
            throw McpErrors.invalidParameter(
              'appPath/platform',
              'Both appPath and platform are required for inject_app operation',
              'manage_config'
            );
          }
          configService.updateAppPath(
            args.projectRoot,
            args.platform,
            args.appPath,
            args.forceWrite ?? false
          );
          return textResult(`App path updated for ${args.platform}: ${args.appPath}`);
        }

        case "set_credentials": {
          if (!args.credentials) {
            throw McpErrors.invalidParameter(
              'credentials',
              'credentials object is required for set_credentials operation',
              'manage_config'
            );
          }
          if (!credentialService) {
            throw McpErrors.invalidParameter(
              'credentialService',
              'CredentialService not available - cannot set credentials',
              'manage_config'
            );
          }
          await credentialService.setEnv(args.projectRoot, args.credentials);
          return textResult(`Saved ${Object.keys(args.credentials).length} credential(s) to .env`);
        }

        case "activate_build": {
          if (!args.buildName) {
            throw McpErrors.invalidParameter(
              'buildName',
              'buildName is required for activate_build operation',
              'manage_config'
            );
          }
          const result = configService.activateBuild(args.projectRoot, args.buildName);
          return textResult(`Build "${args.buildName}" activated. ${result}`);
        }

        default:
          throw McpErrors.invalidParameter(
            'operation',
            `Unknown operation: ${args.operation}`,
            'manage_config'
          );
      }
    }
  );
}
