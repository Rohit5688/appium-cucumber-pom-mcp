import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpConfigService } from "../services/config/McpConfigService.js";
import type { CodebaseAnalyzerService } from "../services/analysis/CodebaseAnalyzerService.js";
import type { TestGenerationService } from "../services/generation/TestGenerationService.js";
import type { LearningService } from "../services/collaboration/LearningService.js";
import { Logger } from "../utils/Logger.js";
import { textResult, getPlatformSkill } from "./_helpers.js";

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
      description: `TRIGGER: User requests test creation OR automation for feature OR coverage gap
RETURNS: Generation prompt with existing steps/page objects/utilities/patterns
NEXT: LLM generates code → validate_and_write → run_cucumber_test
COST: Medium (5-15 files, ~300-500 tokens)
ERROR_HANDLING: Returns prompt even if no page objects exist. Throws if projectRoot invalid.

Loads: existing steps, page objects, utilities, learned patterns, platform skills.

OUTPUT: Ack (≤10 words), proceed.`,
      inputSchema: z.object({
        projectRoot: z.string(),
        testDescription: z.string().min(1, "testDescription cannot be empty"),
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

      const learningPrompt = learningService.getKnowledgePromptInjection(
        args.projectRoot,
        {
          screenName: args.testName,       // matches rules tagged with screen name
          toolName: 'generate_cucumber_pom', // matches rules tagged with this tool
        }
      );
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
      
      const platformContext = getPlatformSkill({ 
        projectRoot: args.projectRoot, 
        testName: args.testName, 
        testDescription: args.testDescription 
      });
      return textResult(prompt + platformContext);
    }
  );
}
