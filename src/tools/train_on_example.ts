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
      description: `TEACH A PROJECT RULE. Use when a generation was wrong and you know the correct pattern, or after fixing a broken selector. Saves the rule to .AppForge/mcp-learning.json. All future generate_cucumber_pom calls will incorporate it. Returns: confirmation with the rule ID.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
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
