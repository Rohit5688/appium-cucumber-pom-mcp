import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/CodebaseAnalyzerService.js";
import type { RefactoringService } from "../services/RefactoringService.js";
import { textResult, truncate } from "./_helpers.js";

export function registerSuggestRefactorings(
  server: McpServer,
  configService: McpConfigService,
  analyzerService: CodebaseAnalyzerService,
  refactoringService: RefactoringService
): void {
  server.registerTool(
    "suggest_refactorings",
    {
      title: "Suggest Refactorings",
      description: `FIND CODE QUALITY ISSUES. Use when the user says 'clean up my test code / check for duplicate steps / is my code DRY'. Finds duplicate step definitions, potentially unused Page Object methods, and XPath over-usage percentage. Returns: { report, duplicateStepCount, unusedMethodCount, xpathOverusePercent }.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const config = configService.read(args.projectRoot);
      const paths = configService.getPaths(config);
      const analysis = await analyzerService.analyze(args.projectRoot, paths);
      return textResult(refactoringService.generateRefactoringSuggestions(analysis));
    }
  );
}
