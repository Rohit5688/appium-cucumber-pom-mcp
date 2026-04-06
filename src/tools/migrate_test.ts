import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MigrationService } from "../services/MigrationService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { AppForgeError } from "../utils/ErrorFactory.js";
import { textResult } from "./_helpers.js";

export function registerMigrateTest(
  server: McpServer,
  migrationService: MigrationService
): void {
  server.registerTool(
    "migrate_test",
    {
      title: "Migrate Test",
      description: "CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping.",
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
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'CLARIFICATION_REQUIRED',
                question: err.question,
                context: err.context,
                options: err.options ?? []
              }, null, 2)
            }]
          };
        }
        if (err instanceof AppForgeError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'ERROR',
                code: err.code,
                message: err.message,
                remediation: err.details
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: "text" as const, text: JSON.stringify({
              action: 'ERROR',
              code: 'UNHANDLED_ERROR',
              message: err.message || String(err),
              hint: 'Verify that projectRoot is an absolute path, mcp-config.json is valid JSON, and the Appium server is running (if using live session tools).'
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}
