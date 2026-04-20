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
      description: `⚠️ TOKEN-INTENSIVE — ONLY FOR TINY PROJECTS (<5 files). Reads every source file to extract existing steps, page objects, and utilities for reuse in code generation. For ANY real project, use execute_sandbox_code (Turbo Mode) instead — it uses 98% fewer tokens and returns only the data you request. Returns: { existingSteps[], existingPageObjects[], existingUtils[] }.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
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
