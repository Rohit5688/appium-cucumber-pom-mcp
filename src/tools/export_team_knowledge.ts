import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LearningService } from "../services/LearningService.js";
import { textResult } from "./_helpers.js";

export function registerExportTeamKnowledge(
  server: McpServer,
  learningService: LearningService
): void {
  server.registerTool(
    "export_team_knowledge",
    {
      title: "Export Team Knowledge",
      description: "EXPORT LEARNED RULES. Generates a human-readable Markdown table of all rules taught via train_on_example. Use to review what the AI knows about your project, onboard new team members, or audit the knowledge base. Returns: Markdown document with all learned rules.",
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => textResult(learningService.exportToMarkdown(args.projectRoot))
  );
}
