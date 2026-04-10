import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LearningService } from "../services/LearningService.js";
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
        tags: z.array(z.string()).optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const rule = learningService.learn(args.projectRoot, args.issuePattern, args.solution, args.tags ?? []);
      return textResult(`✅ Learned rule "${rule.id}": When encountering "${rule.pattern}" → apply: ${rule.solution}`);
    }
  );
}
