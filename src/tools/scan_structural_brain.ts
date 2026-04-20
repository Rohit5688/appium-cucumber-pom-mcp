import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResult } from "./_helpers.js";
import { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";
import { z } from "zod";

export function registerScanStructuralBrain(server: McpServer): void {
  server.registerTool(
    "scan_structural_brain",
    {
      title: "Scan Structural Brain",
      description: `Scans the project's import graph to identify god nodes (high-connectivity files). Returns a list of files that are heavily depended upon and require extra caution when editing.

OUTPUT INSTRUCTIONS: Display the god node table. Do not add commentary.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      const brainService = StructuralBrainService.getInstance();
      brainService.invalidateCache();
      const godNodes = await brainService.scanProject();

      const report = godNodes.length === 0
        ? 'No god nodes detected. Codebase has healthy decoupling.'
        : [`God Nodes (${godNodes.length}):\n`, ...godNodes.map(n =>
            `  ${n.severity === 'critical' ? '🔴' : '🟡'} ${n.file} — ${n.connections} dependents`
          )].join('\n');

      return textResult(report);
    }
  );
}
