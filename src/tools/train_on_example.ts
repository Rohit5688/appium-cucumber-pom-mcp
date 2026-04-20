import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LearningService } from "../services/collaboration/LearningService.js";
import { textResult } from "./_helpers.js";

export function registerTrainOnExample(
  server: McpServer,
  learningService: LearningService
): void {
  server.registerTool(
    "train_on_example",
    {
      title: "Train on Example",
      description: `TRIGGER: Generation was wrong OR fixed broken selector OR learned project pattern
RETURNS: { ruleId: string, pattern: string, solution: string }
NEXT: Future generate_cucumber_pom calls will auto-apply this rule
COST: Low (writes to .AppForge/mcp-learning.json, ~50 tokens)
ERROR_HANDLING: None - always succeeds.

Saves rule to .AppForge/mcp-learning.json. All future generations incorporate learned patterns.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        issuePattern: z.string(),
        solution: z.string(),
        tags: z.array(z.string()).optional(),
        rationale: z
          .string()
          .optional()
          .describe('Why this solution was chosen — prevents future agents from "fixing" this back'),
        antiPatterns: z
          .array(z.string())
          .optional()
          .describe('Approaches that were tried and rejected — e.g. ["do not use XPath here"]'),
        linkedFile: z
          .string()
          .optional()
          .describe('Relative path of the file this rule governs, e.g. "pages/LoginPage.ts"'),
        scope: z
          .enum(['global', 'screen', 'file'])
          .optional()
          .describe('How broadly to apply: global=always, screen=matching screen name, file=only linked file'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const rule = learningService.learn(
        args.projectRoot,
        args.issuePattern,
        args.solution,
        args.tags ?? [],
        {
          rationale: args.rationale,
          antiPatterns: args.antiPatterns,
          linkedFile: args.linkedFile,
          scope: args.scope,
        }
      );
      return textResult(`✅ Learned rule "${rule.id}": When encountering "${rule.pattern}" → apply: ${rule.solution}`);
    }
  );
}
