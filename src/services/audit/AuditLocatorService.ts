import path from 'path';
import fsSync from 'fs';
import { McpConfigService } from '../config/McpConfigService.js';
import { YamlLocatorParser } from './YamlLocatorParser.js';
import { TypeScriptLocatorParser } from './TypeScriptLocatorParser.js';
import { LocatorReportGenerator } from '../../utils/LocatorReportGenerator.js';

export interface LocatorAuditEntry {
  file: string;
  className: string;
  locatorName: string;
  strategy: string;
  selector: string;
  severity: 'ok' | 'warning' | 'critical';
  recommendation: string;
}

export interface LocatorAuditReport {
  totalLocators: number;
  accessibilityIdCount: number;
  xpathCount: number;
  otherCount: number;
  entries: LocatorAuditEntry[];
  markdownReport: string;
}

export class AuditLocatorService {
  public yamlParser: YamlLocatorParser;
  public tsParser: TypeScriptLocatorParser;
  public reportGenerator: LocatorReportGenerator;

  constructor() {
    this.yamlParser = new YamlLocatorParser(this);
    this.tsParser = new TypeScriptLocatorParser(this);
    this.reportGenerator = new LocatorReportGenerator(this);
  }

  /**
   * Scans all Page Objects in the project and audits their locator strategies.
   * Flags brittle XPaths and generates a Markdown report with recommendations.
   * Supports TypeScript, YAML, and mixed locator architectures.
   */
  public async audit(projectRoot: string, dirsToScan?: string[]): Promise<LocatorAuditReport> {
    // Resolve scan directories
    let scanDirs: string[] = [];
    if (dirsToScan && dirsToScan.length > 0) {
      scanDirs = Array.from(new Set(dirsToScan));
    } else {
      try {
        const cfgService = new McpConfigService();
        const cfg = cfgService.read(projectRoot);
        const paths = cfgService.getPaths(cfg);
        const candidates = [
          paths.pagesRoot,
          paths.locatorsRoot,
          paths.testDataRoot,
          'locators',
          `src/${path.basename(paths.locatorsRoot || 'locators')}`
        ].filter(Boolean) as string[];

        const existing: string[] = [];
        for (const d of candidates) {
          try {
            if (fsSync.existsSync(path.join(projectRoot, d))) existing.push(d);
          } catch {}
        }
        scanDirs = Array.from(new Set(existing));
      } catch {
        scanDirs = ['pages', 'src/pages', 'locators', 'src/locators'];
      }
    }

    // Decide file extensions
    let exts: string[] = ['.ts'];
    try {
      const cfgServiceTmp = new McpConfigService();
      const cfgTmp = cfgServiceTmp.read(projectRoot);
      const includeJs = !!((cfgTmp as any)?.analysis?.includeJs);
      if (includeJs) {
        exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
      } else {
        const hasJs = scanDirs.some(d => {
          try {
            const full = path.join(projectRoot, d);
            if (!fsSync.existsSync(full)) return false;
            return fsSync.readdirSync(full).some(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.jsx'));
          } catch { return false; }
        });
        if (hasJs) exts.push('.js', '.jsx', '.mjs', '.cjs', '.mjs', '.cjs');
      }
    } catch {
      // ignore
    }

    const arch = this.tsParser.detectArchitecture(projectRoot, scanDirs);
    let allEntries: LocatorAuditEntry[] = [];

    if (arch === 'typescript' || arch === 'mixed') {
      allEntries.push(...await this.tsParser.parseTypeScriptLocators(projectRoot, scanDirs, exts));
    }
    if (arch === 'yaml' || arch === 'mixed') {
      allEntries.push(...this.yamlParser.parseYamlLocators(projectRoot));
    }

    const entries = allEntries;
    const accessibilityIdCount = entries.filter(e => e.strategy === 'accessibility-id').length;
    const xpathCount = entries.filter(e => e.strategy === 'xpath').length;
    const otherCount = entries.length - accessibilityIdCount - xpathCount;

    const report: LocatorAuditReport = {
      totalLocators: entries.length,
      accessibilityIdCount,
      xpathCount,
      otherCount,
      entries,
      markdownReport: this.reportGenerator.generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount)
    };

    return report;
  }
}
