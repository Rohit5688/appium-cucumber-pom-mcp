import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SelfHealingService } from "../services/SelfHealingService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { AppForgeError } from "../utils/ErrorFactory.js";
import { textResult } from "./_helpers.js";

export function registerVerifySelector(
  server: McpServer,
  selfHealingService: SelfHealingService
): void {
  server.registerTool(
    "verify_selector",
    {
      title: "Verify Selector",
      description: "TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.",
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
          const verification = await selfHealingService.verifyHealedSelector(args.projectRoot ?? process.cwd(), args.selector);
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
        if (err instanceof AppForgeError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'ERROR',
                code: err.code,
                message: err.message,
                remediation: err.details
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: "text" as const, text: JSON.stringify({
              action: 'ERROR',
              code: 'UNHANDLED_ERROR',
              message: err.message || String(err),
              hint: 'Verify that projectRoot is an absolute path, mcp-config.json is valid JSON, and the Appium server is running (if using live session tools).'
            }, null, 2)
          }],
          isError: true
        };
      }
    }
  );
}
