import { SessionManager } from './SessionManager.js';
import { SharedExecState } from './SharedExecState.js';
import { TestRunner } from './TestRunner.js';
import { TagMatcher } from './TagMatcher.js';
import { UiHierarchyInspector } from './UiHierarchyInspector.js';
import { ReportParser } from './ReportParser.js';
import { ExecutionResult, TestJobStatus, TestJob, ParsedElement } from '../../types/ExecutionTypes.js';

export type { ExecutionResult, TestJobStatus, TestJob, ParsedElement };

export class ExecutionService {
  private readonly state: SharedExecState;
  
  // Delegates
  public readonly testRunner: TestRunner;
  public readonly tagMatcher: TagMatcher;
  public readonly uiInspector: UiHierarchyInspector;
  public readonly reportParser: ReportParser;

  // Concern 4, Fix 1: constructor injection replaces nullable set* pattern
  constructor(private readonly sessionManager?: SessionManager) {
    this.state = new SharedExecState(sessionManager);
    
    // Instantiate delegates
    this.testRunner = new TestRunner(this.state, this);
    this.tagMatcher = new TagMatcher(this.state, this);
    this.uiInspector = new UiHierarchyInspector(this.state, this);
    this.reportParser = new ReportParser(this.state, this);
  }

  /** @deprecated — Use constructor injection via ServiceContainer. Retained as no-op shim for legacy call-sites. */
  public setSessionManager(_manager: SessionManager): void {
    // no-op: sessionManager is now injected via constructor
  }

  public async buildCommand(projectRoot: string, tags?: string, platform?: 'android' | 'ios'): Promise<string> {
    return this.testRunner.buildCommand(projectRoot, tags, platform);
  }

  public async countScenarios(projectRoot: string, tags?: string): Promise<number> {
    return this.tagMatcher.countScenarios(projectRoot, tags);
  }

  public async runTest(projectRoot: string, options?: { tags?: string; platform?: 'android' | 'ios'; specificArgs?: string; overrideCommand?: string; timeoutMs?: number; }): Promise<ExecutionResult> {
    return this.testRunner.runTest(projectRoot, options);
  }

  public runTestAsync(projectRoot: string, options?: Parameters<ExecutionService['runTest']>[1]): string {
    return this.testRunner.runTestAsync(projectRoot, options);
  }

  public async getTestStatus(jobId: string, waitMs = 0): Promise<{ found: true; job: TestJob } | { found: false }> {
    return this.testRunner.getTestStatus(jobId, waitMs);
  }

  public async inspectHierarchy(
    projectRoot: string,
    xmlDump?: string,
    screenshotBase64?: string,
    stepHints?: string[],
    includeRawXml?: boolean
  ) {
    return this.uiInspector.inspectHierarchy(projectRoot, xmlDump, screenshotBase64, stepHints, includeRawXml);
  }

  public static classifyWdioError(output: string): string | undefined {
    // Note: Since this was originally static, we can route it through a dummy or recreate logic here
    // However, we made it instance method in ReportParser. We can instantiate one quickly or just put the logic in ReportParser and export it as static there.
    // For now, let's instantiate a dummy one to call the logic, or better yet, make it static in ReportParser.
    // Let's just do a dummy instance to keep the signature intact.
    const dummyState = new SharedExecState();
    const dummyParser = new ReportParser(dummyState, null);
    return dummyParser.classifyWdioError(output);
  }
}