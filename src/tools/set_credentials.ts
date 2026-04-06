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
      description: "SAVE CREDENTIALS SECURELY. Stores cloud provider credentials, API keys, or service env vars in the project .env file. Use for BrowserStack, Sauce Labs, or any external service. Values stored in .env and excluded from git. Returns: confirmation of keys saved.",
      inputSchema: z.object({
        projectRoot: z.string(),
        credentials: z.record(z.string(), z.string())
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => textResult(await credentialService.setEnv(args.projectRoot, args.credentials))
  );
}
