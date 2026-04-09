import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from 'path';
import type { McpConfigService } from "../services/McpConfigService.js";
import type { AuditLocatorService } from "../services/AuditLocatorService.js";
import { textResult } from "./_helpers.js";

export function registerAuditMobileLocators(
  server: McpServer,
  configService: McpConfigService,
  auditLocatorService: AuditLocatorService
): void {
  server.registerTool(
    "audit_mobile_locators",
    {
      title: "Audit Mobile Locators",
      description: `LOCATOR HEALTH CHECK. Use when the user says 'check my locators / are my selectors stable / too many XPaths'. Scans Page Objects and YAML locator files. Flags XPath (❌ brittle), CSS class/ID (⚠️ fragile), accessibility-id (✅ stable). Returns a health report with per-file breakdown, health score percentage, and specific lines to fix.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.`,
      inputSchema: z.object({ projectRoot: z.string() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
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
      return textResult(report.markdownReport);
    }
  );
}
