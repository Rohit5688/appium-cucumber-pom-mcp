import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import type { RefactoringService } from "../services/test/RefactoringService.js";
import { textResult, truncate, assertNotPlaywrightProject } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

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
      description: `TRIGGER: User says 'clean up test code / check duplicate steps / is code DRY'
RETURNS: { report: string, duplicateStepCount: number, unusedMethodCount: number, xpathOverusePercent: number }
NEXT: Review report → Consolidate duplicates OR remove unused methods OR fix XPath
COST: Medium (analyzes all steps/page objects, ~300-500 tokens)
ERROR_HANDLING: May throw McpErrors.projectValidationFailed if severe quality issues found.

Finds: duplicate step definitions, unused Page Object methods, XPath over-usage.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const guard = assertNotPlaywrightProject(args.projectRoot);
      if (guard) return guard;

      const config = configService.read(args.projectRoot);
      const paths = configService.getPaths(config);
      const analysis = await analyzerService.analyze(args.projectRoot, paths);

      // Count duplicate step patterns across files
      const stepMap = new Map<string, Set<string>>();
      for (const def of analysis.existingStepDefinitions || []) {
        for (const step of def.steps || []) {
          const key = `${step.type}:${step.pattern}`;
          const files = stepMap.get(key) || new Set<string>();
          files.add(def.file);
          stepMap.set(key, files);
        }
      }
      const duplicates = [...stepMap.entries()].filter(([_, files]) => files.size > 1);
      const duplicateCount = duplicates.length;

      // If duplicate step definitions are excessive, surface a warning as an MCP error
      if (duplicateCount > 10) {
        const suggestions = refactoringService.generateRefactoringSuggestions(analysis);
        const detail = `Duplicate step definition count is high: ${duplicateCount} duplicates detected.\n\n` + truncate(suggestions, "inspect duplicate step list");
        throw McpErrors.projectValidationFailed(detail, "suggest_refactorings");
      }

      const suggestions = refactoringService.generateRefactoringSuggestions(analysis);
      return textResult(suggestions);
    }
  );
}
