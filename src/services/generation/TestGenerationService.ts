import { type McpConfig } from '../config/McpConfigService.js';
import type { CodebaseAnalysisResult } from '../analysis/CodebaseAnalyzerService.js';
import { HybridPromptEngine } from './HybridPromptEngine.js';
import { AppiumPromptBuilder } from './AppiumPromptBuilder.js';
import { NavigationContextBuilder } from './NavigationContextBuilder.js';

export { GeneratedCodeValidator } from './GeneratedCodeValidator.js';
export type { ValidationResult, ValidationIssue, ValidationInput } from './GeneratedCodeValidator.js';

export interface GenerationOutput {
  reusePlan: string;
  filesToCreate: { path: string; content: string }[];
  filesToUpdate: { path: string; content: string; reason: string }[];
  jsonPageObjects?: any[];
  jsonSteps?: any[];
}

export class TestGenerationService {
  public readonly hybridEngine = new HybridPromptEngine();

  public readonly promptBuilder: AppiumPromptBuilder;
  public readonly navContextBuilder: NavigationContextBuilder;

  constructor() {
    this.promptBuilder = new AppiumPromptBuilder(this);
    this.navContextBuilder = new NavigationContextBuilder(this);
  }

  public async generateAppiumPrompt(
    projectRoot: string,
    testDescription: string,
    config: McpConfig,
    analysis: CodebaseAnalysisResult,
    testName?: string,
    learningPrompt?: string,
    screenXml?: string,
    screenshotBase64?: string
  ): Promise<string> {
    return this.promptBuilder.generateAppiumPrompt(
      projectRoot,
      testDescription,
      config,
      analysis,
      testName,
      learningPrompt,
      screenXml,
      screenshotBase64
    );
  }
}
