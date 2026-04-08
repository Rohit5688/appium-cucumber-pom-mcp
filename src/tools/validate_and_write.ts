import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FileWriterService } from "../services/FileWriterService.js";
import { textResult } from "./_helpers.js";
import { StructuralBrainService } from "../services/StructuralBrainService.js";

export function registerValidateAndWrite(
  server: McpServer,
  fileWriterService: FileWriterService
): void {
  server.registerTool(
    "validate_and_write",
    {
      title: "Validate and Write",
      description: `SAVE FILES TO DISK. Use after generate_cucumber_pom to write the generated test code. Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax first — returns errors instead of writing if validation fails. Use dryRun: true to preview validation without writing. Returns: validation result and list of written files.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
        dryRun: z.boolean().optional()
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

      const resultString = await fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun);

      if (totalWarning) {
        try {
          const resultObj = JSON.parse(resultString);
          resultObj.message = totalWarning + (resultObj.message || '');
          return textResult(JSON.stringify(resultObj, null, 2));
        } catch {
          return textResult(totalWarning + resultString);
        }
      }

      return textResult(resultString);
    }
  );
}
