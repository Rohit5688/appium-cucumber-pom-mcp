import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MigrationService } from "../services/MigrationService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError, McpErrorCode, toMcpErrorResponse } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerMigrateTest(
  server: McpServer,
  migrationService: MigrationService
): void {
  server.registerTool(
    "migrate_test",
    {
      title: "Migrate Test",
      description: `CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        sourceCode: z.string(),
        sourceFileName: z.string(),
        sourceFramework: z.enum(["espresso", "xcuitest", "detox"]),
        sourceLanguage: z.enum(["java", "swift", "javascript"])
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => textResult(migrationService.generateMigrationPrompt(args.sourceCode, args.sourceFileName, { sourceFramework: args.sourceFramework, sourceLanguage: args.sourceLanguage })));
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          const details = {
            question: err.question,
            context: err.context,
            options: err.options ?? []
          };
          const mcpErr = new McpError('CLARIFICATION_REQUIRED', McpErrorCode.INVALID_PARAMETER, { toolName: 'migrate_test', cause: new Error(JSON.stringify(details)) });
          return toMcpErrorResponse(mcpErr, 'migrate_test');
        }
        if (err instanceof McpError) {
          return toMcpErrorResponse(err, 'migrate_test');
        }
        return toMcpErrorResponse(err, 'migrate_test');
      }
    }
  );
}
