import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/CodebaseAnalyzerService.js";
import type { ExecutionService } from "../services/ExecutionService.js";
import { executeSandbox } from "../services/SandboxEngine.js";
import type { SandboxApiRegistry } from "../services/SandboxEngine.js";
import { textResult, truncate } from "./_helpers.js";

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
      description: "🚀 TURBO MODE — USE FOR ALL PROJECT ANALYSIS. Runs a JavaScript snippet in a secure V8 sandbox without reading entire files. Always prefer this over analyze_codebase for real projects. Available APIs: forge.api.analyzeCodebase(projectRoot), forge.api.runTests(projectRoot), forge.api.readFile({ filePath, projectRoot }), forge.api.getConfig(projectRoot). Use `return <value>` in your script.",
      inputSchema: z.object({
        script: z.string(),
        timeoutMs: z.number().optional()
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      // Inline validation for required 'script' field
      if (!args.script || args.script === '') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              code: 'VALIDATION_ERROR',
              message: 'Missing required argument(s): script',
              invalidFields: ['script'],
              hint: 'Provide all required fields and retry.'
            }, null, 2)
          }],
          isError: true as const
        };
      }

      const apiRegistry: SandboxApiRegistry = {
        analyzeCodebase: async (projectRoot: string) => {
          const config = configService.read(projectRoot);
          const paths = configService.getPaths(config);
          let customWrapperPackage: string | undefined;
          try {
            const codegen = configService.getCodegen(config);
            if (codegen.customWrapperPackage) {
              customWrapperPackage = codegen.customWrapperPackage;
            }
          } catch { /* config unreadable — proceed without package */ }
          return analyzerService.analyze(projectRoot, paths, customWrapperPackage);
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
          return fs.default.readFileSync(resolvedFile, 'utf8');
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
        return {
          content: [{ type: "text" as const, text: `❌ SANDBOX ERROR:\n${sandboxResult.error}\n\nLogs:\n${sandboxResult.logs.join('\n')}\n\n⏱️ Failed after ${sandboxResult.durationMs}ms` }],
          isError: true
        };
      }
    }
  );
}
