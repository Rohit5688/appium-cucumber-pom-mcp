import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CredentialService } from "../services/CredentialService.js";
import { textResult } from "./_helpers.js";

export function registerManageUsers(
  server: McpServer,
  credentialService: CredentialService
): void {
  server.registerTool(
    "manage_users",
    {
      title: "Manage Users",
      description: `MANAGE TEST USERS. Use when the user wants to add or view test account credentials for different environments (staging, prod). Stores users with roles in users.{env}.json. Generates a typed getUser() helper. Returns: list of users on read, confirmation on write.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
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
    async (args) => textResult(await credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users))
  );
}
