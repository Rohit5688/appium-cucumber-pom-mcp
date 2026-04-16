import type { TestGenerationService } from "./TestGenerationService.js";
import type { FileWriterService } from "./FileWriterService.js";
import type { SelfHealingService } from "./SelfHealingService.js";
import type { ISessionVerifier } from "../interfaces/ISessionVerifier.js";
import type { LearningService } from "./LearningService.js";
import type { McpConfigService } from "./McpConfigService.js";
import type { CodebaseAnalyzerService } from "./CodebaseAnalyzerService.js";
import { McpErrors } from "../types/ErrorSystem.js";

/**
 * OrchestrationService: Atomic multi-step operations to reduce turn count.
 * 
 * This service combines multiple tool calls into single atomic transactions,
 * enabling LLMs to accomplish complex tasks in fewer turns while maintaining
 * proper error handling and validation.
 */
export class OrchestrationService {
  constructor(
    private generationService: TestGenerationService,
    private writerService: FileWriterService,
    private healingService: SelfHealingService,
    private verifyService: ISessionVerifier,
    private learningService: LearningService,
    private configService: McpConfigService,
    private analyzerService: CodebaseAnalyzerService
  ) {}

  /**
   * Atomic test creation: validate + write in one transaction.
   * 
   * Validates TypeScript/Gherkin syntax, then writes files to disk atomically.
   * Throws McpErrors on validation failures instead of returning error objects.
   * 
   * @param projectRoot - Project root directory
   * @param files - Array of files to validate and write
   * @returns Success status and list of written files
   * @throws {McpErrors.schemaValidationFailed} When validation fails
   * @throws {McpErrors.fileOperationFailed} When write fails
   */
  public async createTestAtomically(
    projectRoot: string,
    files: { path: string; content: string }[]
  ): Promise<{
    success: boolean;
    filesWritten: string[];
  }> {
    // Step 1: Validate files (dryRun mode - no disk writes)
    const validationResultString = await this.writerService.validateAndWrite(
      projectRoot,
      files,
      3,     // retries
      true   // dryRun
    );

    let validationObj: any = null;
    try {
      validationObj = JSON.parse(validationResultString);
    } catch {
      // If parsing fails, result is likely plain text error - fail safe
      throw McpErrors.schemaValidationFailed(
        `Validation returned non-JSON output: ${validationResultString.slice(0, 200)}`,
        'create_test_atomically'
      );
    }

    // Check validation result
    if (validationObj && validationObj.success === false) {
      const errs = validationObj.errors || validationObj.message || JSON.stringify(validationObj);
      throw McpErrors.schemaValidationFailed(
        Array.isArray(errs) ? errs.join(', ') : String(errs),
        'create_test_atomically'
      );
    }

    // Step 2: Write files to disk (validation passed)
    const writeResultString = await this.writerService.validateAndWrite(
      projectRoot,
      files,
      3,      // retries
      false   // dryRun = false (actual write)
    );

    let writeObj: any = null;
    try {
      writeObj = JSON.parse(writeResultString);
    } catch {
      // Write succeeded but returned non-JSON - treat as success
      return { success: true, filesWritten: files.map(f => f.path) };
    }

    if (writeObj && writeObj.success === false) {
      throw McpErrors.fileOperationFailed(
        writeObj.message || writeObj.error || 'Write failed',
        undefined,
        'create_test_atomically'
      );
    }

    const writtenFiles = writeObj?.filesWritten || files.map(f => f.path);
    return { success: true, filesWritten: Array.isArray(writtenFiles) ? writtenFiles : [String(writtenFiles)] };
  }

  /**
   * Atomic healing: self-heal + verify + train in one call.
   * 
   * Finds replacement selectors for failed locators, verifies the best candidate
   * works on the live device, and auto-trains the learning system to prevent
   * future occurrences.
   * 
   * @param projectRoot - Project root directory
   * @param error - Test failure error message
   * @param xml - Current UI hierarchy XML
   * @param oldSelector - The original failed selector (optional, for learning)
   * @returns Healed selector and verification status
   * @throws {McpErrors.maxHealingAttempts} When no candidates found
   * @throws {McpErrors.invalidParameter} When healed selector doesn't exist
   */
  public async healAndVerifyAtomically(
    projectRoot: string,
    error: string,
    xml: string,
    oldSelector?: string
  ): Promise<{
    healedSelector: string;
    verified: boolean;
    learned: boolean;
    confidence: number;
  }> {
    // Step 1: Get healing candidates with retry logic
    const healResult = await this.healingService.healWithRetry(
      projectRoot,
      error,
      xml,
      '',    // screenshotPath (optional)
      1,     // attempt
      3,     // maxAttempts
      0.7,   // confidenceThreshold
      5      // maxCandidates (get more options)
    );

    const candidates = (healResult?.instruction?.alternativeSelectors as any[]) || [];
    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw McpErrors.maxHealingAttempts(
        projectRoot,
        0,
        'heal_and_verify_atomically'
      );
    }

    // Step 2: Try candidates in order until one verifies
    let healedSelector: string | null = null;
    let confidence = 0;

    for (const candidate of candidates) {
      const selector = typeof candidate === 'string' ? candidate : (candidate.selector ?? String(candidate));
      const candidateConfidence = typeof candidate === 'object' && candidate.confidence ? candidate.confidence : 0.5;

      try {
        const verifyResult = await this.verifyService.verifySelector(selector);
        if (verifyResult && verifyResult.exists) {
          healedSelector = selector;
          confidence = candidateConfidence;
          break;
        }
      } catch (err) {
        // Selector verification failed, try next candidate
        continue;
      }
    }

    if (!healedSelector) {
      throw McpErrors.invalidParameter(
        'selector',
        `None of ${candidates.length} healing candidates exist on current screen`,
        'heal_and_verify_atomically'
      );
    }

    // Step 3: Auto-learn the fix to prevent future occurrences
    const issuePattern = oldSelector
      ? `Failed selector: ${oldSelector}`
      : `Selector failure: ${error.slice(0, 100)}`;

    await this.learningService.learn(
      projectRoot,
      issuePattern,
      healedSelector,
      ['auto-healed', `confidence-${Math.round(confidence * 100)}`]
    );

    return {
      healedSelector,
      verified: true,
      learned: true,
      confidence
    };
  }
}
