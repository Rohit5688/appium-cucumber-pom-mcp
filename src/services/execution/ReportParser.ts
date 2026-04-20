import { Logger } from '../../utils/Logger.js';
import { FileGuard } from '../../utils/FileGuard.js';
import { McpErrors } from '../../types/ErrorSystem.js';
import { SharedExecState } from './SharedExecState.js';



export class ReportParser {
  constructor(protected state: SharedExecState, protected facade: any) { }

  get sessionManager() { return this.state.sessionManager; }
  get jobs() { return this.state.jobs; }

  /**
   * Parses Cucumber JSON report for structured test stats.
   */
  public async parseReport(reportPath: string): Promise<{ total: number; passed: number; failed: number; skipped: number } | undefined> {
    try {
      const { readFile } = await import('fs/promises');
      const raw = await readFile(reportPath, 'utf8');
      const features: any[] = JSON.parse(raw);
      let total = 0, passed = 0, failed = 0, skipped = 0;

      for (const feature of features) {
        for (const scenario of (feature.elements ?? [])) {
          if (scenario.type !== 'scenario') continue;
          total++;
          const steps = scenario.steps ?? [];
          if (steps.some((s: any) => s.result?.status === 'failed')) {
            failed++;
          } else if (steps.some((s: any) => s.result?.status === 'skipped' || s.result?.status === 'undefined')) {
            skipped++;
          } else {
            passed++;
          }
        }
      }

      return { total, passed, failed, skipped };
    } catch {
      return undefined;
    }
  }

  /**
   * Resolves the timeout value for test execution.
   * Priority: explicit param > mcp-config > detect from project > default (30 min)
   */
  public async resolveTimeout(projectRoot: string, explicitTimeoutMs?: number, config?: any): Promise<{ value: number; source: string }> {
    if (explicitTimeoutMs !== undefined && explicitTimeoutMs !== null) {
      if (typeof explicitTimeoutMs !== 'number' || explicitTimeoutMs <= 0) {
        throw McpErrors.invalidTimeout(explicitTimeoutMs, 'run_cucumber_test');
      }
      // Cap at 4 hours for large test suites (Issue L2 fix)
      const cappedTimeout = Math.min(explicitTimeoutMs, 14400000);
      if (cappedTimeout !== explicitTimeoutMs) {
        Logger.warn(`Timeout capped at 4 hours (14400000ms). Requested: ${explicitTimeoutMs}ms`);
      }
      return { value: cappedTimeout, source: 'explicit' };
    }

    if (config?.execution?.timeoutMs) {
      const configTimeout = config.execution.timeoutMs;
      if (typeof configTimeout === 'number' && configTimeout > 0) {
        const cappedTimeout = Math.min(configTimeout, 14400000);
        return { value: cappedTimeout, source: 'mcp-config' };
      }
    }

    const detectedTimeout = await this.detectProjectTimeout(projectRoot);
    if (detectedTimeout) {
      return { value: detectedTimeout, source: 'detected(wdio.conf)' };
    }

    return { value: 7200000, source: 'default' };
  }

  /**
   * Attempts to detect timeout from wdio.conf.ts/js.
   * Looks for cucumberOpts.timeout (per-step timeout) or waitforTimeout (element wait timeout).
   * Best-effort detection using regex patterns.
   */
  public async detectProjectTimeout(projectRoot: string): Promise<number | null> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Check for wdio.conf.ts or wdio.conf.js
      const configFiles = ['wdio.conf.ts', 'wdio.conf.js'];

      for (const configFile of configFiles) {
        const configPath = path.default.join(projectRoot, configFile);
        if (!fs.default.existsSync(configPath)) continue;

        const check = FileGuard.isBinary(configPath);
        if (check.binary) {
          return null;
        }
        const content = fs.default.readFileSync(configPath, 'utf8');

        // Priority 1: cucumberOpts.timeout — per-step Cucumber timeout
        const cucumberTimeoutMatch = content.match(/cucumberOpts[\s\S]{0,200}?timeout\s*:\s*(\d+)/);
        if (cucumberTimeoutMatch) {
          const timeout = parseInt(cucumberTimeoutMatch[1], 10);
          if (timeout > 0) {
            Logger.info(`Detected cucumberOpts.timeout from ${configFile}: ${timeout}ms`);
            return timeout;
          }
        }

        // Priority 2: waitforTimeout — global element wait timeout
        const waitforTimeoutMatch = content.match(/waitforTimeout\s*:\s*(\d+)/);
        if (waitforTimeoutMatch) {
          const timeout = parseInt(waitforTimeoutMatch[1], 10);
          if (timeout > 0) {
            Logger.info(`Detected waitforTimeout from ${configFile}: ${timeout}ms`);
            return timeout;
          }
        }
      }

      return null;
    } catch (error) {
      // Fail silently and fall back to default
      return null;
    }
  }

  /**
   * Parses wdio output for well-known failure modes and returns a structured diagnosis.
   */
  public classifyWdioError(output: string): string | undefined {
    if (!output) return undefined;
    if (output.includes('Missing capabilities')) {
      return 'WDIO ERROR: Missing capabilities. Your mcp-config.json capabilities do not match what the test runner requires, or you are running an Android test with iOS capabilities.';
    }

    if (output.includes('ECONNREFUSED')) {
      return 'APPIUM ERROR: Connection refused. Appium server is not running or is not reachable at the specified port (4723). Run start_appium_session or manually start Appium.';
    }

    if (output.includes('ETIMEDOUT') || output.includes('timeout')) {
      return 'TIMEOUT ERROR: The test execution exceeded the maximum allowed time. The app might be hanging, or Appium is overloaded.';
    }

    if (output.includes('An unknown server-side error occurred')) {
      return 'APPIUM ERROR: Unknown server-side error. This usually happens when the app crashes, the UI Automator server dies, or invalid locators are used natively.';
    }

    if (output.includes('Could not find a connected Android device') || output.includes('No device connected')) {
      return 'DEVICE ERROR: No connected device or emulator found. Ensure a device is connected via USB with USB debugging enabled, or an emulator is running.';
    }

    return undefined;
  }
}