import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialService } from "../services/config/CredentialService.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerManageUsers(
  server: McpServer,
  credentialService: CredentialService
): void {
  server.registerTool(
    "manage_users",
    {
      title: "Manage Users",
      description: `TRIGGER: Manage multi-environment test users.
RETURNS: User list (list) | Updated roles config (add-role) | Scaffolded users file (scaffold).
NEXT: Verify user roles exist → Reference in test steps via getUser() helper.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed on invalid config.

Stores users with roles in users.{env}.json. Generates a typed getUser() helper.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (<= 10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        operation: z.enum(["read", "write"]),
        env: z.string().optional(),
        users: z.array(z.object({
          username: z.string(),
          password: z.string(),
          role: z.string().optional()
        })).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const resultString = await credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users);
      let resultObj: any = null;
      try {
        resultObj = JSON.parse(resultString);
      } catch {
        resultObj = null;
      }

      // If read operation failed, throw structured McpError so MCP layer surfaces it
      if (args.operation === 'read' && resultObj && resultObj.status && resultObj.status !== 'ok') {
        throw McpErrors.projectValidationFailed(resultObj.message || JSON.stringify(resultObj), 'manage_users');
      }

      return textResult(resultString);
    }
  );
}
