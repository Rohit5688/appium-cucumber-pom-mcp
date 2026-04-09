import path from 'path';
import { Project } from 'ts-morph';
import fs from 'fs/promises';
import fsSync from 'fs';
import { McpConfigService } from './McpConfigService.js';
export class AuditLocatorService {
    /**
     * Scans all Page Objects in the project and audits their locator strategies.
     * Flags brittle XPaths and generates a Markdown report with recommendations.
     * Supports TypeScript, YAML, and mixed locator architectures.
     */
    async audit(projectRoot, dirsToScan) {
        // Resolve scan directories: prefer explicit dirsToScan, otherwise read MCP config and build sensible candidates
        let scanDirs = [];
        if (dirsToScan && dirsToScan.length > 0) {
            scanDirs = Array.from(new Set(dirsToScan));
        }
        else {
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
                ].filter(Boolean);
                // Keep only existing directories (relative to projectRoot) and de-duplicate
                const existing = [];
                for (const d of candidates) {
                    try {
                        if (fsSync.existsSync(path.join(projectRoot, d)))
                            existing.push(d);
                    }
                    catch { }
                }
                scanDirs = Array.from(new Set(existing));
            }
            catch {
                // Fallback to legacy defaults if config cannot be read
                scanDirs = ['pages', 'src/pages', 'locators', 'src/locators'];
            }
        }
        // Decide file extensions to parse for TypeScript-like page objects.
        // Controlled by MCP config (cfg.analysis.includeJs) or auto-detected JS presence.
        let exts = ['.ts'];
        try {
            const cfgServiceTmp = new McpConfigService();
            const cfgTmp = cfgServiceTmp.read(projectRoot);
            const includeJs = !!(cfgTmp?.analysis?.includeJs);
            if (includeJs) {
                exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
            }
            else {
                // Auto-detect presence of JS files in scanDirs and include JS extensions if found
                const hasJs = scanDirs.some(d => {
                    try {
                        const full = path.join(projectRoot, d);
                        if (!fsSync.existsSync(full))
                            return false;
                        return fsSync.readdirSync(full).some(f => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.jsx'));
                    }
                    catch {
                        return false;
                    }
                });
                if (hasJs)
                    exts.push('.js', '.jsx', '.mjs', '.cjs', '.mjs', '.cjs');
            }
        }
        catch {
            // ignore and keep defaults
        }
        const arch = this.detectArchitecture(projectRoot, scanDirs);
        let allEntries = [];
        if (arch === 'typescript' || arch === 'mixed') {
            allEntries.push(...await this.parseTypeScriptLocators(projectRoot, scanDirs, exts));
        }
        if (arch === 'yaml' || arch === 'mixed') {
            allEntries.push(...this.parseYamlLocators(projectRoot));
        }
        const entries = allEntries;
        const accessibilityIdCount = entries.filter(e => e.strategy === 'accessibility-id').length;
        const xpathCount = entries.filter(e => e.strategy === 'xpath').length;
        const otherCount = entries.length - accessibilityIdCount - xpathCount;
        const report = {
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
    detectArchitecture(projectRoot, tsDirs) {
        // Prefer configured locators path from MCP config, fall back to conventional candidates.
        // Deduplicate candidates and ignore noisy folders during checks.
        let yamlCandidates = ['locators', 'src/locators', 'test/locators', 'resources', 'config/locators', 'test/fixtures/locators'];
        try {
            const cfgService = new McpConfigService();
            const cfg = cfgService.read(projectRoot);
            const paths = cfgService.getPaths(cfg);
            yamlCandidates = [
                paths.locatorsRoot,
                'locators',
                `src/${path.basename(paths.locatorsRoot || 'locators')}`,
                'test/locators',
                'resources',
                'config/locators',
                'test/fixtures/locators'
            ].filter(Boolean);
        }
        catch {
            // keep defaults
        }
        // Normalize and dedupe
        const normalized = Array.from(new Set(yamlCandidates.map(d => d.replace(/\\/g, '/'))));
        const noiseFolders = ['node_modules', '.venv', 'dist', 'coverage', '.cache', 'build'];
        const hasYaml = normalized.some(d => {
            const full = path.join(projectRoot, d);
            try {
                if (!fsSync.existsSync(full))
                    return false;
                const files = fsSync.readdirSync(full);
                return files.some(f => (f.endsWith('.yaml') || f.endsWith('.yml')));
            }
            catch {
                return false;
            }
        });
        const hasTs = tsDirs.some(d => {
            const full = path.join(projectRoot, d);
            try {
                if (!fsSync.existsSync(full))
                    return false;
                const files = fsSync.readdirSync(full);
                return files.some(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'));
            }
            catch {
                return false;
            }
        });
        if (hasYaml && hasTs)
            return 'mixed';
        if (hasYaml)
            return 'yaml';
        return 'typescript';
    }
    /**
     * Parses YAML locator files and returns audit entries.
     * Excludes node_modules, .venv, crew_ai, and dist directories.
     */
    parseYamlLocators(projectRoot) {
        const entries = [];
        // Build search dirs from MCP config if available, otherwise use sensible defaults
        let searchDirs = ['locators', 'src/locators', 'test/locators', 'config/locators', 'test/fixtures/locators'];
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
            ].filter(Boolean);
        }
        catch {
            // keep defaults
        }
        // Normalize, dedupe and keep only existing directories
        const normalized = Array.from(new Set(searchDirs.map(d => d.replace(/\\/g, '/'))));
        const existingDirs = normalized.filter(d => {
            try {
                return fsSync.existsSync(path.join(projectRoot, d));
            }
            catch {
                return false;
            }
        });
        const noisePatterns = ['node_modules', '.venv', 'dist', 'coverage', '.cache', 'build', 'crew_ai'];
        for (const dir of existingDirs) {
            const fullDir = path.join(projectRoot, dir);
            const files = this.findFilesRecursive(fullDir, ['.yaml', '.yml'])
                .filter(f => !noisePatterns.some(n => f.includes(n)));
            for (const file of files) {
                const lines = fsSync.readFileSync(file, 'utf8').split('\n');
                for (const line of lines) {
                    const match = line.match(/^\s*([\w_]+)\s*:\s*["']?([^#\n'"]+?)["']?\s*(?:#.*)?$/);
                    if (!match)
                        continue;
                    const [, name, selector] = match;
                    const trimmed = selector.trim();
                    if (!trimmed)
                        continue;
                    let strategy = 'unknown';
                    let severity = 'ok';
                    let recommendation = '';
                    if (trimmed.startsWith('~')) {
                        strategy = 'accessibility-id';
                        severity = 'ok';
                        recommendation = '✅ Stable — accessibility-id is recommended';
                    }
                    else if (trimmed.startsWith('//') || trimmed.startsWith('(//')) {
                        strategy = 'xpath';
                        severity = 'critical';
                        recommendation = '❌ Replace XPath with accessibility-id (~) for stability';
                    }
                    else if (trimmed.startsWith('id=')) {
                        strategy = 'resource-id';
                        severity = 'warning';
                        recommendation = '⚠️ id= selectors can break on app updates. Use accessibility-id where possible';
                    }
                    else if (trimmed.includes(':id/')) {
                        strategy = 'resource-id';
                        severity = 'warning';
                        recommendation = '⚠️ Resource-id can break on app updates. Use accessibility-id where possible';
                    }
                    else if (trimmed.startsWith('.')) {
                        strategy = 'css-class';
                        severity = 'critical';
                        recommendation = '❌ CSS class selectors are brittle. Use accessibility-id (~) instead';
                    }
                    else if (trimmed.startsWith('#')) {
                        strategy = 'css-id';
                        severity = 'critical';
                        recommendation = '❌ CSS ID selectors are brittle. Use accessibility-id (~) instead';
                    }
                    else if (trimmed.startsWith('-ios') || trimmed.startsWith('-android')) {
                        strategy = 'mobile-selector';
                        severity = 'ok';
                        recommendation = '✅ Mobile-selector strategies are acceptable';
                    }
                    if (strategy === 'unknown')
                        continue;
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
    async parseTypeScriptLocators(projectRoot, dirsToScan, exts = ['.ts']) {
        const pageFiles = [];
        if (!Array.isArray(dirsToScan) || dirsToScan.length === 0)
            return [];
        for (const dirName of dirsToScan) {
            const dirPath = path.join(projectRoot, dirName);
            pageFiles.push(...(await this.listFiles(dirPath, exts)));
        }
        const entries = [];
        if (pageFiles.length === 0)
            return entries;
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
    findFilesRecursive(dir, exts) {
        const results = [];
        let dirEntries;
        try {
            dirEntries = fsSync.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return results;
        }
        for (const entry of dirEntries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                results.push(...this.findFilesRecursive(fullPath, exts));
            }
            else if (exts.some(ext => entry.name.endsWith(ext))) {
                results.push(fullPath);
            }
        }
        return results;
    }
    classifyEntry(file, className, locatorName, selector) {
        let strategy;
        let severity;
        let recommendation;
        if (selector.startsWith('~')) {
            strategy = 'accessibility-id';
            severity = 'ok';
            recommendation = '✅ Stable — accessibility-id is the preferred strategy.';
        }
        else if (selector.startsWith('//')) {
            strategy = 'xpath';
            severity = 'critical';
            recommendation = '🔴 BRITTLE — XPath will break on UI changes. Add testID/accessibility-id to the app source.';
        }
        else if (selector.startsWith('id=')) {
            // ISSUE #18 FIX: Properly classify id= prefix selectors
            strategy = 'resource-id';
            severity = 'warning';
            recommendation = '🟡 Acceptable — id= selector is stable but prefer accessibility-id for cross-platform.';
        }
        else if (selector.includes(':id/')) {
            strategy = 'resource-id';
            severity = 'warning';
            recommendation = '🟡 Acceptable — resource-id is stable but prefer accessibility-id for cross-platform.';
        }
        else if (selector.startsWith('-ios')) {
            strategy = 'ios-predicate';
            severity = 'warning';
            recommendation = '🟡 iOS only — consider adding accessibility-id for cross-platform support.';
        }
        else {
            strategy = 'other';
            severity = 'warning';
            recommendation = '🟡 Unknown strategy — verify this locator is stable across releases.';
        }
        return { file, className, locatorName, strategy, selector, severity, recommendation };
    }
    generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount) {
        const lines = [
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
    async listFiles(dir, exts) {
        let results = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.'))
                    continue;
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(await this.listFiles(fullPath, exts));
                }
                else if (exts.some(ext => entry.name.endsWith(ext))) {
                    results.push(fullPath);
                }
            }
        }
        catch {
            // Directory doesn't exist
        }
        return results;
    }
}
