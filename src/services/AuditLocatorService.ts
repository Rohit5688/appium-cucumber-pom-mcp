import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';
import fsSync from 'fs';

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
  /**
   * Scans all Page Objects in the project and audits their locator strategies.
   * Flags brittle XPaths and generates a Markdown report with recommendations.
   * Supports TypeScript, YAML, and mixed locator architectures.
   */
  public async audit(projectRoot: string, dirsToScan: string[] = ['pages', 'src/pages', 'locators', 'src/locators']): Promise<LocatorAuditReport> {
    const arch = this.detectArchitecture(projectRoot, dirsToScan);
    let allEntries: LocatorAuditEntry[] = [];

    if (arch === 'typescript' || arch === 'mixed') {
      allEntries.push(...await this.parseTypeScriptLocators(projectRoot, dirsToScan));
    }
    if (arch === 'yaml' || arch === 'mixed') {
      allEntries.push(...this.parseYamlLocators(projectRoot));
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
      markdownReport: this.generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount)
    };

    return report;
  }

  /**
   * Detects whether the project uses TypeScript page objects, YAML locator files, or both.
   */
  private detectArchitecture(projectRoot: string, tsDirs: string[]): 'typescript' | 'yaml' | 'mixed' {
    const yamlSearchDirs = ['locators', 'src/locators', 'test/locators', 'resources'];
    const hasYaml = yamlSearchDirs.some(d => {
      const full = path.join(projectRoot, d);
      return fsSync.existsSync(full) &&
        fsSync.readdirSync(full).some(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    });
    const hasTs = tsDirs.some(d => {
      const full = path.join(projectRoot, d);
      return fsSync.existsSync(full) && fsSync.readdirSync(full).some(f => f.endsWith('.ts'));
    });
    if (hasYaml && hasTs) return 'mixed';
    if (hasYaml) return 'yaml';
    return 'typescript';
  }

  /**
   * Parses YAML locator files and returns audit entries.
   * Excludes node_modules, .venv, crew_ai, and dist directories.
   */
  private parseYamlLocators(projectRoot: string): LocatorAuditEntry[] {
    const entries: LocatorAuditEntry[] = [];
    const searchDirs = ['locators', 'src/locators', 'test/locators'];

    for (const dir of searchDirs) {
      const fullDir = path.join(projectRoot, dir);
      if (!fsSync.existsSync(fullDir)) continue;

      const files = this.findFilesRecursive(fullDir, ['.yaml', '.yml'])
        .filter(f =>
          !f.includes('node_modules') &&
          !f.includes('.venv') &&
          !f.includes('crew_ai') &&
          !f.includes('dist')
        );

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
            strategy = 'id'; severity = 'warning';
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

  /**
   * Parses TypeScript page object files and returns audit entries (original logic).
   */
  private async parseTypeScriptLocators(projectRoot: string, dirsToScan: string[]): Promise<LocatorAuditEntry[]> {
    const pageFiles: string[] = [];
    for (const dirName of dirsToScan) {
      const dirPath = path.join(projectRoot, dirName);
      pageFiles.push(...(await this.listFiles(dirPath, ['.ts'])));
    }

    const entries: LocatorAuditEntry[] = [];
    if (pageFiles.length === 0) return entries;

    const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
    for (const f of pageFiles) {
      project.addSourceFileAtPath(f);
    }

    for (const sourceFile of project.getSourceFiles()) {
      for (const cls of sourceFile.getClasses()) {
        const className = cls.getName() ?? 'AnonymousClass';
        const relPath = path.relative(projectRoot, sourceFile.getFilePath());

        // BUG-08 FIX: Match all common WDIO selector call styles:
        //   $('sel')              — WDIO shorthand (original, still supported)
        //   driver.$('sel')       — WDIO v8 explicit driver reference
        //   browser.$('sel')      — WDIO browser global
        //   driver.findElement()  — W3C WebDriver API
        const SELECTOR_PATTERN = /(?:(?:driver|browser)\.)?\$\(\s*['"`](.+?)['"`]\s*\)/;
        const SELECTOR_PATTERN_ALL = /(?:(?:driver|browser)\.)?\$\(\s*['"`](.+?)['"`]\s*\)/g;
        const FIND_ELEMENT_PATTERN = /(?:driver|browser)\.findElement\s*\(\s*['"`]?([^)]+?)['"`]?\s*\)/g;

        // Scan getters
        for (const getter of cls.getGetAccessors()) {
          const body = getter.getBody()?.getText() ?? '';
          const match = body.match(SELECTOR_PATTERN);
          if (match) {
            entries.push(this.classifyEntry(relPath, className, getter.getName(), match[1]));
          }
        }

        // Scan properties
        for (const prop of cls.getProperties()) {
          const initializer = prop.getInitializer()?.getText() ?? '';
          const match = initializer.match(SELECTOR_PATTERN);
          if (match) {
            entries.push(this.classifyEntry(relPath, className, prop.getName(), match[1]));
          }
        }

        // Scan method bodies for inline selectors (all WDIO patterns + findElement)
        for (const method of cls.getMethods()) {
          const body = method.getBody()?.getText() ?? '';
          for (const m of body.matchAll(SELECTOR_PATTERN_ALL)) {
            entries.push(this.classifyEntry(relPath, className, `${method.getName()}() inline`, m[1]));
          }
          for (const m of body.matchAll(FIND_ELEMENT_PATTERN)) {
            entries.push(this.classifyEntry(relPath, className, `${method.getName()}() findElement`, m[1]));
          }
        }
      }
    }
    return entries;
  }

  /**
   * Recursively finds files with the given extensions in a directory (sync).
   */
  private findFilesRecursive(dir: string, exts: string[]): string[] {
    const results: string[] = [];
    let dirEntries: fsSync.Dirent[];
    try {
      dirEntries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of dirEntries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findFilesRecursive(fullPath, exts));
      } else if (exts.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private classifyEntry(file: string, className: string, locatorName: string, selector: string): LocatorAuditEntry {
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

  private generateMarkdownReport(
    entries: LocatorAuditEntry[],
    accessibilityIdCount: number,
    xpathCount: number,
    otherCount: number
  ): string {
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

  private async listFiles(dir: string, exts: string[]): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await this.listFiles(fullPath, exts));
        } else if (exts.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return results;
  }
}
