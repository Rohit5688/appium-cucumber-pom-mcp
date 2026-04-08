import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a high-connectivity "god node" file.
 */
export interface GodNode {
  file: string;             // Relative path from project root
  absolutePath: string;
  connections: number;      // Number of files that import this file
  importedBy: string[];     // Files that import this
  warning: string;          // Pre-formatted warning message
  severity: 'high' | 'critical';
}

/**
 * StructuralBrainService — scans import graph, identifies god nodes,
 * and emits warnings when high-connectivity files are being modified.
 *
 * Configuration stored at: .AppForge/structural-brain.json
 */
export class StructuralBrainService {
  private static instance: StructuralBrainService;

  /** Minimum import count to qualify as a god node */
  private readonly GOD_NODE_THRESHOLD = 5;
  private readonly CRITICAL_THRESHOLD = 15;

  /** Path to the cached brain file */
  private readonly BRAIN_FILE = path.join(process.cwd(), '.AppForge', 'structural-brain.json');

  private godNodes: GodNode[] = [];
  private lastScanTime: number = 0;
  private readonly SCAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): StructuralBrainService {
    if (!StructuralBrainService.instance) {
      StructuralBrainService.instance = new StructuralBrainService();
    }
    return StructuralBrainService.instance;
  }

  /**
   * Scans the project's src/ directory to build the import graph.
   * Returns a list of god node files above the connection threshold.
   *
   * Results are cached to disk for re-use across sessions.
   */
  public async scanProject(srcDir?: string): Promise<GodNode[]> {
    const targetDir = srcDir ?? path.join(process.cwd(), 'src');

    // Return cached result if fresh
    if (this.godNodes.length > 0 && (Date.now() - this.lastScanTime) < this.SCAN_CACHE_TTL_MS) {
      return this.godNodes;
    }

    // Try loading from disk cache
    const cached = this.loadFromDisk();
    if (cached && cached.length > 0) {
      this.godNodes = cached;
      this.lastScanTime = Date.now();
      return this.godNodes;
    }

    // Full scan
    const tsFiles = this.findTypeScriptFiles(targetDir);
    const importGraph = this.buildImportGraph(tsFiles, targetDir);

    this.godNodes = this.identifyGodNodes(importGraph, targetDir);
    this.lastScanTime = Date.now();

    // Persist to disk
    this.saveToDisk(this.godNodes);

    return this.godNodes;
  }

  /**
   * Returns a warning string if the given file path is a god node.
   * Returns null if the file is safe to edit without special care.
   *
   * @param filePath Absolute or relative path to check
   */
  public getWarning(filePath: string): string | null {
    const absolutePath = path.resolve(filePath);
    const godNode = this.godNodes.find(n => n.absolutePath === absolutePath);
    return godNode?.warning ?? null;
  }

  /**
   * Returns all detected god nodes, sorted by severity.
   */
  public getGodNodes(): GodNode[] {
    return [...this.godNodes].sort((a, b) => b.connections - a.connections);
  }

  /**
   * Formats a pre-flight warning for tool responses.
   * Returns empty string if no warning.
   */
  public formatPreFlightWarning(filePath: string): string {
    const warning = this.getWarning(filePath);
    if (!warning) return '';

    return [
      '─'.repeat(60),
      warning,
      'Proceed with extra care. Test after each change.',
      '─'.repeat(60),
    ].join('\n');
  }

  /**
   * Invalidates the in-memory and disk cache.
   * Call after significant code changes.
   */
  public invalidateCache(): void {
    this.godNodes = [];
    this.lastScanTime = 0;
    try {
      if (fs.existsSync(this.BRAIN_FILE)) {
        fs.unlinkSync(this.BRAIN_FILE);
      }
    } catch { /* non-fatal */ }
  }

  // ─── Private scan methods ─────────────────────────────────────────────────

  private findTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (current: string) => {
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) {
            if (!['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) {
              walk(fullPath);
            }
          } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(fullPath);
          }
        }
      } catch { /* skip inaccessible dirs */ }
    };

    walk(dir);
    return files;
  }

  private buildImportGraph(
    tsFiles: string[],
    baseDir: string
  ): Map<string, Set<string>> {
    // Map: filePath → Set of files that IMPORT it (reverse graph)
    const importedBy = new Map<string, Set<string>>();

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const importPattern = /from\s+['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;

      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
          // Resolve to absolute path
          const resolved = this.resolveImport(importPath, file);
          if (resolved) {
            if (!importedBy.has(resolved)) {
              importedBy.set(resolved, new Set());
            }
            importedBy.get(resolved)!.add(file);
          }
        }
      }
    }

    return importedBy;
  }

  private resolveImport(importPath: string, fromFile: string): string | null {
    const fromDir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '/index.ts'];

    for (const ext of extensions) {
      const candidate = path.resolve(fromDir, importPath + ext);
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  private identifyGodNodes(
    importGraph: Map<string, Set<string>>,
    baseDir: string
  ): GodNode[] {
    const godNodes: GodNode[] = [];

    for (const [filePath, importers] of importGraph.entries()) {
      if (importers.size >= this.GOD_NODE_THRESHOLD) {
        const relPath = path.relative(baseDir, filePath);
        const severity: GodNode['severity'] =
          importers.size >= this.CRITICAL_THRESHOLD ? 'critical' : 'high';

        const icon = severity === 'critical' ? '🔴' : '🟡';
        const warning = [
          `${icon} GOD NODE WARNING: ${relPath}`,
          `This file has ${importers.size} dependents — changes here affect the entire system.`,
          `Top importers: ${[...importers].slice(0, 3).map(f => path.relative(baseDir, f)).join(', ')}${importers.size > 3 ? ` (+${importers.size - 3} more)` : ''}`,
        ].join('\n');

        godNodes.push({
          file: relPath,
          absolutePath: filePath,
          connections: importers.size,
          importedBy: [...importers].map(f => path.relative(baseDir, f)),
          warning,
          severity,
        });
      }
    }

    return godNodes.sort((a, b) => b.connections - a.connections);
  }

  private loadFromDisk(): GodNode[] | null {
    try {
      if (fs.existsSync(this.BRAIN_FILE)) {
        const data = JSON.parse(fs.readFileSync(this.BRAIN_FILE, 'utf-8'));
        if (Array.isArray(data?.godNodes)) return data.godNodes;
      }
    } catch { /* ignore */ }
    return null;
  }

  private saveToDisk(godNodes: GodNode[]): void {
    try {
      const dir = path.dirname(this.BRAIN_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.BRAIN_FILE, JSON.stringify({ godNodes, scannedAt: new Date().toISOString() }, null, 2), 'utf-8');
    } catch { /* non-fatal */ }
  }
}
