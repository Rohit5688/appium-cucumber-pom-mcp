import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerAnalyzeCodebase(
  server: McpServer,
  configService: McpConfigService,
  analyzerService: CodebaseAnalyzerService
): void {
  server.registerTool(
    "analyze_codebase",
    {
      title: "Analyze Codebase",
      description: `TRIGGER: Scan existing codebase structure before generating code. FOR TINY PROJECTS (<5 files) ONLY.
RETURNS: { existingSteps[], existingPageObjects[], existingUtils[] }
NEXT: Use results to inform test generation → Call generate_cucumber_pom.
COST: High (reads ALL source files — use execute_sandbox_code for large projects, 98% fewer tokens)
ERROR_HANDLING: Standard

Analyzes the codebase using AST. Only use this for very small projects (< 5 files). FOR LARGE PROJECTS, ALWAYS USE 'execute_sandbox_code' (Turbo Mode) instead.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const config = configService.read(args.projectRoot);
      const paths = configService.getPaths(config);
      let customWrapperPackage: string | undefined;
      try {
        const codegen = configService.getCodegen(config);
        if (codegen.customWrapperPackage) {
          customWrapperPackage = codegen.customWrapperPackage;
        }
      } catch { /* config unreadable — proceed without package */ }
      const result = await analyzerService.analyze(args.projectRoot, paths, customWrapperPackage);
      return textResult(truncate(JSON.stringify(result, null, 2), "use execute_sandbox_code for targeted analysis"));
    }
  );
}
