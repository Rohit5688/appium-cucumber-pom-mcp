import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FileWriterService } from "../services/FileWriterService.js";
import { textResult } from "./_helpers.js";

export function registerValidateAndWrite(
  server: McpServer,
  fileWriterService: FileWriterService
): void {
  server.registerTool(
    "validate_and_write",
    {
      title: "Validate and Write",
      description: "SAVE FILES TO DISK. Use after generate_cucumber_pom to write the generated test code. Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax first — returns errors instead of writing if validation fails. Use dryRun: true to preview validation without writing. Returns: validation result and list of written files.",
      inputSchema: z.object({
        projectRoot: z.string(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
        dryRun: z.boolean().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    },
    async (args) => textResult(await fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun))
  );
}
