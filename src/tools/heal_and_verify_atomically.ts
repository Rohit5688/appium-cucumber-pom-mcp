import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OrchestrationService } from "../services/system/OrchestrationService.js";
import { textResult } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerHealAndVerifyAtomically(
  server: McpServer,
  orchestrator: OrchestrationService
): void {
  server.registerTool(
    "heal_and_verify_atomically",
    {
      title: "Heal and Verify Atomically",
      description: `TRIGGER: After a test fails with 'element not found' \u2014 fix it without manual chaining.
RETURNS: [HEAL RESULT] block: { healedSelector, verified, learned, confidence }. Read healedSelector \u2014 use it to update Page Object.
NEXT: If verified=true \u2192 update Page Object + call train_on_example | If verified=false \u2192 call inspect_ui_hierarchy for fresh selectors.
COST: Medium (live Appium session verification, ~200-400 tokens)
ERROR_HANDLING: Standard

WORKFLOW ORCHESTRATOR: Self-heal \u2192 Verify \u2192 Learn in one atomic call. Requires active Appium session. Call start_appium_session first if no session exists.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (\u2264 10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        error: z.string().describe("Test failure error message (e.g., 'element not found')"),
        xml: z.string().describe("Current UI hierarchy XML from inspect_ui_hierarchy"),
        oldSelector: z.string().optional().describe("The original failed selector (optional, for better learning)")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      let result: any;
      try {
        result = await orchestrator.healAndVerifyAtomically(
          args.projectRoot,
          args.error,
          args.xml,
          args.oldSelector
        );
      } catch (err: any) {
        throw McpErrors.selfHealFailed(
          err?.message ?? String(err),
          'heal_and_verify_atomically',
          { suggestedNextTools: ['inspect_ui_hierarchy', 'verify_selector', 'self_heal_test'] }
        );
      }
      const block = `[HEAL RESULT]\n${JSON.stringify(result, null, 2)}`;
      return textResult(block);
    }
  );
}