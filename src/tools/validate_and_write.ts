import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";
import type { FileWriterService } from "../services/io/FileWriterService.js";
import { textResult } from "./_helpers.js";
import { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";
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
        files: z.array(z.object({ path: z.string(), content: z.string() })).describe("Raw files to create/update. Passed directly."),
        preview: z.boolean().optional().describe("When true, shows what files would be written and validation results without making changes."),
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
        })).describe("Optional structured JSON representations of Page Objects (bypasses raw TS formatting).").optional(),
        jsonSteps: z.array(z.object({
          path: z.string(),
          imports: z.array(z.string()).optional(),
          stepDefinitions: z.array(z.object({
            type: z.string(),
            pattern: z.string(),
            args: z.array(z.string()).optional(),
            body: z.array(z.string()).optional()
          }))
        })).describe("Optional JSON representations of Step Definitions").optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const brainService = new StructuralBrainService(args.projectRoot);
      let totalWarning = '';
      for (const file of args.files) {
        const warning = brainService.formatPreFlightWarning(file.path);
        if (warning) totalWarning += warning + '\\n\\n';
      }

      const filesToProcess = [...args.files];

      const jsonSteps: any[] | undefined = (args as any).jsonSteps;
      if (jsonSteps && Array.isArray(jsonSteps)) {
        const { JsonToStepsTranspiler } = await import('../utils/JsonToStepsTranspiler.js');
        for (const stepFile of jsonSteps) {
          const validationErrors = JsonToStepsTranspiler.validate(stepFile);
          if (validationErrors.length > 0) {
            throw McpErrors.projectValidationFailed(`jsonSteps validation failed:\n${validationErrors.join('\n')}`, 'validate_and_write', { suggestedNextTools: ['validate_and_write'] });
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
            throw McpErrors.projectValidationFailed(`jsonPageObjects validation failed:\n${validationErrors.join('\n')}`, 'validate_and_write', { suggestedNextTools: ['validate_and_write'] });
          }
          const generatedContent = JsonToPomTranspiler.transpile(poFile);
          filesToProcess.push({
            path: poFile.path,
            content: generatedContent
          });
        }
      }

      const resultString = await fileWriterService.validateAndWrite(args.projectRoot, filesToProcess, 3, args.preview);

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
          const rejectionMsg = `[REJECTION] Write failed — do NOT retry blindly.\n  Phase: ${phase}\n  Raw error: ${detail}\nNEXT: Fix the flagged file content then call validate_and_write again.`;
          throw McpErrors.fileOperationFailed(rejectionMsg, undefined, toolName);
        }

        if (['security-validation', 'gherkin-validation', 'cross-platform-validation', 'tsc'].includes(phase)) {
          const rejectionMsg = `[REJECTION] Validation failed — do NOT retry blindly.\n  Phase: ${phase}\n  Raw error: ${detail}\nNEXT: Fix the flagged pattern in generated content then call validate_and_write again.`;
          throw McpErrors.projectValidationFailed(rejectionMsg, toolName, { suggestedNextTools: ['validate_and_write', 'execute_sandbox_code'] });
        }

        // Fallback
        const rejectionMsg = `[REJECTION] Unexpected failure.\n  Phase: ${phase}\n  Raw error: ${detail}\nNEXT: Call execute_sandbox_code to inspect the project state.`;
        throw McpErrors.fileOperationFailed(rejectionMsg, undefined, toolName);
      }

      // Success path — build [WRITE DIFF] block and return structured signal
      const writtenFiles: string[] = resultObj?.filesWritten ?? resultObj?.files ?? [];
      const diffLines: string[] = ['[WRITE DIFF]'];
      for (const f of writtenFiles) {
        const absPath = path.isAbsolute(f) ? f : path.join(args.projectRoot, f);
        const matchedFile = filesToProcess.find((rf: any) =>
          path.join(args.projectRoot, rf.path) === absPath || rf.path === f
        );
        const newLines = matchedFile ? matchedFile.content.split('\n').length : 0;
        const existed = fs.existsSync(absPath);
        diffLines.push(`  ${existed ? '✏️ modified' : '✅ created'} ${f}${newLines > 0 ? ` (${newLines} lines)` : ''}`);
      }
      const diffBlock = writtenFiles.length > 0 ? `\n\n${diffLines.join('\n')}` : '';

      if (resultObj) {
        if (args.preview) {
          const payload = {
            preview: true,
            ...resultObj,
            hint: '✅ Preview complete. Set preview:false to execute.'
          };
          if (totalWarning && typeof payload === 'object') payload.message = totalWarning + (payload.message || '');
          return textResult(JSON.stringify(payload, null, 2));
        }
        return textResult(JSON.stringify(resultObj, null, 2) + diffBlock + (totalWarning ? `\n\n⚠️ Pre-flight warnings:\n${totalWarning}` : ''));
      }

      if (args.preview) {
        return textResult(JSON.stringify({
          preview: true,
          result: resultString,
          hint: '✅ Preview complete. Set preview:false to execute.',
          message: totalWarning ? totalWarning + resultString : resultString
        }, null, 2));
      }

      return textResult(resultString + diffBlock);
    }
  );
}
