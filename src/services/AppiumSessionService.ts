import { remote, type Browser } from 'webdriverio';
import { McpConfigService, type McpConfig } from './McpConfigService.js';
import fs from 'fs';
import path from 'path';
import http from 'http';

export interface TopElement {
  label: string;
  type: string;
  selector: string;
}

export interface CompactPageSummary {
  elementCount: number;
  screenTitle: string;
  topElements: TopElement[];
}

export interface SessionInfo {
  sessionId: string;
  platformName: string;
  deviceName: string;
  appPackage?: string;
  appActivity?: string;
  bundleId?: string;
  initialPageSource: string;
  screenshot: string;
  /** Detected Appium server path: '/' for Appium 2, '/wd/hub' for Appium 1 */
  serverPath: string;
  /** Compact summary of the launch screen — top elements with real selectors */
  launchSummary: CompactPageSummary;
}

/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 *
 * Supports Appium 2 (path: '/') and Appium 1 (path: '/wd/hub') via
 * automatic server path detection.
 */
export class AppiumSessionService {
  private driver: Browser | null = null;
  private configService = new McpConfigService();

  // ─── LS-08: Workflow state ─────────────────────────────
  // Persisted for the lifetime of a session so the AI can re-orient itself
  // from perform_action responses alone, even after context-window eviction.
  private workflowSteps: string[] = [];
  private currentStepIndex: number = 0;

  // ─── P7-02: Deduplication log buffer ──────────────────
  // Prevents repeated identical error lines from flooding structured MCP output
  // during Appium failure loops (each unique message logs once per session).
  private seenLogMessages = new Set<string>();

  private deduplicatedLog(msg: string): void {
    if (!this.seenLogMessages.has(msg)) {
      this.seenLogMessages.add(msg);
      console.error(msg);
    }
  }

  // ─── Session Lifecycle ─────────────────────────────────

  /**
   * Starts a new Appium session using capabilities from mcp-config.json.
   * Auto-detects Appium server version (1 vs 2) by probing the /status endpoint.
   * All WebdriverIO verbose logs are suppressed to prevent stdout JSON corruption.
   */
  /**
   * Starts a new Appium session using capabilities from mcp-config.json.
   * Accepts an optional workflowSteps array (LS-08) so the AI's task plan is
   * persisted server-side and echoed in every perform_action response.
   */
  public async startSession(
    projectRoot: string,
    profileName?: string,
    workflowSteps?: string[]
  ): Promise<SessionInfo> {
    if (this.driver) {
      await this.endSession();
    }

    // LS-08: Persist workflow for the duration of this session
    this.workflowSteps = workflowSteps ?? [];
    this.currentStepIndex = 0;

    const config = this.configService.read(projectRoot);
    const capabilities = this.resolveCapabilities(config, profileName);
    const serverUrl = this.resolveServerUrl(config);

    const parsedUrl = new URL(serverUrl);
    const hostname = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port || '4723', 10);

    // Detect Appium 2 vs Appium 1 server path automatically
    const serverPath = await this.detectAppiumPath(hostname, port);
    this.deduplicatedLog(`[AppForge] Detected Appium server path: ${serverPath} at ${hostname}:${port}`);

    // Reset dedup buffer for new session attempt
    this.seenLogMessages.clear();

    try {
      this.driver = await remote({
        protocol: 'http',
        hostname,
        port,
        path: serverPath,
        capabilities,
        // ⚠️ CRITICAL: Suppress WebdriverIO stdout logs to prevent MCP JSON-RPC pipe corruption.
        // Log output must ONLY go to stderr (console.error), never stdout.
        logLevel: 'error',
      });

      const caps = this.driver.capabilities as any;
      const pageSource = await this.driver.getPageSource();
      const screenshot = await this.driver.takeScreenshot();

      return {
        sessionId: this.driver.sessionId,
        platformName: caps.platformName ?? 'unknown',
        deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? 'unknown',
        appPackage: caps['appium:appPackage'] ?? caps.appPackage,
        appActivity: caps['appium:appActivity'] ?? caps.appActivity,
        bundleId: caps['appium:bundleId'] ?? caps.bundleId,
        initialPageSource: pageSource,
        screenshot,
        serverPath,
        launchSummary: this.compactPageSummary(pageSource),  // LS-09
      };
    } catch (error: any) {
      this.driver = null;
      // ─── P7-09: Normalize downstream error into compact envelope ──
      // Strip raw WebdriverIO stack traces and HTTP bodies from what surfaces
      // to the MCP response. Full diagnostics still go to stderr.
      const enriched = this.enrichSessionError(error, serverUrl, serverPath, capabilities);
      this.deduplicatedLog(`[AppForge] Session startup failed: ${enriched.message}`);
      throw enriched;
    }
  }

  /**
   * Returns the current live page source (XML hierarchy) from the device.
   */
  public async getPageSource(): Promise<string> {
    this.ensureSession();
    return await this.driver!.getPageSource();
  }

  /**
   * Takes a live screenshot and returns it as Base64.
   */
  public async takeScreenshot(): Promise<string> {
    this.ensureSession();
    return await this.driver!.takeScreenshot();
  }

  /**
   * Verifies whether a selector actually exists on the current screen.
   */
  public async verifySelector(selector: string): Promise<{
    exists: boolean;
    displayed: boolean;
    enabled: boolean;
    tagName?: string;
    text?: string;
  }> {
    this.ensureSession();
    try {
      const element = await this.driver!.$(selector);
      const exists = await element.isExisting();
      if (!exists) {
        return { exists: false, displayed: false, enabled: false };
      }
      return {
        exists: true,
        displayed: await element.isDisplayed(),
        enabled: await element.isEnabled(),
        tagName: await element.getTagName(),
        text: await element.getText().catch(() => '')
      };
    } catch {
      return { exists: false, displayed: false, enabled: false };
    }
  }

  /**
   * Executes a mobile command (swipe, scroll, deeplink, etc.)
   */
  public async executeMobile(command: string, args: Record<string, any> = {}): Promise<any> {
    this.ensureSession();
    return await this.driver!.execute(`mobile: ${command}`, args);
  }

  /**
   * LS-06: Perform a device interaction on the live Appium session.
   *
   * Supported actions: tap, type, clear, swipe, back, home, screenshot
   *
   * LS-07: Returns a COMPACT summary by default (~1 KB) instead of raw XML +
   * Base64 screenshot (~500 KB). Pass verboseCapture=true to get pageSource +
   * screenshot for locator deep-dives.
   *
   * LS-08: Advances the workflow step counter and injects workflowProgress
   * into the response so the AI can re-orient itself after context eviction.
   */
  public async performAction(
    action: 'tap' | 'type' | 'clear' | 'swipe' | 'back' | 'home' | 'screenshot',
    selector?: string,
    value?: string,
    captureAfter: boolean = true,
    verboseCapture: boolean = false
  ): Promise<{
    success: boolean;
    summary?: CompactPageSummary;
    pageSource?: string;
    screenshot?: string;
    workflowProgress?: object;
    error?: string;
  }> {
    this.ensureSession();
    const d = this.driver!;

    try {
      switch (action) {
        case 'tap': {
          if (!selector) throw new Error('"tap" requires a selector argument.');
          const el = await d.$(selector);
          await el.waitForDisplayed({ timeout: 10000 });
          await el.click();
          break;
        }
        case 'type': {
          if (!selector) throw new Error('"type" requires a selector argument.');
          const el = await d.$(selector);
          await el.waitForDisplayed({ timeout: 10000 });
          await el.setValue(value ?? '');
          break;
        }
        case 'clear': {
          if (!selector) throw new Error('"clear" requires a selector argument.');
          const el = await d.$(selector);
          await el.clearValue();
          break;
        }
        case 'swipe': {
          const dir = (value ?? 'up').toLowerCase();
          const dirMap: Record<string, object> = {
            up:    { direction: 'up' },
            down:  { direction: 'down' },
            left:  { direction: 'left' },
            right: { direction: 'right' },
          };
          await d.execute('mobile: scroll', dirMap[dir] ?? dirMap['up']);
          break;
        }
        case 'back':
          await d.back();
          break;
        case 'home':
          await d.execute('mobile: pressButton', { name: 'home' });
          break;
        case 'screenshot':
          // No interaction — just capture below
          break;
        default:
          throw new Error(`Unknown action: "${action}". Valid: tap, type, clear, swipe, back, home, screenshot.`);
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }

    // LS-08: Advance workflow step
    if (this.workflowSteps.length > 0) {
      this.currentStepIndex = Math.min(this.currentStepIndex + 1, this.workflowSteps.length);
    }

    if (!captureAfter) {
      return { success: true, workflowProgress: this.buildWorkflowProgress() };
    }

    // Capture updated screen state after the action
    const rawXml = await d.getPageSource().catch(() => '');

    // LS-07: Compact summary is always built; verbose data only on request
    const summary = this.compactPageSummary(rawXml);
    const result: ReturnType<AppiumSessionService['performAction']> extends Promise<infer R> ? R : never = {
      success: true,
      summary,
      workflowProgress: this.buildWorkflowProgress(),
    };

    if (verboseCapture) {
      result.pageSource = rawXml;
      result.screenshot = await d.takeScreenshot().catch(() => '');
    }

    return result;
  }

  /**
   * Returns current session status.
   */
  public isSessionActive(): boolean {
    return this.driver !== null;
  }

  /**
   * Cleanly terminates the Appium session.
   * Returns explicit lifecycle state: 'terminated' | 'no_active_session'.
   */
  public async endSession(): Promise<'terminated' | 'no_active_session'> {
    if (!this.driver) {
      return 'no_active_session';
    }
    try {
      await this.driver.deleteSession();
    } catch {
      // Session may already be dead — still clear local state
    }
    this.driver = null;
    return 'terminated';
  }

  // ─── Private Helpers ───────────────────────────────────

  private ensureSession(): void {
    if (!this.driver) {
      throw new Error(
        'No active Appium session. Call start_appium_session first, ' +
        'or use inspect_ui_hierarchy with an XML dump.'
      );
    }
  }

  /**
   * LS-08: Builds the workflow re-orientation block injected into every
   * perform_action response. Allows the AI to recover its task plan even
   * after the original prompt turn has been evicted from the context window.
   */
  private buildWorkflowProgress(): object | undefined {
    if (this.workflowSteps.length === 0) return undefined;
    const nextStep = this.workflowSteps[this.currentStepIndex] ?? null;
    const remaining = this.workflowSteps.slice(this.currentStepIndex);
    return {
      currentStep: this.currentStepIndex,
      totalSteps: this.workflowSteps.length,
      nextStep,
      remainingSteps: remaining,
    };
  }

  /**
   * LS-07/09: Extracts the top 8 interactive elements from an Appium XML
   * page source using lightweight regex (no external XML parser needed).
   * Returns label, XCUIElement/UiAutomator type, and the best selector to use.
   *
   * Selector priority:
   *   1. accessibility-id (~label) — preferred for stability
   *   2. resource-id / name attribute
   *   3. type + index as fallback
   */
  private extractTopElements(xml: string): TopElement[] {
    const elements: TopElement[] = [];
    if (!xml) return elements;

    // Match elements that have a label/name/content-desc attribute
    // Covers both iOS XCUITest and Android UiAutomator2 XML formats
    const pattern = /<([A-Za-z]+(?:Type)?[A-Za-z0-9]*)\s+[^>]*?(?:label|name|content-desc|text)="([^"]+)"[^>]*>/g;
    const typePattern = /<([A-Za-z0-9]+)\s/;

    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((match = pattern.exec(xml)) !== null && elements.length < 8) {
      const rawType = match[1];
      const label = match[2]?.trim();
      if (!label || label.length === 0) continue;

      // Skip containers and structural elements — only interactive ones
      const skip = ['XCUIElementTypeOther', 'XCUIElementTypeWindow', 'XCUIElementTypeApplication',
                    'android.view.View', 'android.widget.FrameLayout', 'android.widget.RelativeLayout',
                    'android.widget.LinearLayout', 'android.widget.ScrollView'];
      if (skip.some(s => rawType.includes(s))) continue;

      const dedupeKey = `${rawType}::${label}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Best selector: accessibility-id is most stable
      const selector = `~${label}`;

      elements.push({ label, type: rawType, selector });
    }

    return elements;
  }

  /**
   * LS-09: Wraps extractTopElements into a CompactPageSummary.
   * Used in start_appium_session (launch screen) and perform_action (post-action screen).
   */
  private compactPageSummary(xml: string): CompactPageSummary {
    const topElements = this.extractTopElements(xml);

    // Extract screen title: first static text / text view element value
    const titleMatch = xml.match(/(?:XCUIElementTypeStaticText|android\.widget\.TextView)[^>]*?(?:label|text)="([^"]+)"/);
    const screenTitle = titleMatch?.[1]?.trim() ?? '';

    // Element count: rough count of XML start-tags (proxy for element count)
    const elementCount = (xml.match(/<[A-Z][A-Za-z0-9]*/g) ?? []).length;

    return { elementCount, screenTitle, topElements };
  }


  /**
   * Auto-detects Appium server version path.
   * - Appium 2: base path is '/' — /status returns JSON with Appium version info
   * - Appium 1: base path is '/wd/hub' — /wd/hub/status returns JSON
   *
   * Strategy: Try Appium 2 root first (GET /status), then fall back to Appium 1.
   */
  private async detectAppiumPath(hostname: string, port: number): Promise<string> {
    // Try Appium 2 root path first
    const appium2Works = await this.probeStatusEndpoint(hostname, port, '/status');
    if (appium2Works) {
      return '/';
    }

    // Fall back to Appium 1 /wd/hub path
    const appium1Works = await this.probeStatusEndpoint(hostname, port, '/wd/hub/status');
    if (appium1Works) {
      return '/wd/hub/';
    }

    // Default to Appium 2 root with a clear warning logged to stderr
    console.error(
      `[AppForge] ⚠️ Could not probe Appium status at ${hostname}:${port}. ` +
      `Defaulting to Appium 2 path '/'. If session fails, ensure Appium is running: npx appium`
    );
    return '/';
  }

  /**
   * Probes a given status endpoint. Returns true if it responds with HTTP 200.
   */
  private probeStatusEndpoint(hostname: string, port: number, statusPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const options = {
        hostname,
        port,
        path: statusPath,
        method: 'GET',
        timeout: 3000,
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
        res.resume(); // consume response to free socket
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /**
   * Enriches Appium errors with actionable user guidance.
   */
  private enrichSessionError(error: any, serverUrl: string, serverPath: string, capabilities: any): Error {
    const msg = error?.message || String(error);

    if (msg.includes('ECONNREFUSED')) {
      return new Error(
        `[AppForge] Cannot connect to Appium at ${serverUrl} (path: ${serverPath}).\n` +
        `Make sure Appium is running:\n  npx appium\n` +
        `Or start with a specific port:\n  npx appium --port 4723`
      );
    }

    if (msg.includes('resource could not be found') || msg.includes('HTTP method that is not supported')) {
      return new Error(
        `[AppForge] Appium endpoint mismatch. The server responded but rejected the session creation request.\n` +
        `Detected path: "${serverPath}" — this was chosen by auto-detection.\n\n` +
        `Possible causes:\n` +
        `  1. If using Appium 2, ensure it is started without --allow-insecure=web_app flag.\n` +
        `  2. Check that the active driver plugin is installed: npx appium driver list\n` +
        `  3. Override the server path via mcp-config.json → mobile.serverPath\n\n` +
        `Raw error: ${msg}`
      );
    }

    if (msg.includes('session not created') || msg.includes('Could not start')) {
      return new Error(
        `[AppForge] Appium session creation failed. Check:\n` +
        `1. Is an emulator/simulator running? (adb devices / xcrun simctl list)\n` +
        `2. Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})\n` +
        `3. Are the capabilities correct?\n` +
        `Raw error: ${msg}`
      );
    }

    if (msg.includes('xcrun') || msg.includes('iOS SDK')) {
      return new Error(
        `[AppForge] iOS SDK command timed out. Possible causes:\n` +
        `1. Xcode Command Line Tools not installed: xcode-select --install\n` +
        `2. Simulator is unresponsive — try: xcrun simctl shutdown all && open -a Simulator\n` +
        `3. Ensure the correct iOS SDK is available: xcrun --sdk iphonesimulator --show-sdk-version\n` +
        `Raw error: ${msg}`
      );
    }

    return error;
  }

  /**
   * Resolves capabilities from existing WDIO configs OR mcp-config.json.
   * Priority: 1. Existing wdio.conf.ts/js, 2. mcp-config.json profiles.
   */
  private resolveCapabilities(config: McpConfig, profileName?: string): Record<string, any> {
    const projectRoot = path.dirname(this.configService.getPaths(config).pagesRoot);

    const wdioPaths = [
      path.join(projectRoot, `wdio.${profileName || 'android'}.conf.ts`),
      path.join(projectRoot, `wdio.${profileName || 'ios'}.conf.ts`),
      path.join(projectRoot, 'config', `wdio.${profileName || 'android'}.conf.ts`),
      path.join(projectRoot, 'config', `wdio.${profileName || 'ios'}.conf.ts`),
      path.join(projectRoot, 'wdio.shared.conf.ts'),
      path.join(projectRoot, 'wdio.conf.ts'),
      path.join(projectRoot, 'wdio.conf.js')
    ];

    let foundCapabilities: any = null;

    for (const p of wdioPaths) {
      if (fs.existsSync(p)) {
        console.error(`[AppForge] Found WDIO config candidate at ${p}. Extracting capabilities...`);
        try {
          const content = fs.readFileSync(p, 'utf8');
          const capMatch = content.match(/capabilities:\s*\[\s*(\{[\s\S]*?\})\s*\]/);
          if (capMatch && capMatch[1]) {
            try {
              const jsonLike = capMatch[1].replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"');
              foundCapabilities = JSON.parse(jsonLike);
              break;
            } catch {
              console.error(`[AppForge] Found capabilities in ${path.basename(p)} but couldn't parse statically. Falling back to mcp-config profiles.`);
            }
          }
        } catch (e) {
          console.error(`[AppForge] Error reading ${p}: ${e}`);
        }
      }
    }

    const profiles = config.mobile.capabilitiesProfiles || {};
    const names = Object.keys(profiles);

    let caps: Record<string, any>;
    if (foundCapabilities) {
      caps = foundCapabilities;
    } else {
      if (names.length === 0) {
        throw new Error('No capability profiles found in wdio.conf or mcp-config.json. Run setup_project first.');
      }
      const name = profileName ?? names[0];
      caps = profiles[name];
      if (!caps) {
        throw new Error(`Capability profile "${name}" not found. Available: ${names.join(', ')}`);
      }
    }

    const activeBuild = this.configService.getActiveBuild(config);
    if (activeBuild?.appPath) {
      caps['appium:app'] = activeBuild.appPath;
    }

    return caps;
  }

  /**
   * Resolves Appium server URL from config or active build profile.
   */
  private resolveServerUrl(config: McpConfig): string {
    const activeBuild = this.configService.getActiveBuild(config);
    if (activeBuild?.serverUrl) {
      return activeBuild.serverUrl;
    }

    if (config.mobile.cloud?.provider === 'browserstack') {
      return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@hub-cloud.browserstack.com/wd/hub/`;
    }
    if (config.mobile.cloud?.provider === 'saucelabs') {
      return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@ondemand.us-west-1.saucelabs.com/wd/hub/`;
    }

    return 'http://localhost:4723';
  }
}
