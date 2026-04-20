import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialService } from "../services/config/CredentialService.js";
import { textResult } from "./_helpers.js";

export function registerSetCredentials(
  server: McpServer,
  credentialService: CredentialService
): void {
  server.registerTool(
    "set_credentials",
    {
      title: "Set Credentials",
      description: `⚠️ DEPRECATED: Use manage_config({ operation: 'set_credentials', credentials }) instead. This tool will be removed in v2.0.

LEGACY: Stores cloud provider credentials, API keys, or service env vars in the project .env file. Values stored in .env and excluded from git.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        credentials: z.record(z.string(), z.string())
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => textResult(await credentialService.setEnv(args.projectRoot, args.credentials))
  );
}
