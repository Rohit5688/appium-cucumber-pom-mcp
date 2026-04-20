import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from 'path';
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { AuditLocatorService } from "../services/audit/AuditLocatorService.js";
import { textResult, truncate, assertNotPlaywrightProject } from "./_helpers.js";
import { McpErrors } from "../types/ErrorSystem.js";

export function registerAuditMobileLocators(
  server: McpServer,
  configService: McpConfigService,
  auditLocatorService: AuditLocatorService
): void {
  server.registerTool(
    "audit_mobile_locators",
    {
      title: "Audit Mobile Locators",
      description: `TRIGGER: User says 'check locators / selectors stable / too many XPaths'
RETURNS: { healthScore: number, breakdown: Array<{file, issues[]}>, recommendations: string[] }
NEXT: If score <50 → Fix XPath/brittle selectors | If score >80 → Ready for production
COST: Medium (scans all Page Objects + YAML files, ~200-400 tokens)
ERROR_HANDLING: Throws McpErrors.projectValidationFailed if health score <50.

Scans Page Objects/YAML. Flags: XPath (❌ brittle), CSS class/ID (⚠️ fragile), accessibility-id (✅ stable).

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const guard = assertNotPlaywrightProject(args.projectRoot);
      if (guard) return guard;

      const config = configService.read(args.projectRoot);
      const paths = configService.getPaths(config);

      // Build candidate locator dirs honoring configured paths with sensible fallbacks
      const locatorsCandidates = [
        paths.pagesRoot,
        paths.locatorsRoot,
        'locators',
        path.join('src', path.basename(paths.locatorsRoot || 'locators'))
      ].map(p => typeof p === 'string' ? p : '').filter(Boolean);

      const report = await auditLocatorService.audit(args.projectRoot, locatorsCandidates);

      // Compute a simple health score: percent of accessibility-id locators
      const total = report.totalLocators || 0;
      const accessibility = report.accessibilityIdCount || 0;
      const healthScore = total > 0 ? Math.round((accessibility / total) * 100) : 100;

      // If health is poor, surface a structured MCP error with the full report
      if (healthScore < 50) {
        const detail = `Locator health score ${healthScore}% is below the acceptable threshold (50%).\n\n` + truncate(report.markdownReport, "report truncated");
        throw McpErrors.projectValidationFailed(detail, "audit_mobile_locators");
      }

      return textResult(report.markdownReport);
    }
  );
}
