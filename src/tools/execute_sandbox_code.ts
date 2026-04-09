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
      description: `🚀 TURBO MODE — USE FOR ALL PROJECT ANALYSIS. Runs a JavaScript snippet in a secure V8 sandbox without reading entire files. Always prefer this over analyze_codebase for real projects. Available APIs: forge.api.analyzeCodebase(projectRoot, { type?: 'all'|'pages'|'steps'|'utils', searchPattern?: string }), forge.api.runTests(projectRoot), forge.api.readFile({ filePath, projectRoot }), forge.api.getConfig(projectRoot). Use \`return <value>\` in your script.

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words). Avoid returning full AST dumps; use Javascript array.slice() or map() on large arrays, or pass filters into analyzeCodebase to avoid truncations matching the 25k char limit.`,
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
