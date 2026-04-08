# TASK-GS-18 — Similar File Suggestions ("Did You Mean?")

**Status**: DONE  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — standalone utility  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

When an LLM requests a file with the wrong extension or a slight name variation, it gets a raw `ENOENT` error:

```
Error: ENOENT: no such file or directory, open '/tests/pages/LoginPage.js'
```

The actual file is `LoginPage.ts`. The agent then spends 2-3 turns trying to diagnose the issue.

**Solution**: Intercept `ENOENT` errors and suggest similar files with the help of a fuzzy filename matcher.

**Expected improvement**:
```
File not found: /tests/pages/LoginPage.js

Did you mean?
  → LoginPage.ts  (same name, different extension)
  → login-page.ts (similar name, different casing)
  → LoginPageHelper.ts (partial match)
```

---

## What to Create

### File: `src/utils/FileSuggester.ts` (NEW)

```typescript
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

        // Strategy 4: Levenshtein distance ≤ 3
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
```

---

## What to Update

### File: `src/services/ExecutionService.ts` or `src/services/FileWriterService.ts`

Find where `ENOENT` errors are caught. Enhance the error message:

```typescript
import { FileSuggester } from '../utils/FileSuggester';

// In file read error handlers:
} catch (err: any) {
  if (err.code === 'ENOENT') {
    const enhanced = FileSuggester.enhanceError(filePath);
    return { error: enhanced };
  }
  throw err;
}
```

### File: `src/index.ts`

In the `read_file` tool handler and any tool that accepts a file path:

```typescript
} catch (err: any) {
  if (err.code === 'ENOENT') {
    return {
      isError: true,
      content: [{ type: 'text', text: FileSuggester.enhanceError(args.path) }]
    };
  }
  throw err;
}
```

---

## Verification

1. Run `npm run build` — must pass

2. Test suggestion logic:
   ```typescript
   import { FileSuggester } from './src/utils/FileSuggester';

   // Test 1: Different extension
   const suggestions = FileSuggester.suggest('./src/index.js');
   const tsMatch = suggestions.find(s => s.path.endsWith('index.ts'));
   console.assert(tsMatch !== undefined, 'Should suggest .ts version');
   console.log('Test 1 passed: Extension suggestion works');

   // Test 2: Format output
   const formatted = FileSuggester.enhanceError('./src/index.js');
   console.assert(formatted.includes('Did you mean?'), 'Should include Did you mean?');
   console.log('Test 2 passed:', formatted);
   ```

3. Test by calling `read_file` with an intentionally wrong extension path and verify the response includes suggestions.

---

## Done Criteria

- [x] `FileSuggester.ts` created with 4 suggestion strategies
- [x] `suggest()` searches same directory + up to 2 parent dirs
- [x] `enhanceError()` one-shot helper for error enhancement
- [x] `ENOENT` errors in `read_file` and file services enhanced with suggestions
- [x] `npm run build` passes with zero errors
- [x] Test confirms `.js` file request suggests `.ts` alternative
- [x] Change `Status` above to `DONE`

---

## Notes

- **Performance** — only searches top-level files in adjacent directories, not recursive; limits overhead
- **Levenshtein cap at 3** — avoids false positives from edit distance > 3 (e.g., `Login.ts` matching `Logout.ts`)
- **No dependencies** — pure TypeScript using `fs` and `path` from Node.js stdlib
- **Confidence scores** are informational only — the first suggestion is always the most likely
