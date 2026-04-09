import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SelfHealingService } from "../services/SelfHealingService.js";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { SessionManager } from "../services/SessionManager.js";
import { textResult, getPlatformSkill } from "./_helpers.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";
import { PreFlightService } from "../services/PreFlightService.js";

export function registerSelfHealTest(
  server: McpServer,
  selfHealingService: SelfHealingService,
  configService: McpConfigService,
  sessionManager: SessionManager
): void {
  server.registerTool(
    "self_heal_test",
    {
      title: "Self Heal Test",
      description: `FIX BROKEN TESTS. Use when a test failure says 'element not found / no such element / selector not found'. Parses the error and current XML to find the correct replacement selector. Returns: { candidates[], promptForLLM }. After getting candidates, use verify_selector to confirm the best one works.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({
        testOutput: z.string(),
        xmlHierarchy: z.string().optional(),
        screenshotBase64: z.string().optional(),
        attempt: z.number().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Get projectRoot from args or active session
      let projectRoot = (args as any).projectRoot;

      if (!projectRoot) {
        projectRoot = process.cwd();
        console.warn('[AppForge] ⚠️ No projectRoot provided and no active session. Using process.cwd() as fallback.');
      }

      let xmlHierarchy = args.xmlHierarchy as string | undefined;

      // CHICKEN-AND-EGG FIX: if no XML provided, try cache from last successful inspect
      if (!xmlHierarchy) {
        const sessionService = sessionManager.hasActiveSession(projectRoot) ? await sessionManager.getSession(projectRoot) : null;
        const cached = sessionService?.getCachedXml();
        if (cached) {
          xmlHierarchy = cached.xml;
          console.warn(`[self_heal_test] Using cached XML (${cached.ageSeconds}s old). Navigate to the broken screen and re-inspect for fresher data.`);
        }
      }

      if (!xmlHierarchy) {
        return toMcpErrorResponse(new Error('HEAL_BLOCKED: No XML hierarchy available. No live session and no cached XML found. Start a session, navigate to the broken screen, call inspect_ui_hierarchy once, then retry self_heal_test.'), 'self_heal_test');
      }

      // Pre-flight check
      const sessionInfo = sessionManager.getSessionInfo(projectRoot);
      const preFlight = PreFlightService.getInstance();
      const report = await preFlight.runChecks('http://127.0.0.1:4723', sessionInfo?.sessionId);
      
      if (!report.allPassed) {
        return toMcpErrorResponse(new Error(preFlight.formatReport(report)), 'self_heal_test');
      }

      let confidenceThreshold = 0.7;
      let maxCandidates = 3;
      let autoApply = false;

      try {
        const config = configService.read(projectRoot);
        const selfHealCfg = configService.getSelfHeal(config);
        confidenceThreshold = selfHealCfg.confidenceThreshold;
        maxCandidates = selfHealCfg.maxCandidates;
        autoApply = selfHealCfg.autoApply;
      } catch { /* use defaults */ }

      // If screenshot is provided as base64, store it first
      let screenshotPath = '';
      if (args.screenshotBase64) {
        const storage = new (await import('../utils/ScreenshotStorage.js')).ScreenshotStorage(projectRoot);
        const stored = storage.store(args.screenshotBase64, 'heal-input');
        screenshotPath = stored.relativePath;
      }

      const healResult = await selfHealingService.healWithRetry(
        projectRoot,
        args.testOutput,
        xmlHierarchy,
        screenshotPath,
        args.attempt ?? 1,
        3, // maxAttempts
        confidenceThreshold,
        maxCandidates
      );
      const platformContext = getPlatformSkill({ projectRoot, testOutput: args.testOutput });
      const data = {
        candidates: healResult.instruction.alternativeSelectors || [],
        promptForLLM: platformContext + healResult.prompt
      };
      return textResult(JSON.stringify(data, null, 2), data);
    }
  );
}
