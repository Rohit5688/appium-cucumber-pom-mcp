import * as fs from 'fs';
import * as path from 'path';

export interface FileSuggestion {
  path: string;         // Absolute path
  relativePath: string; // Relative to requestedPath's directory
  reason: string;       // Why this was suggested
  confidence: number;   // 0.0 to 1.0 (higher = more likely match)
}

/**
 * FileSuggester — finds similar files when a requested file doesn't exist.
 *
 * Strategies (in priority order):
 * 1. Same base name, different extension (.js → .ts, .ts → .js)
 * 2. Same name, case-insensitive match (loginPage.ts → LoginPage.ts)
 * 3. Partial name match (Login → LoginPage.ts, LoginHelper.ts)
 * 4. Levenshtein distance ≤ 3 chars (LoginPge.ts → LoginPage.ts)
 */
export class FileSuggester {
  /**
   * Finds similar files to the requested (non-existent) path.
   * Searches the same directory plus up to 2 parent directories.
   *
   * @param requestedPath Absolute path that does not exist
   * @param maxResults    Maximum suggestions to return (default: 5)
   */
  public static suggest(
    requestedPath: string,
    maxResults: number = 5
  ): FileSuggestion[] {
    const dir = path.dirname(requestedPath);
    const requestedBase = path.basename(requestedPath);
    const requestedName = path.basename(requestedPath, path.extname(requestedPath));
    const requestedExt = path.extname(requestedPath);

    const suggestions: FileSuggestion[] = [];

    // Search directories to check
    const searchDirs = [dir, path.dirname(dir), path.join(dir, '..', '..')].filter(
      d => {
        try { return fs.statSync(d).isDirectory(); } catch { return false; }
      }
    );

    for (const searchDir of searchDirs) {
      const files = this.listFiles(searchDir, 1); // Non-recursive for performance

      for (const file of files) {
        const fileBase = path.basename(file);
        const fileName = path.basename(file, path.extname(file));
        const fileExt = path.extname(file);
        const relPath = path.relative(dir, file);

        // Strategy 1: Same name, different extension
        if (fileName.toLowerCase() === requestedName.toLowerCase() && fileExt !== requestedExt) {
          suggestions.push({
            path: file,
            relativePath: relPath,
            reason: `Same name, different extension (${requestedExt} → ${fileExt})`,
            confidence: 0.95,
          });
          continue;
        }

        // Strategy 2: Exact case-insensitive match
        if (fileBase.toLowerCase() === requestedBase.toLowerCase() && fileBase !== requestedBase) {
          suggestions.push({
            path: file,
            relativePath: relPath,
            reason: 'Same filename, different casing',
            confidence: 0.90,
          });
          continue;
        }

        // Strategy 3: Partial name match (requestedName is a prefix or contained)
        if (
          fileName.toLowerCase().includes(requestedName.toLowerCase()) ||
          requestedName.toLowerCase().includes(fileName.toLowerCase())
        ) {
          if (fileName.toLowerCase() !== requestedName.toLowerCase()) {
            suggestions.push({
              path: file,
              relativePath: relPath,
              reason: `Partial name match`,
              confidence: 0.65,
            });
            continue;
          }
        }

        // Strategy 4: Levenshtein distance <= 3
        const dist = this.levenshtein(fileBase.toLowerCase(), requestedBase.toLowerCase());
        if (dist > 0 && dist <= 3) {
          suggestions.push({
            path: file,
            relativePath: relPath,
            reason: `Similar name (${dist} character${dist === 1 ? '' : 's'} different)`,
            confidence: 1 - (dist * 0.2),
          });
        }
      }
    }

    // Deduplicate, sort by confidence, limit results
    const seen = new Set<string>();
    return suggestions
      .filter(s => {
        if (seen.has(s.path)) return false;
        seen.add(s.path);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults);
  }

  /**
   * Formats suggestions as a "Did you mean?" string.
   * Returns empty string if no suggestions.
   */
  public static formatSuggestions(requestedPath: string, suggestions: FileSuggestion[]): string {
    if (suggestions.length === 0) return '';

    const lines = [`\nDid you mean?`];
    for (const s of suggestions) {
      lines.push(`  → ${s.relativePath || s.path}  (${s.reason})`);
    }
    return lines.join('\n');
  }

  /**
   * One-shot: given an ENOENT error message, return enhanced error with suggestions.
   */
  public static enhanceError(filePath: string): string {
    const suggestions = this.suggest(filePath);
    const base = `File not found: ${filePath}`;

    if (suggestions.length === 0) {
      return base + `\n\nVerify the path exists. Use list_directory to browse available files.`;
    }

    return base + this.formatSuggestions(filePath, suggestions);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private static listFiles(dir: string, depth: number): string[] {
    if (depth < 0) return [];
    const results: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          results.push(fullPath);
        }
        // Non-recursive for now — just top level files
      }
    } catch { /* ignore permission errors */ }

    return results;
  }

  /** Standard Levenshtein distance algorithm */
  private static levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }

    return dp[m][n];
  }
}
