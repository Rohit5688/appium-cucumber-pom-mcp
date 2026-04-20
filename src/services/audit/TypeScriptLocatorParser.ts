import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';
import fsSync from 'fs';
import { McpConfigService } from '../config/McpConfigService.js';
import type { LocatorAuditEntry, LocatorAuditReport } from '../audit/AuditLocatorService.js';


export class TypeScriptLocatorParser {
  constructor(protected facade: any) {}

    /**
     * Parses TypeScript page object files and returns audit entries (original logic).
     */
    public async parseTypeScriptLocators(projectRoot: string, dirsToScan: string[], exts: string[] = ['.ts']): Promise<LocatorAuditEntry[]> {
        const pageFiles: string[] = [];
        if (!Array.isArray(dirsToScan) || dirsToScan.length === 0) return [];
        for (const dirName of dirsToScan) {
          const dirPath = path.join(projectRoot, dirName);
          pageFiles.push(...(await this.listFiles(dirPath, exts)));
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
                entries.push(this.facade.yamlParser.classifyEntry(relPath, className, getter.getName(), match[1]));
              }
            }

            // Scan properties
            for (const prop of cls.getProperties()) {
              const initializer = prop.getInitializer()?.getText() ?? '';
              const match = initializer.match(SELECTOR_PATTERN);
              if (match) {
                entries.push(this.facade.yamlParser.classifyEntry(relPath, className, prop.getName(), match[1]));
              }
            }

            // Scan method bodies for inline selectors (all WDIO patterns + findElement)
            for (const method of cls.getMethods()) {
              const body = method.getBody()?.getText() ?? '';
              for (const m of body.matchAll(SELECTOR_PATTERN_ALL)) {
                entries.push(this.facade.yamlParser.classifyEntry(relPath, className, `${method.getName()}() inline`, m[1]));
              }
              for (const m of body.matchAll(FIND_ELEMENT_PATTERN)) {
                entries.push(this.facade.yamlParser.classifyEntry(relPath, className, `${method.getName()}() findElement`, m[1]));
              }
            }
          }
        }

        return entries;
    }

    /**
     * Detects whether the project uses TypeScript page objects, YAML locator files, or both.
     */
    public detectArchitecture(projectRoot: string, tsDirs: string[]): 'typescript' | 'yaml' | 'mixed' {
        let yamlCandidates: string[] = ['locators', 'src/locators', 'test/locators', 'resources', 'config/locators', 'test/fixtures/locators'];
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
          ].filter(Boolean) as string[];
        } catch {
          // keep defaults
        }

        const normalized = Array.from(new Set(yamlCandidates.map(d => d.replace(/\\/g, '/'))));
        const noiseFolders = ['node_modules', '.venv', 'dist', 'coverage', '.cache', 'build'];
        const hasYaml = normalized.some(d => {
                  const full = path.join(projectRoot, d);
                  try {
                    if (!fsSync.existsSync(full)) return false;
                    const files = fsSync.readdirSync(full);
                    return files.some(f => (f.endsWith('.yaml') || f.endsWith('.yml')));
                  } catch {
                    return false;
                  }
                });
        const hasTs = tsDirs.some(d => {
                  const full = path.join(projectRoot, d);
                  try {
                    if (!fsSync.existsSync(full)) return false;
                    const files = fsSync.readdirSync(full);
                    return files.some(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'));
                  } catch {
                    return false;
                  }
                });
        if (hasYaml && hasTs) return 'mixed';
        if (hasYaml) return 'yaml';
        return 'typescript';
    }

    /**
     * Recursively finds files with the given extensions in a directory (sync).
     */
    public findFilesRecursive(dir: string, exts: string[]): string[] {
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

    public async listFiles(dir: string, exts: string[]): Promise<string[]> {
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