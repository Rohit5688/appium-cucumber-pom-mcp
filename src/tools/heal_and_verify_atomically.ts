import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OrchestrationService } from "../services/system/OrchestrationService.js";
import { textResult } from "./_helpers.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";

export function registerHealAndVerifyAtomically(
  server: McpServer,
  orchestrator: OrchestrationService
): void {
  server.registerTool(
    "heal_and_verify_atomically",
    {
      title: "Heal and Verify Atomically",
      description: `WORKFLOW ORCHESTRATOR: Self-heal → Verify → Learn in one atomic call. Use when a test fails with 'element not found' to fix it without manual chaining. Finds replacement selectors, verifies the best candidate works on the live device, and auto-trains the learning system. Returns: { healedSelector: string, verified: boolean, learned: boolean, confidence: number }. NEXT: Update Page Object with healed selector.

NOTE: Requires active Appium session. Call start_appium_session first if no session exists.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        error: z.string().describe("Test failure error message (e.g., 'element not found')"),
        xml: z.string().describe("Current UI hierarchy XML from inspect_ui_hierarchy"),
        oldSelector: z.string().optional().describe("The original failed selector (optional, for better learning)")
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      try {
        const result = await orchestrator.healAndVerifyAtomically(
          args.projectRoot,
          args.error,
          args.xml,
          args.oldSelector
        );
        return textResult(JSON.stringify(result, null, 2));
      } catch (err) {
        return toMcpErrorResponse(err, 'heal_and_verify_atomically');
      }
    }
  );
}