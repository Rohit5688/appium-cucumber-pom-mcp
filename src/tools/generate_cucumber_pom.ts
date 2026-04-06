import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/CodebaseAnalyzerService.js";
import type { TestGenerationService } from "../services/TestGenerationService.js";
import type { LearningService } from "../services/LearningService.js";
import { Logger } from "../utils/Logger.js";
import { textResult } from "./_helpers.js";

export function registerGenerateCucumberPom(
  server: McpServer,
  configService: McpConfigService,
  analyzerService: CodebaseAnalyzerService,
  generationService: TestGenerationService,
  learningService: LearningService
): void {
  server.registerTool(
    "generate_cucumber_pom",
    {
      title: "Generate Cucumber POM",
      description: "WRITE A NEW TEST. Use when the user asks to 'write a test / create a scenario / add automation for X'. Returns a generation PROMPT pre-loaded with your project's existing steps, page objects, and architecture pattern. Does NOT write files itself. After generating, call validate_and_write to save. Returns: generation prompt text.",
      inputSchema: z.object({
        projectRoot: z.string(),
        testDescription: z.string(),
        testName: z.string().optional(),
        screenXml: z.string().optional(),
        screenshotBase64: z.string().optional()
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async (args) => {
      const config = configService.read(args.projectRoot);
      const paths = configService.getPaths(config);
      const analysis = await analyzerService.analyze(args.projectRoot, paths);

      if (analysis.existingPageObjects.length === 0) {
        Logger.warn(`No page objects detected in ${paths.pagesRoot}. Proceeding with fresh generation.`);
      }

      const learningPrompt = learningService.getKnowledgePromptInjection(args.projectRoot);
      const prompt = await generationService.generateAppiumPrompt(
        args.projectRoot,
        args.testDescription,
        config,
        analysis,
        args.testName,
        learningPrompt,
        args.screenXml,
        args.screenshotBase64
      );
      return textResult(prompt);
    }
  );
}
