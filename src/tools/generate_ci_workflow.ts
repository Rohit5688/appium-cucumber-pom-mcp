import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { CiWorkflowService } from "../services/CiWorkflowService.js";
import { validateProjectRoot } from "../utils/SecurityUtils.js";
import { textResult } from "./_helpers.js";

export function registerGenerateCiWorkflow(
  server: McpServer,
  configService: McpConfigService,
  ciWorkflowService: CiWorkflowService
): void {
  server.registerTool(
    "generate_ci_workflow",
    {
      title: "Generate CI Workflow",
      description: "SET UP CI/CD PIPELINE. Use when the user says 'add GitHub Actions / create a CI pipeline / automate my test runs'. Generates a pre-configured workflow file for GitHub Actions or GitLab CI — reads deviceName, execution command, and report path from mcp-config.json automatically. Returns: file path and workflow content.",
      inputSchema: z.object({
        projectRoot: z.string(),
        provider: z.enum(["github", "gitlab"]),
        platform: z.enum(["android", "ios"]).optional(),
        nodeVersion: z.string().optional(),
        appiumVersion: z.string().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Security: validate projectRoot before writing any files
      validateProjectRoot(args.projectRoot);

      const config = configService.read(args.projectRoot);

      // Extract best-effort CI parameters from config
      const executionCommand = config.project?.executionCommand
        ?? `npx wdio run wdio.${args.platform ?? 'android'}.conf.ts`;

      let deviceName = args.platform === 'ios' ? 'iPhone 14' : 'Pixel_6';
      for (const profile of Object.values(config.mobile?.capabilitiesProfiles || {})) {
        const p = profile as any;
        if (p.platformName?.toLowerCase() === args.platform && p['appium:deviceName']) {
          deviceName = p['appium:deviceName'];
          break;
        }
      }

      // Report path — read from config reporting section
      const reportPath = config.reporting?.outputDir ?? '_results_/';

      const workflow = ciWorkflowService.generate(args.provider, args.platform, {
        nodeVersion: args.nodeVersion,
        appiumVersion: args.appiumVersion,
        executionCommand,
        deviceName,
        reportPath
      });
      // Write the workflow file to the project
      const fs = await import('fs');
      const path = await import('path');
      const fullPath = path.default.join(args.projectRoot, workflow.filename);
      const dir = path.default.dirname(fullPath);
      if (!fs.default.existsSync(dir)) {
        fs.default.mkdirSync(dir, { recursive: true });
      }
      fs.default.writeFileSync(fullPath, workflow.content);
      return textResult(`Generated CI workflow at ${workflow.filename}\n\n${workflow.content}`);
    }
  );
}
