import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/CodebaseAnalyzerService.js";
import type { ExecutionService } from "../services/ExecutionService.js";
import { executeSandbox } from "../services/SandboxEngine.js";
import type { SandboxApiRegistry } from "../services/SandboxEngine.js";
import { FileStateService } from "../services/FileStateService.js";
import { FileGuard } from "../utils/FileGuard.js";
import { textResult, truncate } from "./_helpers.js";
import { toMcpErrorResponse } from "../types/ErrorSystem.js";

export function registerExecuteSandboxCode(
  server: McpServer,
  configService: McpConfigService,
  analyzerService: CodebaseAnalyzerService,
  executionService: ExecutionService
): void {
  server.registerTool(
    "execute_sandbox_code",
    {
      title: "Execute Sandbox Code",
      description: `TRIGGER: Need project analysis OR extract data OR avoid token-heavy reads
RETURNS: { success: boolean, result: any, executionTime: number }
NEXT: If analyzing → Use for generate_cucumber_pom | If querying → Proceed with setup/config tools
COST: Low-Medium (50-200 tokens, no file I/O)
ERROR_HANDLING: Throws McpError on syntax/forbidden patterns/timeout

🚀 TURBO MODE — Prefer over analyze_codebase (98% token reduction). APIs: forge.api.analyzeCodebase(projectRoot, {type,searchPattern}), runTests, readFile, getConfig, listFiles, searchFiles, parseAST. Use \`return <value>\`.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        script: z.string(),
        timeoutMs: z.number().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Inline validation for required 'script' field
      if (!args.script || args.script === '') {
        return toMcpErrorResponse(new Error('Missing required argument(s): script'), 'execute_sandbox_code');
      }

      const apiRegistry: SandboxApiRegistry = {
        analyzeCodebase: async (projectRoot: string, filters?: { type?: 'all'|'pages'|'steps'|'utils'|'features'; searchPattern?: string }) => {
          const config = configService.read(projectRoot);
          const paths = configService.getPaths(config);
          let customWrapperPackage: string | undefined;
          try {
            const codegen = configService.getCodegen(config);
            if (codegen.customWrapperPackage) {
              customWrapperPackage = codegen.customWrapperPackage;
            }
          } catch { /* config unreadable — proceed without package */ }
          return analyzerService.analyze(projectRoot, paths, customWrapperPackage, filters);
        },
        runTests: async (projectRoot: string) => {
          return executionService.runTest(projectRoot, {});
        },
        readFile: async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }) => {
          const fs = await import('fs');
          const path = await import('path');
          // Security: ensure the resolved path is strictly inside projectRoot
          const resolvedRoot = path.default.resolve(projectRoot);
          const resolvedFile = path.default.resolve(resolvedRoot, filePath);
          if (!resolvedFile.startsWith(resolvedRoot + path.default.sep) && resolvedFile !== resolvedRoot) {
            throw new Error(`[SECURITY] Path traversal blocked. "${filePath}" resolves outside projectRoot.`);
          }
          if (!fs.default.existsSync(resolvedFile)) {
            throw new Error(`File not found: ${resolvedFile}`);
          }
          const content = FileGuard.readTextFileSafely(resolvedFile);
          FileStateService.getInstance().recordRead(resolvedFile, content);
          return content;
        },
        getConfig: async (projectRoot: string) => {
          return configService.read(projectRoot);
        },

        // --- Enhanced, safe, read-only sandbox APIs (feature-flag gated) ---
        listFiles: async (dir: string, options?: { recursive?: boolean; glob?: string }, projectRoot?: string) => {
          const fs = await import('fs');
          const path = await import('path');
          const os = await import('os');

          const MAX_LIST_ITEMS = 5000;
          const resolvedRoot = projectRoot ? path.default.resolve(projectRoot) : process.cwd();

          // Feature flag check
          if (!configService.hasFeature(resolvedRoot, 'enhancedSandbox')) {
            throw new Error('enhancedSandbox feature disabled');
          }

          const absDir = path.default.resolve(resolvedRoot, dir);
          if (!absDir.startsWith(resolvedRoot + path.default.sep) && absDir !== resolvedRoot) {
            throw new Error(`[SECURITY] Path traversal blocked. "${dir}" resolves outside projectRoot.`);
          }
          if (!fs.default.existsSync(absDir)) {
            throw new Error(`Directory not found: ${absDir}`);
          }

          const walk = (base: string, rel = ''): string[] => {
            const results: string[] = [];
            const entries = fs.default.readdirSync(base, { withFileTypes: true });
            for (const entry of entries) {
              const name = entry.name;
              const full = path.default.join(base, name);
              const relPath = rel ? path.default.join(rel, name) : name;
              const stat = fs.default.lstatSync(full);
              if (stat.isSymbolicLink()) {
                // Do NOT follow symlinks
                continue;
              }
              if (stat.isFile()) results.push(relPath);
              else if (stat.isDirectory() && options?.recursive) {
                results.push(...walk(full, relPath));
              }
              if (results.length >= MAX_LIST_ITEMS) break;
            }
            return results;
          };

          let items = options?.recursive ? walk(absDir, '') : fs.default.readdirSync(absDir).filter(n => {
            try {
              const s = fs.default.lstatSync(path.default.join(absDir, n));
              return !s.isSymbolicLink();
            } catch { return false; }
          });

          // glob support: use the `glob` package to handle patterns safely and reliably
          if (options?.glob) {
            const globModule = await import('glob');
            const globSync = (globModule as any).sync ?? (globModule as any).default?.sync;
            const pattern = path.default.join(absDir, options.glob);
            const matches = globSync(pattern, {
              dot: false,    // don't match dotfiles
              follow: false, // do NOT follow symlinks (CRITICAL)
              nodir: false,
              absolute: true
            }) as string[];
            items = matches.map(m => path.default.relative(absDir, m));
          }
  
          return items.slice(0, MAX_LIST_ITEMS);
        },

        searchFiles: async (pattern: string, dir: string, options?: { filePattern?: string; projectRoot?: string }) => {
          const fs = await import('fs');
          const path = await import('path');

          const MAX_SEARCH_FILES = 1000;
          const MAX_SEARCH_RESULTS = 500;
          const MAX_PARSE_FILE_BYTES = 1024 * 1024; // 1MB

          const projectRoot = options?.projectRoot ? path.default.resolve(options.projectRoot) : process.cwd();
          // Feature flag check
          if (!configService.hasFeature(projectRoot, 'enhancedSandbox')) {
            throw new Error('enhancedSandbox feature disabled');
          }

          // Basic ReDoS heuristic: reject nested quantifiers like (a+)+
          if (/(?:\([^)]*\+[^)]*\)\+)/.test(pattern) || pattern.length > 200) {
            throw new Error('Regex rejected: potential ReDoS');
          }

          let regex: RegExp;
          try {
            regex = new RegExp(pattern, 'gm');
          } catch {
            throw new Error('Invalid regex pattern');
          }

          // Gather files using simple recursive listing
          const files = await apiRegistry.listFiles(dir, { recursive: true, glob: options?.filePattern || '*.ts' }, projectRoot);
          const hits: Array<{ file: string; line: number; text: string }> = [];
          let scanned = 0;

          for (const fileRel of files.slice(0, MAX_SEARCH_FILES)) {
            const fullPath = path.default.join(projectRoot, fileRel);
            try {
              const stats = fs.default.statSync(fullPath);
              if (stats.size > MAX_PARSE_FILE_BYTES) continue;
              const content = FileGuard.readTextFileSafely(fullPath);
              const lines = content.split('\\n');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  hits.push({ file: fileRel, line: i + 1, text: lines[i] });
                  if (hits.length >= MAX_SEARCH_RESULTS) break;
                }
              }
              scanned++;
              if (hits.length >= MAX_SEARCH_RESULTS) break;
            } catch {
              // skip unreadable files
            }
            if (scanned >= MAX_SEARCH_FILES) break;
          }

          return hits.slice(0, MAX_SEARCH_RESULTS);
        },

        parseAST: async (filePath: string, options?: { extractSignatures?: boolean; projectRoot?: string }) => {
          const fs = await import('fs');
          const path = await import('path');
          const ts = await import('typescript');

          const MAX_PARSE_FILE_BYTES = 1024 * 1024; // 1MB
          const projectRoot = options?.projectRoot ? path.default.resolve(options.projectRoot) : process.cwd();

          // Feature flag check
          if (!configService.hasFeature(projectRoot, 'enhancedSandbox')) {
            throw new Error('enhancedSandbox feature disabled');
          }

          const absPath = path.default.resolve(projectRoot, filePath);
          if (!absPath.startsWith(projectRoot + path.default.sep) && absPath !== projectRoot) {
            throw new Error(`[SECURITY] Path traversal blocked. "${filePath}" resolves outside projectRoot.`);
          }
          if (!fs.default.existsSync(absPath)) {
            throw new Error(`File not found: ${absPath}`);
          }
          const stats = fs.default.statSync(absPath);
          if (stats.size > MAX_PARSE_FILE_BYTES) {
            throw new Error(`File too large: ${absPath}`);
          }

          const content = FileGuard.readTextFileSafely(absPath);
          const sourceFile = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true);

          if (options?.extractSignatures) {
            const signatures: Array<{ name: string; type: string; signature: string }> = [];
            const visit = (node: any) => {
              if (ts.isFunctionDeclaration(node) && node.name) {
                signatures.push({
                  name: node.name.text,
                  type: 'function',
                  signature: node.getText().split('{')[0].trim()
                });
              } else if (ts.isClassDeclaration(node) && node.name) {
                signatures.push({
                  name: node.name.text,
                  type: 'class',
                  signature: `class ${node.name.text}`
                });
              }
              ts.forEachChild(node, visit);
            };
            visit(sourceFile);
            return signatures;
          }

          return sourceFile;
        },

        getEnv: async (key: string) => {
          const SAFE_ENV_VARS = [
            'NODE_ENV',
            'CI',
            'GITHUB_ACTIONS',
            'APPIUM_PORT',
            'PLATFORM'
          ];
          if (!SAFE_ENV_VARS.includes(key)) {
            throw new Error(`Environment variable "${key}" is not on the allowlist.`);
          }
          return process.env[key] ?? null;
        }

      };

      const sandboxResult = await executeSandbox(args.script, apiRegistry, { timeoutMs: args.timeoutMs });

      if (sandboxResult.success) {
        const parts: string[] = [];
        if (sandboxResult.logs.length > 0) {
          parts.push(`[Sandbox Logs]\n${sandboxResult.logs.join('\n')}`);
        }
        if (sandboxResult.result != null) {
          parts.push(
            typeof sandboxResult.result === 'string'
              ? sandboxResult.result
              : JSON.stringify(sandboxResult.result, null, 2)
          );
        } else if (sandboxResult.logs.length === 0) {
          parts.push('⚠️ Sandbox executed successfully but returned no data. Ensure your script uses `return <value>` to send results back.');
        }
        parts.push(`\n⏱️ Executed in ${sandboxResult.durationMs}ms`);
        const joined = parts.join('\n\n');
        return textResult(truncate(joined, "narrow your script's return value to reduce output"));
      } else {
        return toMcpErrorResponse(new Error(`SANDBOX ERROR: ${sandboxResult.error}`), 'execute_sandbox_code');
      }
    }
  );
}
