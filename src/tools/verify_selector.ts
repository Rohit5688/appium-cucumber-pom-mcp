import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SelfHealingService } from "../services/execution/SelfHealingService.js";
import { safeExecute } from "../utils/ErrorHandler.js";
import { ClarificationRequired } from "../utils/Questioner.js";
import { toMcpErrorResponse, McpError, McpErrorCode } from "../types/ErrorSystem.js";
import { textResult } from "./_helpers.js";
import { PreFlightService } from "../services/setup/PreFlightService.js";
import { SessionManager } from "../services/execution/SessionManager.js";

export function registerVerifySelector(
  server: McpServer,
  selfHealingService: SelfHealingService
): void {
  server.registerTool(
    "verify_selector",
    {
      title: "Verify Selector",
      description: `TRIGGER: Proactively guarantee locators before writing Page Objects.
RETURNS: { exists: boolean, displayed: boolean, enabled: boolean, tagName: string, text: string } — live verification result.
NEXT: If valid → Write locator to Page Object | If invalid → Fix selector and retry.
COST: Low (~50 tokens + live browser query)
ERROR_HANDLING: Standard

Tests a CSS/XPath selector LIVE in the persistent browser without running a full script. Pass autoTrain:true to auto-learn the fix after a successful heal. ⚡ REQUIRES ACTIVE SESSION.

OUTPUT INSTRUCTIONS: Do NOT repeat file path or parameters. Do NOT summarise what you just did. Acknowledge in <=10 words, then proceed. Keep response under 100 words unless explaining an error.`,
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
          if (!args.projectRoot) console.warn('[verify_selector] projectRoot not provided — falling back to process.cwd()');
          const projectRoot = args.projectRoot ?? process.cwd();
          
          // Pre-flight check
          const sessionManager = SessionManager.getInstance();
          const sessionInfo = sessionManager.getSessionInfo(projectRoot);
          const preFlight = PreFlightService.getInstance();
          const report = await preFlight.runChecks('http://127.0.0.1:4723', sessionInfo?.sessionId);
          
          if (!report.allPassed) {
            // If session is missing or stale, suggest starting a session
            const sessionFailure = report.checks.find(c => c.name === 'session_check' && !c.passed);
            if (sessionFailure) {
              const err = new McpError(sessionFailure.message, McpErrorCode.SESSION_NOT_FOUND, {
                toolName: 'verify_selector',
                suggestedNextTools: ['start_appium_session']
              });
              return toMcpErrorResponse(err, 'verify_selector');
            }
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
