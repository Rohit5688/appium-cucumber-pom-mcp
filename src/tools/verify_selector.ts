import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SelfHealingService } from "../services/SelfHealingService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";
import { PreFlightService } from "../services/PreFlightService.js";
import { SessionManager } from "../services/SessionManager.js";

export function registerVerifySelector(
  server: McpServer,
  selfHealingService: SelfHealingService
): void {
  server.registerTool(
    "verify_selector",
    {
      title: "Verify Selector",
      description: `TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        selector: z.string(),
        projectRoot: z.string().optional(),
        oldSelector: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async (args) => {
      try {
        return await safeExecute(async () => {
          const projectRoot = args.projectRoot ?? process.cwd();
          
          // Pre-flight check
          const sessionManager = SessionManager.getInstance();
          const sessionInfo = sessionManager.getSessionInfo(projectRoot);
          const preFlight = PreFlightService.getInstance();
          const report = await preFlight.runChecks('http://127.0.0.1:4723', sessionInfo?.sessionId);
          
          if (!report.allPassed) {
            return toMcpErrorResponse(new Error(preFlight.formatReport(report)), 'verify_selector');
          }

          const verification = await selfHealingService.verifyHealedSelector(projectRoot, args.selector);
          if (verification.exists && args.projectRoot) {
            if (args.oldSelector) {
              // Full heal: record the old→new mapping
              selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
              (verification as any).note = "Selector verified and heal automatically learned.";
            } else {
              // Partial: still log the verified selector for future reference
              console.log(`[AppForge] ✅ Selector verified: ${args.selector}`);
              (verification as any).note = "Selector verified. Pass oldSelector to record the full heal mapping.";
            }
          }
          return textResult(JSON.stringify(verification, null, 2), verification as unknown as Record<string, unknown>);
        });
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'CLARIFICATION_REQUIRED',
                question: err.question,
                context: err.context,
                options: err.options ?? []
              }, null, 2)
            }]
          };
        }
        return toMcpErrorResponse(err, 'verify_selector');
      }
    }
  );
}
