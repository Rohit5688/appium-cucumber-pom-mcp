import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialService } from "../services/CredentialService.js";
import { textResult } from "./_helpers.js";

export function registerSetCredentials(
  server: McpServer,
  credentialService: CredentialService
): void {
  server.registerTool(
    "set_credentials",
    {
      title: "Set Credentials",
      description: `SAVE CREDENTIALS SECURELY. Stores cloud provider credentials, API keys, or service env vars in the project .env file. Use for BrowserStack, Sauce Labs, or any external service. Values stored in .env and excluded from git. Returns: confirmation of keys saved.

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
