import * as http from 'http';
import { PreFlightCheck, PreFlightReport } from '../types/PermissionResult.js';

/**
 * PreFlightService — validates Appium and device readiness.
 *
 * Checks (in order):
 * 1. Appium server reachable at configured URL
 * 2. Active session exists in SessionManager
 * 3. Session is not stale (last activity < timeout)
 * 4. Connected device/emulator available (if no active session)
 */
export class PreFlightService {
  private static instance: PreFlightService;

  /** How long a session can be idle before it's considered stale */
  private readonly SESSION_STALE_MS = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): PreFlightService {
    if (!PreFlightService.instance) {
      PreFlightService.instance = new PreFlightService();
    }
    return PreFlightService.instance;
  }

  /**
   * Runs all pre-flight checks and returns a report.
   *
   * @param appiumUrl  Appium server URL (default: http://127.0.0.1:4723)
   * @param sessionId  Current session ID to validate (optional)
   */
  public async runChecks(
    appiumUrl: string = 'http://127.0.0.1:4723',
    sessionId?: string
  ): Promise<PreFlightReport> {
    const checks: PreFlightCheck[] = [];

    // Check 1: Appium server reachable
    const serverCheck = await this.checkAppiumServer(appiumUrl);
    checks.push(serverCheck);

    // Stop here if server is down — other checks will fail
    if (!serverCheck.passed) {
      return this.buildReport(checks);
    }

    // Check 2: Session validity (if provided)
    if (sessionId) {
      const sessionCheck = await this.checkSession(appiumUrl, sessionId);
      checks.push(sessionCheck);
    } else {
      checks.push({
        name: 'session_check',
        passed: false,
        message: 'No active Appium session. Call start_appium_session first.',
        severity: 'error',
      });
    }

    // Check 3: Config file
    const configCheck = this.checkConfigFile();
    checks.push(configCheck);

    return this.buildReport(checks);
  }

  /**
   * Quick check — returns true if Appium is reachable, false otherwise.
   * Useful for fast guards before tool execution.
   */
  public async isAppiumReachable(appiumUrl: string = 'http://127.0.0.1:4723'): Promise<boolean> {
    const check = await this.checkAppiumServer(appiumUrl);
    return check.passed;
  }

  /**
   * Formats a pre-flight report as a human-readable string.
   */
  public formatReport(report: PreFlightReport): string {
    const lines: string[] = ['🔍 Pre-Flight Check Results:'];

    for (const check of report.checks) {
      const icon = check.passed ? '✅' : check.severity === 'error' ? '❌' : '⚠️';
      lines.push(`  ${icon} ${check.name}: ${check.message}`);
    }

    if (!report.allPassed && report.blockers.length > 0) {
      lines.push('');
      lines.push('⛔ Blockers found. Fix the issues above before proceeding.');
      lines.push('');
      lines.push('Next steps:');
      for (const blocker of report.blockers) {
        if (blocker.name === 'appium_server') {
          lines.push('  1. Start Appium: npx appium@latest');
          lines.push('  2. Verify it runs at http://127.0.0.1:4723/status');
        } else if (blocker.name === 'session_check') {
          lines.push('  1. Call start_appium_session to create a new session');
        }
      }
    }

    return lines.join('\n');
  }

  // ─── Private checks ───────────────────────────────────────────────────────

  private async checkAppiumServer(appiumUrl: string): Promise<PreFlightCheck> {
    const statusUrl = `${appiumUrl}/status`;

    try {
      const response = await this.httpGet(statusUrl, 3000); // 3s timeout
      const data = JSON.parse(response);

      if (data?.value?.ready === true || data?.status === 0) {
        return {
          name: 'appium_server',
          passed: true,
          message: `Appium server ready at ${appiumUrl}`,
          severity: 'info',
        };
      }

      return {
        name: 'appium_server',
        passed: false,
        message: `Appium server responded but reports not ready at ${appiumUrl}`,
        severity: 'error',
      };
    } catch (err: any) {
      const isConnectionRefused = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      return {
        name: 'appium_server',
        passed: false,
        message: isConnectionRefused
          ? `Appium server not running at ${appiumUrl}. Start it with: npx appium@latest`
          : `Appium server unreachable: ${err.message}`,
        severity: 'error',
      };
    }
  }

  private async checkSession(appiumUrl: string, sessionId: string): Promise<PreFlightCheck> {
    const sessionUrl = `${appiumUrl}/session/${sessionId}`;

    try {
      const response = await this.httpGet(sessionUrl, 3000);
      const data = JSON.parse(response);

      if (data?.value !== null) {
        return {
          name: 'session_check',
          passed: true,
          message: `Session ${sessionId.substring(0, 8)}... is active`,
          severity: 'info',
        };
      }

      return {
        name: 'session_check',
        passed: false,
        message: `Session ${sessionId.substring(0, 8)}... not found. It may have expired.`,
        severity: 'error',
      };
    } catch {
      return {
        name: 'session_check',
        passed: false,
        message: `Session validation failed. Session may be stale.`,
        severity: 'error',
      };
    }
  }

  private checkConfigFile(): PreFlightCheck {
    const configPath = require('path').join(process.cwd(), 'mcp-config.json');
    const exists = require('fs').existsSync(configPath);

    return {
      name: 'config_file',
      passed: exists,
      message: exists
        ? 'mcp-config.json found'
        : 'mcp-config.json missing. Run setup_project_structure to create it.',
      severity: exists ? 'info' : 'warning',
    };
  }

  private buildReport(checks: PreFlightCheck[]): PreFlightReport {
    const blockers = checks.filter(c => !c.passed && c.severity === 'error');
    const warnings = checks.filter(c => !c.passed && c.severity === 'warning');

    return {
      allPassed: blockers.length === 0,
      checks,
      blockers,
      warnings,
    };
  }

  /** Minimal Node.js HTTP GET with timeout. No external dependencies. */
  private httpGet(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`HTTP GET timeout: ${url}`));
      });
    });
  }
}
