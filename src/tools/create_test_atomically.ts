import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OrchestrationService } from "../services/OrchestrationService.js";
import { textResult } from "./_helpers.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";

export function registerCreateTestAtomically(
  server: McpServer,
  orchestrator: OrchestrationService
): void {
  server.registerTool(
    "create_test_atomically",
    {
      title: "Create Test Atomically",
      description: `WORKFLOW ORCHESTRATOR: Validate → Write test files in one atomic call. Use when you have generated test files and want to write them without manual validation chaining. Validates TypeScript/Gherkin syntax, then writes to disk atomically. Returns: { success: boolean, filesWritten: string[] }. NEXT: run_cucumber_test to verify.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        generatedFiles: z.array(z.object({
          path: z.string(),
          content: z.string()
        }))
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const result = await orchestrator.createTestAtomically(
          args.projectRoot,
          args.generatedFiles
        );
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return toMcpErrorResponse(err, 'create_test_atomically');
      }
    }
  );
}