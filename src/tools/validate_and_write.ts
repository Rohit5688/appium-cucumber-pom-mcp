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
        preview: z.boolean().optional().describe("When true, shows what files would be written and validation results without making changes.")
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
  
      // If the FileWriterService signaled failure, handle according to preview flag.
      if (resultObj && resultObj.success === false) {
        const phase = resultObj.phase || 'validation';
        const detail = resultObj.message || resultObj.error || JSON.stringify(resultObj);
        const toolName = 'validate_and_write';

        // In preview mode we should NOT throw — show what would fail instead.
        if (args.preview) {
          const previewPayload = {
            preview: true,
            success: false,
            phase,
            message: detail,
            hint: '⚠️ Preview detected — this shows validation results without writing. Set preview:false to execute.'
          };
          if (totalWarning) previewPayload.message = totalWarning + (previewPayload.message || '');
          return textResult(JSON.stringify(previewPayload, null, 2));
        }

        // Non-preview behavior: surface structured errors
        if (phase === 'write-to-disk') {
          throw McpErrors.fileOperationFailed(detail, undefined, toolName);
        }

        if (['security-validation', 'gherkin-validation', 'cross-platform-validation', 'tsc'].includes(phase)) {
          throw McpErrors.projectValidationFailed(detail, toolName);
        }

        // Fallback to a generic file operation error
        throw McpErrors.fileOperationFailed(detail, undefined, toolName);
      }

      // Success path — return the original service response (possibly modified with warnings)
      if (resultObj) {
        if (args.preview) {
          // Ensure preview responses are standardized
          const payload = {
            preview: true,
            ...resultObj,
            hint: '✅ Preview complete. Set preview:false to execute.'
          };
          if (totalWarning && typeof payload === 'object') payload.message = totalWarning + (payload.message || '');
          return textResult(JSON.stringify(payload, null, 2));
        }
        return textResult(JSON.stringify(resultObj, null, 2));
      }

      // If result was plain string, wrap consistent preview payload when requested
      if (args.preview) {
        return textResult(JSON.stringify({
          preview: true,
          result: resultString,
          hint: '✅ Preview complete. Set preview:false to execute.',
          message: totalWarning ? totalWarning + resultString : resultString
        }, null, 2));
      }

      return textResult(resultString);
    }
  );
}
