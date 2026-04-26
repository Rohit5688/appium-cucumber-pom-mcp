import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResult } from "./_helpers.js";
import { StructuralBrainService } from "../services/analysis/StructuralBrainService.js";
import { z } from "zod";

export function registerScanStructuralBrain(server: McpServer): void {
  server.registerTool(
    "scan_structural_brain",
    {
      title: "Scan Structural Brain",
      description: `TRIGGER: Before editing any file — identify if it's a god node and which files will be directly affected.
RETURNS: God node list with severity + "editing this affects: [fileA, fileB]" (1-hop only). Safe-to-edit verdict per file.
NEXT: If target file is a god node → use surgical replace_file_content only, ripple-audit listed dependents after edit.
COST: Low (reads .AppForge/structural-brain.json cache, ~100-200 tokens)
ERROR_HANDLING: Standard

OUTPUT INSTRUCTIONS: Display the god node table. Do not add commentary.`,
      inputSchema: z.object({
        projectRoot: z.string().describe("Absolute path to the project root to scan.")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const brainService = new StructuralBrainService(args.projectRoot);
      brainService.invalidateCache();
      const godNodes = await brainService.scanProject();

      if (godNodes.length === 0) {
        return textResult('No god nodes detected. All files safe to edit freely.');
      }

      const lines: string[] = [`God Nodes (${godNodes.length}) — edit with caution:\n`];
      for (const n of godNodes) {
        const icon = n.severity === 'critical' ? '🔴' : '🟡';
        lines.push(`${icon} ${n.file} — ${n.connections} dependents [${n.severity}]`);
        // 1-hop impact: direct files that import this
        const affected = (n.importedBy ?? []).slice(0, 10);
        if (affected.length > 0) {
          lines.push(`   editing this affects: ${affected.join(', ')}${n.connections > 10 ? ` (+${n.connections - 10} more)` : ''}`);
        }
        lines.push('');
      }

      return textResult(lines.join('\n'));
    }
  );
}
