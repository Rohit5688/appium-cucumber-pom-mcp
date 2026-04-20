import path from 'path';
import type { LocatorAuditEntry } from '../services/audit/AuditLocatorService.js';


export class LocatorReportGenerator {
  constructor(protected facade: any) {}

    public generateMarkdownReport(entries: LocatorAuditEntry[], accessibilityIdCount: number, xpathCount: number, otherCount: number): string {
        const lines: string[] = [
                  '# 📊 Mobile Locator Audit Report',
                  '',
                  '## Summary',
                  `| Strategy | Count | Health |`,
                  `|----------|-------|--------|`,
                  `| accessibility-id | ${accessibilityIdCount} | ✅ Stable |`,
                  `| xpath | ${xpathCount} | 🔴 Brittle |`,
                  `| other | ${otherCount} | 🟡 Review |`,
                  '',
                  `**Total Locators**: ${entries.length}`,
                  `**Health Score**: ${entries.length > 0 ? Math.round((accessibilityIdCount / entries.length) * 100) : 0}% stable`,
                  '',
                ];
        const criticals = entries.filter(e => e.severity === 'critical');
        if (criticals.length > 0) {
          lines.push('## 🔴 Critical — XPath Locators (Needs Developer Action)');
          lines.push('');
          lines.push('These locators will break when the UI changes. Ask developers to add `testID` (React Native) or `accessibilityIdentifier` (Swift/Kotlin) to these elements:');
          lines.push('');
          lines.push('| File | Class | Locator | Selector |');
          lines.push('|------|-------|---------|----------|');
          for (const e of criticals) {
            lines.push(`| ${e.file} | ${e.className} | ${e.locatorName} | \`${e.selector}\` |`);
          }
          lines.push('');
        }

        const warnings = entries.filter(e => e.severity === 'warning');
        if (warnings.length > 0) {
          lines.push('## 🟡 Warnings — Review Recommended');
          lines.push('');
          lines.push('| File | Class | Locator | Strategy | Recommendation |');
          lines.push('|------|-------|---------|----------|---------------|');
          for (const e of warnings) {
            lines.push(`| ${e.file} | ${e.className} | ${e.locatorName} | ${e.strategy} | ${e.recommendation} |`);
          }
        }

        return lines.join('\n');
    }
}