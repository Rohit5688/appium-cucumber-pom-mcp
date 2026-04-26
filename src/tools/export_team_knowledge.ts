import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LearningService } from "../services/collaboration/LearningService.js";
import { textResult } from "./_helpers.js";

export function registerExportTeamKnowledge(
  server: McpServer,
  learningService: LearningService
): void {
  server.registerTool(
    "export_team_knowledge",
    {
      title: "Export Team Knowledge",
      description: `TRIGGER: Share the AI's internal knowledge base with the team.
RETURNS: Path to exported docs/team-knowledge.md Markdown file.
NEXT: Commit team-knowledge.md to repository → Share learned rules with team.
COST: Low (~50-100 tokens)
ERROR_HANDLING: Standard

Exports the mcp-learning.json brain into a human-readable Markdown file.

OUTPUT: Ack (<= 10 words), proceed.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => textResult(learningService.exportToMarkdown(args.projectRoot))
  );
}
