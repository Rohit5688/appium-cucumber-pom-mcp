import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { McpConfigService } from '../config/McpConfigService.js';
import { Logger } from '../../utils/Logger.js';
import { ScreenshotStorage } from '../../utils/ScreenshotStorage.js';
import { AppForgeError } from '../../utils/ErrorFactory.js';
import { ShellSecurityEngine } from '../../utils/ShellSecurityEngine.js';
import { McpErrors } from '../../types/ErrorSystem.js';
import { ExecutionResult, TestJob } from '../../types/ExecutionTypes.js';
import { SharedExecState } from './SharedExecState.js';

const execFileAsync = promisify(execFile);


export class TestRunner {
  constructor(protected state: SharedExecState, protected facade: any) { }

  get sessionManager() { return this.state.sessionManager; }
  get jobs() { return this.state.jobs; }

  /**
   * Executes Cucumber Appium tests with tag and platform filtering.
   * If a live session is active and tests fail, auto-captures screenshot + XML for healing.
   *
   * Issue #17 FIX:
   * - Validates tags against allowlist: only
   * @ , word chars, spaces, brackets, logical operators
   * - Rejects specificArgs containing shell metacharacters (; & | ` $ > < ' " \ !)
   * - Uses execFile with args array instead of execAsync(string) to eliminate shell interpolation
   *
   * Timeout FIX:
   * - Supports configurable timeout with resolution order:
   *   1. Explicit timeoutMs parameter
   *   2. mcp-config.json execution.timeoutMs
   *   3. Detected from wdio.conf.ts (cucumberOpts.timeout or waitforTimeout)
   *   4. Default: 30 minutes (1800000 ms)
   */
  public async runTest(projectRoot: string, options?: {
    tags?: string;
    platform?: 'android' | 'ios';
    specificArgs?: string;
    overrideCommand?: string;
    timeoutMs?: number;
  }): Promise<ExecutionResult> {
    if (options?.tags && !this.facade.tagMatcher.validateTagExpression(options.tags)) {
      return {
        success: false,
        output: '',
        error: `Invalid tag expression: "${options.tags}". Tags must only contain alphanumeric characters, @, spaces, parentheses, and logical operators (!, &, |, comma).`
      };
    }

    if (options?.specificArgs) {
      const specificArgsArr = options.specificArgs.split(/\s+/).filter(arg => arg.length > 0);
      const argsCheck = ShellSecurityEngine.validateArgs(specificArgsArr, 'run_cucumber_test');
      if (!argsCheck.safe) {
        throw McpErrors.shellInjectionDetected(
          ShellSecurityEngine.formatViolations(argsCheck),
          'run_cucumber_test'
        );
      }
    }

    const configService = new McpConfigService();
    let config;
    try {
      config = configService.read(projectRoot);
    } catch {
      config = null;
    }

    const timeout = await this.facade.reportParser.resolveTimeout(projectRoot, options?.timeoutMs, config);
    try {
      const fs = await import('fs');
      let command = '';
      if (options?.overrideCommand) {
        // Validate overrideCommand doesn't contain obvious injection attempts via ShellSecurityEngine
        const overrideArgs = options.overrideCommand.split(/\s+/).filter(a => a.length > 0);
        const argCheck = ShellSecurityEngine.validateArgs(overrideArgs, 'run_cucumber_test');
        if (!argCheck.safe) {
          throw McpErrors.shellInjectionDetected(
            ShellSecurityEngine.formatViolations(argCheck),
            'run_cucumber_test'
          );
        }
        command = options.overrideCommand;
      } else if (config?.project?.executionCommand) {
        command = config.project.executionCommand;
      } else {
        const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
          ? 'wdio.conf.ts'
          : fs.existsSync(path.join(projectRoot, 'wdio.conf.js'))
            ? 'wdio.conf.js'
            : null;
        if (defaultConf) {
          command = `npx wdio run ${defaultConf}`;
          Logger.info(`No executionCommand configured — using detected: ${command}`);
        } else {
          throw new AppForgeError(
            "E008_PRECONDITION_FAIL",
            'No test execution command found.',
            ['Add "project": { "executionCommand": "npx wdio run wdio.conf.ts" } to mcp-config.json',
              'Or pass overrideCommand to run_cucumber_test']
          );
        }
      }

      // We only append specific arguments if we're dealing with a wdio execution command natively
      // Otherwise we just run the custom execution command as-is
      if (!command) throw McpErrors.configValidationFailed('No test execution command found. Set project.executionCommand or provide overrideCommand.', 'run_cucumber_test');

      // Issue #17 FIX: Parse command into executable + args, then build args array
      const parts: string[] = command.split(/\s+/).filter(p => p.length > 0);
      const exe = parts.shift(); // Get first part (e.g., 'npx')
      if (!exe) throw McpErrors.invalidExecutable(command || '<empty>', 'run_cucumber_test');

      // Additional safety: validate executable name doesn't contain path traversal
      if (exe.includes('..') || exe.includes('/') && !exe.startsWith('/')) {
        throw McpErrors.invalidExecutable(exe, 'run_cucumber_test');
      }

      const args: string[] = parts;

      let configName = 'wdio.conf.ts';
      const isWdio = command.includes('wdio');

      if (isWdio && options?.platform) {
        const specificConfig = `wdio.${options.platform}.conf.ts`;
        if (fs.existsSync(path.join(projectRoot, specificConfig))) {
          configName = specificConfig;
          // Replace generic wdio.conf.ts with specific if it exists in args
          const index = args.findIndex(p => p.includes('wdio.conf.ts'));
          if (index !== -1) args[index] = specificConfig;
        }
      }

      // Apply tag filtering via wdio cucumberOpts
      let tagExpression = options?.tags || '';

      if (isWdio) {
        // If we fall back to generic monolithic config but user wants a specific platform,
        // we still need to filter via @android or @ios tags for the generic run to work correctly.
        if (options?.platform && configName === 'wdio.conf.ts') {
          const platformTag = `@${options.platform}`;
          if (tagExpression) {
            tagExpression = `(${tagExpression}) and ${platformTag}`;
          } else {
            tagExpression = platformTag;
          }
        }

        if (tagExpression) {
          // Issue #17 FIX: Pass as separate arg (no shell quoting needed with execFile)
          args.push(`--cucumberOpts.tagExpression=${tagExpression}`);
        }

        // Additional args (already validated)
        if (options?.specificArgs) {
          // Split on spaces if multiple args were provided, filter empty strings
          const additionalArgs = options.specificArgs.split(/\s+/).filter(arg => arg.length > 0);
          args.push(...additionalArgs);
        }
      }

      // Issue #17 FIX: Use execFile with args array instead of shell string
      // Timeout FIX: Use resolved timeout
      const { stdout, stderr } = await execFileAsync(exe, args, {
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: timeout.value
      });

      // Try to parse the JSON report for structured stats
      // wdio requires @wdio/cucumberjs-json-reporter to output this file.
      // If it doesn't exist, we gracefully fail and return 0s.
      let stats;
      try {
        stats = await this.facade.reportParser.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
      } catch {
        stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }

      return {
        success: true,
        output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${stdout + stderr}`,
        reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
        stats
      };
    } catch (error: any) {
      // Cucumber exits non-zero on test failures
      let stats;
      try {
        stats = await this.facade.reportParser.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
      } catch {
        stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }

      // Auto-capture failure context from live session if available
      let failureContext: ExecutionResult['failureContext'];
      if (this.sessionManager?.hasActiveSession(projectRoot)) {
        try {
          const sessionService = await this.sessionManager.getSession(projectRoot);
          const screenshot = await sessionService.takeScreenshot();
          const storage = new ScreenshotStorage(projectRoot);
          const stored = storage.store(screenshot, 'failure');

          failureContext = {
            screenshotPath: stored.relativePath,
            screenshotSize: stored.size,
            pageSource: await sessionService.getPageSource(),
            timestamp: new Date().toISOString()
          };
        } catch {
          // Session might have died during test — ignore
        }
      }

      // Issue #3 / #12 FIX: Classify well-known wdio failure patterns so callers get
      // structured diagnostics instead of raw stderr walls of text.
      const rawOutput = (error.stdout || '') + (error.stderr || '');
      const diagnosis = this.facade.reportParser.classifyWdioError(rawOutput);

      return {
        success: false,
        // Include timeout prefix in failure output so callers can always see resolution source
        output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${error.stdout || ''}`,
        error: error.stderr || error.message,
        ...(diagnosis && { diagnosis }),
        stats,
        failureContext
      };
    }
  }

  /**
   * Non-blocking variant of runTest.
   *
   * Immediately returns a jobId. The actual test execution runs in the background.
   * Call getTestStatus(jobId) to poll for the result.
   *
   * This pattern was introduced to prevent MCP client RPC timeouts (typically 60s)
   * from killing the connection before a test suite finishes booting (Appium emulator
   * start + W3C negotiation often takes 70-120s for even a single scenario).
   */
  public runTestAsync(projectRoot: string, options?: Parameters<this['runTest']>[1]): string {
    const jobId = this.newJobId();
    const job: TestJob = {
      jobId,
      status: 'running',
      startedAt: new Date().toISOString()
    };
    this.jobs.set(jobId, job);
    this.runTest(projectRoot, options)
      .then((result) => {
        job.status = result.success ? 'completed' : 'failed';
        job.completedAt = new Date().toISOString();
        job.result = result;
        Logger.info(`[JobQueue] Job ${jobId} finished with status: ${job.status}`);
      })
      .catch((err) => {
        job.status = 'failed';
        job.completedAt = new Date().toISOString();
        job.result = {
          success: false,
          output: '',
          error: err instanceof Error ? err.message : String(err)
        };
        Logger.error(`[JobQueue] Job ${jobId} threw unexpectedly`, { error: String(err) });
      });
    return jobId;
  }

  /**
   * Builds the command that would be executed for a test run.
   * Used by preview mode to show users what will be run without executing.
   */
  public async buildCommand(projectRoot: string, tags?: string, platform?: 'android' | 'ios'): Promise<string> {
    const fs = await import('fs');
    const configService = new McpConfigService();
    let config;
    try {
      config = configService.read(projectRoot);
    } catch {
      config = null;
    }

    let command = '';
    if (config?.project?.executionCommand) {
      command = config.project.executionCommand;
    } else {
      const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
        ? 'wdio.conf.ts'
        : fs.existsSync(path.join(projectRoot, 'wdio.conf.js'))
          ? 'wdio.conf.js'
          : null;
      if (defaultConf) {
        command = `npx wdio run ${defaultConf}`;
      } else {
        throw new AppForgeError(
          "E008_PRECONDITION_FAIL",
          'No test execution command found.',
          ['Add "project": { "executionCommand": "npx wdio run wdio.conf.ts" } to mcp-config.json']
        );
      }
    }

    const isWdio = command.includes('wdio');
    let configName = 'wdio.conf.ts';
    if (isWdio && platform) {
      const specificConfig = `wdio.${platform}.conf.ts`;
      if (fs.existsSync(path.join(projectRoot, specificConfig))) {
        configName = specificConfig;
        command = command.replace(/wdio\.conf\.(ts|js)/, specificConfig);
      }
    }

    let tagExpression = tags || '';
    if (isWdio) {
      if (platform && configName === 'wdio.conf.ts') {
        const platformTag = `@${platform}`;
        if (tagExpression) {
          tagExpression = `(${tagExpression}) and ${platformTag}`;
        } else {
          tagExpression = platformTag;
        }
      }

      if (tagExpression) {
        command += ` --cucumberOpts.tags=${tagExpression}`;
      }
    }

    return command;
  }

  /** Generate a unique job ID. */
  public newJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Poll the status of a running/completed job.
   *
   * @param jobId     - ID returned by runTestAsync
   * @param waitMs    - If the job is still running, sleep this many ms before
   *                    returning. Allows the LLM to call "check in 20s" and get
   *                    a single efficient blocking check rather than a rapid poll
   *                    loop. Max 55s to stay safely within the 60s socket timeout.
   */
  public async getTestStatus(jobId: string, waitMs = 0): Promise<{ found: true; job: TestJob } | { found: false }> {
    const job = this.jobs.get(jobId);
    if (!job) return { found: false };
    if (job.status === 'running' && waitMs > 0) {
      const safeWait = Math.min(waitMs, 55_000); // never exceed 55s; keep inside 60s socket window
      await new Promise<void>((resolve) => setTimeout(resolve, safeWait));
    }

    const updatedJob = this.jobs.get(jobId)!;
    if (updatedJob.status === 'running') {
      const startTime = new Date(updatedJob.startedAt).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);

      // Estimate: typical Appium test takes 60-120s for boot + first scenario
      // Conservative estimate: 2 minutes total
      const estimatedTotal = 120;

      updatedJob.progress = {
        elapsedSeconds,
        estimatedTotal,
        lastActivity: new Date().toISOString()
      };
    }

    return { found: true, job: updatedJob };
  }
}