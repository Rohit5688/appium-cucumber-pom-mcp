import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TestDataService } from "../services/TestDataService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { McpError, McpErrorCode, toMcpErrorResponse } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";

export function registerGenerateTestDataFactory(
  server: McpServer,
  testDataService: TestDataService
): void {
  server.registerTool(
    "generate_test_data_factory",
    {
      title: "Generate Test Data Factory",
      description: `CREATE FAKE TEST DATA. Use when tests need realistic randomized data or the user says 'generate test data / mock data / create a data factory'. Returns a generation prompt to create a typed Faker.js factory.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        entityName: z.string(),
        schemaDefinition: z.string()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => textResult(testDataService.generateDataFactoryPrompt(args.entityName, args.schemaDefinition)));
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          const details = {
            question: err.question,
            context: err.context,
            options: err.options ?? []
          };
          const mcpErr = new McpError('CLARIFICATION_REQUIRED', McpErrorCode.INVALID_PARAMETER, { toolName: 'generate_test_data_factory', cause: new Error(JSON.stringify(details)) });
          return toMcpErrorResponse(mcpErr, 'generate_test_data_factory');
        }
        return toMcpErrorResponse(err, 'generate_test_data_factory');
      }
    }
  );
}
