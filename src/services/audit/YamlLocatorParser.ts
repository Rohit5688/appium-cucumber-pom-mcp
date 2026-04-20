import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';
import fsSync from 'fs';
import { McpConfigService } from '../config/McpConfigService.js';
import type { LocatorAuditEntry, LocatorAuditReport } from '../audit/AuditLocatorService.js';


export class YamlLocatorParser {
  constructor(protected facade: any) {}

    /**
     * Parses YAML locator files and returns audit entries.
     * Excludes node_modules, .venv, crew_ai, and dist directories.
     */
    public parseYamlLocators(projectRoot: string): LocatorAuditEntry[] {
        const entries: LocatorAuditEntry[] = [];
        let searchDirs: string[] = ['locators', 'src/locators', 'test/locators', 'config/locators', 'test/fixtures/locators'];
        try {
          const cfgService = new McpConfigService();
          const cfg = cfgService.read(projectRoot);
          const paths = cfgService.getPaths(cfg);
          searchDirs = [
            paths.locatorsRoot,
            'locators',
            `src/${path.basename(paths.locatorsRoot || 'locators')}`,
            'test/locators',
            'config/locators',
            'test/fixtures/locators'
          ].filter(Boolean) as string[];
        } catch {
          // keep defaults
        }

        const normalized = Array.from(new Set(searchDirs.map(d => d.replace(/\\/g, '/'))));
        const existingDirs = normalized.filter(d => {
                  try { return fsSync.existsSync(path.join(projectRoot, d)); } catch { return false; }
                });
        const noisePatterns = ['node_modules', '.venv', 'dist', 'coverage', '.cache', 'build', 'crew_ai'];
        for (const dir of existingDirs) {
          const fullDir = path.join(projectRoot, dir);
          const files = this.facade.tsParser.findFilesRecursive(fullDir, ['.yaml', '.yml'])
          .filter((f: string) => !noisePatterns.some(n => f.includes(n)));

          for (const file of files) {
            const lines = fsSync.readFileSync(file, 'utf8').split('\n');
            for (const line of lines) {
              const match = line.match(/^\s*([\w_]+)\s*:\s*["']?([^#\n'"]+?)["']?\s*(?:#.*)?$/);
              if (!match) continue;
              const [, name, selector] = match;
              const trimmed = selector.trim();
              if (!trimmed) continue;

              let strategy = 'unknown';
              let severity: 'ok' | 'warning' | 'critical' = 'ok';
              let recommendation = '';

              if (trimmed.startsWith('~')) {
                strategy = 'accessibility-id'; severity = 'ok';
                recommendation = '✅ Stable — accessibility-id is recommended';
              } else if (trimmed.startsWith('//') || trimmed.startsWith('(//')) {
                strategy = 'xpath'; severity = 'critical';
                recommendation = '❌ Replace XPath with accessibility-id (~) for stability';
              } else if (trimmed.startsWith('id=')) {
                strategy = 'resource-id'; severity = 'warning';
                recommendation = '⚠️ id= selectors can break on app updates. Use accessibility-id where possible';
              } else if (trimmed.includes(':id/')) {
                strategy = 'resource-id'; severity = 'warning';
                recommendation = '⚠️ Resource-id can break on app updates. Use accessibility-id where possible';
              } else if (trimmed.startsWith('.')) {
                strategy = 'css-class'; severity = 'critical';
                recommendation = '❌ CSS class selectors are brittle. Use accessibility-id (~) instead';
              } else if (trimmed.startsWith('#')) {
                strategy = 'css-id'; severity = 'critical';
                recommendation = '❌ CSS ID selectors are brittle. Use accessibility-id (~) instead';
              } else if (trimmed.startsWith('-ios') || trimmed.startsWith('-android')) {
                strategy = 'mobile-selector'; severity = 'ok';
                recommendation = '✅ Mobile-selector strategies are acceptable';
              }

              if (strategy === 'unknown') continue;

              entries.push({
                file: path.relative(projectRoot, file),
                className: path.basename(file, path.extname(file)),
                locatorName: name,
                strategy,
                selector: trimmed,
                severity,
                recommendation
              });
            }
          }
        }

        return entries;
    }

    public classifyEntry(file: string, className: string, locatorName: string, selector: string): LocatorAuditEntry {
        let strategy: string;
        let severity: 'ok' | 'warning' | 'critical';
        let recommendation: string;
        if (selector.startsWith('~')) {
          strategy = 'accessibility-id';
          severity = 'ok';
          recommendation = '✅ Stable — accessibility-id is the preferred strategy.';
        } else if (selector.startsWith('//')) {
          strategy = 'xpath';
          severity = 'critical';
          recommendation = '🔴 BRITTLE — XPath will break on UI changes. Add testID/accessibility-id to the app source.';
        } else if (selector.startsWith('id=')) {
          // ISSUE #18 FIX: Properly classify id= prefix selectors
          strategy = 'resource-id';
          severity = 'warning';
          recommendation = '🟡 Acceptable — id= selector is stable but prefer accessibility-id for cross-platform.';
        } else if (selector.includes(':id/')) {
          strategy = 'resource-id';
          severity = 'warning';
          recommendation = '🟡 Acceptable — resource-id is stable but prefer accessibility-id for cross-platform.';
        } else if (selector.startsWith('-ios')) {
          strategy = 'ios-predicate';
          severity = 'warning';
          recommendation = '🟡 iOS only — consider adding accessibility-id for cross-platform support.';
        } else {
          strategy = 'other';
          severity = 'warning';
          recommendation = '🟡 Unknown strategy — verify this locator is stable across releases.';
        }

        return { file, className, locatorName, strategy, selector, severity, recommendation };
    }
}