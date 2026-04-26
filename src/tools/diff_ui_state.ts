import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionService } from "../services/execution/ExecutionService.js";
import { textResult } from "./_helpers.js";
import { McpError, McpErrorCode } from "../types/ErrorSystem.js";
import { SessionManager } from "../services/execution/SessionManager.js";

/**
 * Computes a structural diff between two Appium XML snapshots.
 * Returns: added elements, removed elements, changed attributes.
 * Avoids full XML parse — uses regex for speed and zero-dependency operation.
 */
function diffXml(xmlBefore: string, xmlAfter: string): {
  added: string[];
  removed: string[];
  changed: string[];
  summary: string;
} {
  // Extract all resource-id / content-desc / text attribute values as "element fingerprints"
  const fingerprint = (xml: string): Map<string, string> => {
    const map = new Map<string, string>();
    const pattern = /resource-id="([^"]+)"|content-desc="([^"]+)"|text="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(xml)) !== null) {
      const key = m[1] || m[2] || m[3]!;
      const attrName = m[1] ? 'resource-id' : m[2] ? 'content-desc' : 'text';
      map.set(key, attrName);
    }
    return map;
  };

  const before = fingerprint(xmlBefore);
  const after = fingerprint(xmlAfter);

  const added: string[] = [];
  const removed: string[] = [];

  for (const [key, attr] of after.entries()) {
    if (!before.has(key)) added.push(`[${attr}="${key}"] appeared`);
  }
  for (const [key, attr] of before.entries()) {
    if (!after.has(key)) removed.push(`[${attr}="${key}"] disappeared`);
  }

  // Detect clickable/enabled/checked attribute changes
  const changed: string[] = [];
  const attrPattern = /resource-id="([^"]+)"[^/]*?(enabled|clickable|checked)="(true|false)"/g;
  const beforeAttrs = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = attrPattern.exec(xmlBefore)) !== null) {
    beforeAttrs.set(`${m[1]}.${m[2]}`, m[3]!);
  }
  const attrPatternAfter = /resource-id="([^"]+)"[^/]*?(enabled|clickable|checked)="(true|false)"/g;
  while ((m = attrPatternAfter.exec(xmlAfter)) !== null) {
    const key = `${m[1]}.${m[2]}`;
    const prev = beforeAttrs.get(key);
    if (prev && prev !== m[3]) {
      changed.push(`[id="${m[1]}"] ${m[2]}: ${prev} → ${m[3]}`);
    }
  }

  const noChange = added.length === 0 && removed.length === 0 && changed.length === 0;
  const summary = noChange
    ? '✅ No structural changes detected between snapshots.'
    : `⚡ Changes: +${added.length} appeared | -${removed.length} disappeared | ~${changed.length} attribute change(s)`;

  return { added, removed, changed, summary };
}

export function registerDiffUiState(
  server: McpServer,
  _executionService: ExecutionService
): void {
  server.registerTool(
    "diff_ui_state",
    {
      title: "Diff UI State",
      description: `TRIGGER: After tapping/interacting to verify the action had effect, OR to debug "did my action work?"
RETURNS: { added[], removed[], changed[], summary } — structural diff of two XML snapshots.
WHY: After a tap/swipe, inspect_ui_hierarchy gives a new XML but you don't know what changed. This tool closes the loop — confirms the action worked or surfaces what is still wrong.
NEXT: If expected element appeared in added[] → action succeeded | If added[] is empty → action had no effect, re-inspect.
COST: Low (pure XML analysis, no device interaction, ~100-200 tokens)`,
      inputSchema: z.object({
        xmlBefore: z.string().describe("XML snapshot BEFORE the interaction (from inspect_ui_hierarchy source field)."),
        xmlAfter: z.string().describe("XML snapshot AFTER the interaction (from a second inspect_ui_hierarchy call).")
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      const { xmlBefore, xmlAfter } = args as { xmlBefore: string; xmlAfter: string };

      if (!xmlBefore?.trim() || !xmlAfter?.trim()) {
        throw new McpError('xmlBefore and xmlAfter are required.', McpErrorCode.INVALID_PARAMETER, { toolName: 'diff_ui_state' });
      }

      const diff = diffXml(xmlBefore, xmlAfter);

      const lines = [
        `[UI STATE DIFF] ${diff.summary}`,
        '',
      ];

      if (diff.added.length > 0) {
        lines.push(`✅ Appeared (${diff.added.length}):`);
        diff.added.forEach(a => lines.push(`  + ${a}`));
      }
      if (diff.removed.length > 0) {
        lines.push(`🗑️  Disappeared (${diff.removed.length}):`);
        diff.removed.forEach(r => lines.push(`  - ${r}`));
      }
      if (diff.changed.length > 0) {
        lines.push(`🔄 Attribute changed (${diff.changed.length}):`);
        diff.changed.forEach(c => lines.push(`  ~ ${c}`));
      }
      if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
        lines.push('⚠️  Action may not have had a visual effect. Verify gesture coordinates or element state before the interaction.');
      }

      return textResult(lines.join('\n'), diff);
    }
  );
}
