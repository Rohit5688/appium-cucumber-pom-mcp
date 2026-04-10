import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FileWriterService } from "../services/FileWriterService.js";
import { textResult } from "./_helpers.js";
import { StructuralBrainService } from "../services/StructuralBrainService.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerValidateAndWrite(
  server: McpServer,
  fileWriterService: FileWriterService
): void {
  server.registerTool(
    "validate_and_write",
    {
      title: "Validate and Write",
      description: `TRIGGER: After LLM generates test files OR need to save code with validation
RETURNS: { valid: boolean, filesWritten: string[], errors?: string[] }
NEXT: If valid → run_cucumber_test | If errors → Fix syntax and retry
COST: Medium (runs tsc --noEmit, Gherkin parser, writes files, ~200-400 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed on validation failure.
 
Validates TypeScript + Gherkin syntax before writing. Use preview:true to preview without writing.
 
OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
        preview: z.boolean().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const brainService = StructuralBrainService.getInstance();
      let totalWarning = '';
      for (const file of args.files) {
        const warning = brainService.formatPreFlightWarning(file.path);
        if (warning) totalWarning += warning + '\\n\\n';
      }

      const resultString = await fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.preview);
  
      // Attempt to parse the service response (most responses are JSON strings)
      let resultObj: any = null;
      try {
        resultObj = JSON.parse(resultString);
      } catch {
        resultObj = null;
      }
  
      // Prepend any pre-flight warnings to the human message payload
      if (totalWarning) {
        if (resultObj && typeof resultObj === 'object') {
          resultObj.message = totalWarning + (resultObj.message || '');
        } else {
          // result is plain string -- prefix the warnings
          return textResult(totalWarning + resultString);
        }
      }
  
      // If the FileWriterService signaled failure, throw a structured McpError
      if (resultObj && resultObj.success === false) {
        const phase = resultObj.phase || 'validation';
        const detail = resultObj.message || resultObj.error || JSON.stringify(resultObj);
        const toolName = 'validate_and_write';
  
        if (phase === 'write-to-disk') {
          throw McpErrors.fileOperationFailed(detail, undefined, toolName);
        }
  
        if (['security-validation', 'gherkin-validation', 'cross-platform-validation'].includes(phase)) {
          throw McpErrors.projectValidationFailed(detail, toolName);
        }
  
        // Fallback to a generic file operation error
        throw McpErrors.fileOperationFailed(detail, undefined, toolName);
      }
  
      // Success path — return the original service response (possibly modified with warnings)
      if (resultObj) {
        return textResult(JSON.stringify(resultObj, null, 2));
      }
  
      return textResult(resultString);
    }
  );
}
