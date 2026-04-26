import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OrchestrationService } from "../services/system/OrchestrationService.js";
import { textResult } from "./_helpers.js";
import { toMcpErrorResponse, McpErrors } from "../types/ErrorSystem.js";

export function registerCreateTestAtomically(
  server: McpServer,
  orchestrator: OrchestrationService
): void {
  server.registerTool(
    "create_test_atomically",
    {
      title: "Create Test Atomically",
      description: `TRIGGER: After generating test files in memory — write them without manual validation chaining.
RETURNS: { success: boolean, filesWritten: string[] }
NEXT: run_cucumber_test to verify written files pass.
COST: Low (~100-200 tokens)
ERROR_HANDLING: Throws on TypeScript/Gherkin syntax validation failure.

Validates TypeScript/Gherkin syntax, then writes to disk atomically in one call.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (<= 10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        generatedFiles: z.array(z.object({
          path: z.string(),
          content: z.string()
        })),
        jsonPageObjects: z.array(z.object({
          className: z.string(),
          path: z.string(),
          extendsClass: z.string().optional(),
          imports: z.array(z.string()).optional(),
          locators: z.array(z.object({
            name: z.string(),
            selector: z.string().optional()
          })).optional(),
          methods: z.array(z.object({
            name: z.string(),
            args: z.array(z.string()).optional(),
            body: z.array(z.string()).optional()
          })).optional()
        })).optional(),
        jsonSteps: z.array(z.object({
          path: z.string(),
          imports: z.array(z.string()).optional(),
          stepDefinitions: z.array(z.object({
            type: z.string(),
            pattern: z.string(),
            args: z.array(z.string()).optional(),
            body: z.array(z.string()).optional()
          }))
        })).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const filesToProcess = [...args.generatedFiles];

        const jsonSteps: any[] | undefined = (args as any).jsonSteps;
        if (jsonSteps && Array.isArray(jsonSteps)) {
          const { JsonToStepsTranspiler } = await import('../utils/JsonToStepsTranspiler.js');
          for (const stepFile of jsonSteps) {
            const validationErrors = JsonToStepsTranspiler.validate(stepFile);
            if (validationErrors.length > 0) {
              throw McpErrors.projectValidationFailed(`jsonSteps validation failed:\n${validationErrors.join('\n')}`, 'create_test_atomically', { suggestedNextTools: ['create_test_atomically'] });
            }
            const generatedContent = JsonToStepsTranspiler.transpile(stepFile);
            filesToProcess.push({
              path: stepFile.path,
              content: generatedContent
            });
          }
        }
        
        const jsonPageObjects: any[] | undefined = (args as any).jsonPageObjects;
        if (jsonPageObjects && Array.isArray(jsonPageObjects)) {
          const { JsonToPomTranspiler } = await import('../utils/JsonToPomTranspiler.js');
          for (const poFile of jsonPageObjects) {
            const validationErrors = JsonToPomTranspiler.validate(poFile);
            if (validationErrors.length > 0) {
              throw McpErrors.projectValidationFailed(`jsonPageObjects validation failed:\n${validationErrors.join('\n')}`, 'create_test_atomically', { suggestedNextTools: ['create_test_atomically'] });
            }
            const generatedContent = JsonToPomTranspiler.transpile(poFile);
            filesToProcess.push({
              path: poFile.path,
              content: generatedContent
            });
          }
        }

        const result = await orchestrator.createTestAtomically(
          args.projectRoot,
          filesToProcess
        );
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return toMcpErrorResponse(err, 'create_test_atomically');
      }
    }
  );
}