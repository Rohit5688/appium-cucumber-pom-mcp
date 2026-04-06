import { remote, type Browser } from 'webdriverio';
import { McpConfigService, type McpConfig } from './McpConfigService.js';
import http from 'http';
import { Questioner } from '../utils/Questioner.js';
import { AppForgeError } from '../utils/ErrorFactory.js';
import { Logger } from '../utils/Logger.js';
export interface SessionInfo {
  sessionId: string;
  platformName: string;
  deviceName: string;
  appPackage?: string;
  appActivity?: string;
  bundleId?: string;
  navigationHints: {
    deepLinkAvailable: boolean;
    androidPackage: string | null;
    androidDefaultActivity: string | null;
    iosBundle: string | null;
    shortcutNote: string;
  };
}

/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 */
export class AppiumSessionService {
  private driver: Browser | null = null;
  private configService = new McpConfigService();
  private projectRoot: string = '';

  private _lastXmlCache: string | null = null;
  private _lastXmlCacheTimestamp: number = 0;
  private readonly XML_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  public getDriver(): Browser | null {
    return this.driver;
  }

  public getPlatform(): string {
    return ((this.driver?.capabilities as any)?.platformName || 'android').toLowerCase();
  }

  /**
   * Starts a new Appium session using capabilities from mcp-config.json.
   * Now uses SessionManager for proper lifecycle management and crash prevention.
   * Returns session info including initial page source and screenshot.
   */
  public async startSession(projectRoot: string, profileName?: string): Promise<SessionInfo> {
    // Clean up any existing driver before starting new session
    if (this.driver) {
      await this.endSession();
    }

    // Store projectRoot for later retrieval
    this.projectRoot = projectRoot;

    const config = this.configService.read(projectRoot);
    // LIVE-SESSION FIX: Force noReset:true for live inspection sessions.
    // When noReset is false, Appium reinstalls the app from scratch before creating the session.
    // On iOS/XCUITest this blocks for 30-55 seconds, exceeding the MCP client's response timeout
    // and causing a 'Connection closed' error. start_appium_session is an inspection tool —
    // the app must already be installed and in the desired state before calling it.
    const profileName_ = profileName ?? Object.keys(config.mobile.capabilitiesProfiles)[0];
    if (config.mobile.capabilitiesProfiles[profileName_]) {
      config.mobile.capabilitiesProfiles[profileName_]['appium:noReset'] = true;
    }

    const capabilities = this.resolveCapabilities(config, profileName);
    const serverUrl = this.resolveServerUrl(config);

    const parsedUrl = new URL(serverUrl);
    const hostname = parsedUrl.hostname;
    const port = parseInt(parsedUrl.port || '4723', 10);

    // Auto-detect Appium version: probe /status (Appium 2/3 → path '/') then /wd/hub/status (Appium 1 → path '/wd/hub/')
    const serverPath = await this.detectAppiumPath(hostname, port);
    Logger.info(`Detected Appium server path: ${serverPath} at ${hostname}:${port}`);

    // Enhanced error handling with proper cleanup
    let driver: Browser | null = null;
    try {
      driver = await remote({
        protocol: 'http',
        hostname,
        port,
        path: serverPath,
        capabilities,
        // CRITICAL: Suppress WebdriverIO stdout logs to prevent MCP JSON-RPC pipe corruption.
        // Log output must ONLY go to stderr (console.error), never stdout.
        logLevel: 'error',
        // Add connection timeout to prevent hanging
        connectionRetryTimeout: 30000, // 30 seconds max
        connectionRetryCount: 3,       // Max 3 retries
      });

      // Validate session was created successfully
      if (!driver || !driver.sessionId) {
        throw new Error('Session created but missing sessionId');
      }

      // Store the driver reference immediately - session is valid even if initial fetch is slow
      this.driver = driver;

      // Get session info
      const caps = driver.capabilities as any;

      return {
        sessionId: driver.sessionId,
        platformName: caps.platformName ?? 'unknown',
        deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? 'unknown',
        appPackage: caps['appium:appPackage'] ?? caps.appPackage,
        appActivity: caps['appium:appActivity'] ?? caps.appActivity,
        bundleId: caps['appium:bundleId'] ?? caps.bundleId,
        navigationHints: {
          deepLinkAvailable: !!(caps['appium:appPackage'] || caps.appPackage || caps['appium:bundleId'] || caps.bundleId),
          androidPackage: caps['appium:appPackage'] ?? caps.appPackage ?? null,
          androidDefaultActivity: caps['appium:appActivity'] ?? caps.appActivity ?? null,
          iosBundle: caps['appium:bundleId'] ?? caps.bundleId ?? null,
          shortcutNote: 'Use openDeepLink(url) from BasePage to jump directly to any deep-linked screen. For Android, use startActivity(package, activity) to open any Activity directly without UI navigation.'
        }
      };
    } catch (error: any) {
      // Critical: Clean up driver on ANY error to prevent resource leaks
      if (driver) {
        try {
          await driver.deleteSession();
        } catch (cleanupError) {
          Logger.warn("Error cleaning up failed session", { error: String(cleanupError) });
        }
      }

      const msg = error.message || String(error);

      if (msg.includes('ECONNREFUSED')) {
        throw new AppForgeError("E002_DEVICE_OFFLINE",
          `Cannot connect to Appium at ${serverUrl}. ` +
          `Make sure Appium is running:\n  npx appium\n` +
          `Or start it with a specific port:\n  npx appium --port 4723`,
          ["Start Appium on localhost:4723"]
        );
      }

      if (msg.includes('session not created') || msg.includes('Could not start')) {
        throw new AppForgeError("E001_NO_SESSION",
          `Appium session creation failed.\n` +
          `Raw error: ${msg}`,
          [
            "Is an emulator/simulator running? (adb devices / xcrun simctl list)",
            `Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})`,
            "Are the capabilities correct?"
          ]
        );
      }

      if (msg.includes('timeout')) {
        throw new AppForgeError("E002_DEVICE_OFFLINE",
          `Session creation timed out. Device or app may be unresponsive.\n` +
          `Raw error: ${msg}`,
          [
            "Restart the device/emulator",
            "Force-stop and restart the app",
            "Check device performance (low memory, CPU usage)"
          ]
        );
      }

      // Re-throw with enhanced context
      throw new AppForgeError("E001_NO_SESSION",
        `Unexpected session creation error: ${msg}`,
        [
          "Check Appium server logs for details",
          "Verify device capabilities are correct",
          "Try restarting Appium server"
        ]
      );
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
   * Used by self-healing to validate a healed selector before returning it.
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
   * BUG-06 FIX: Returns true only if driver reference exists AND the session is
   * still alive on the Appium server. Previously returned this.driver !== null,
   * which lies when the device disconnects or the Appium server crashes.
   *
   * Sync fast-path: returns false immediately if driver is null.
   * For a definitive live check, use isSessionAlive() (async).
   */
  public isSessionActive(): boolean {
    return this.driver !== null;
  }

  /**
   * Async liveness ping — confirms the session is genuinely alive on the server.
   * Use this before any critical operation to avoid misleading session-not-found errors.
   */
  public async isSessionAlive(): Promise<boolean> {
    if (!this.driver) return false;
    try {
      // getStatus() calls the Appium /status endpoint — fast, no side effects.
      // If the server or device is gone, this throws immediately.
      await (this.driver as any).getStatus();
      return true;
    } catch {
      // Session is dead — clean up the stale reference so future callers get false
      this.driver = null;
      return false;
    }
  }

  /**
   * Returns the project root path from the active session.
   */
  public getProjectRoot(): string {
    return this.projectRoot;
  }

  /**
   * Cleanly terminates the Appium session.
   */
  public async endSession(): Promise<void> {
    this.clearXmlCache();
    if (this.driver) {
      try {
        await this.driver.deleteSession();
      } catch {
        // Session may already be dead
      }
      this.driver = null;
    }
    this.projectRoot = '';
  }

  /**
   * Stores the most recently fetched XML page source.
   * Called by ExecutionService after every successful getPageSource() call.
   */
  public cacheXml(xml: string): void {
    this._lastXmlCache = xml;
    this._lastXmlCacheTimestamp = Date.now();
  }

  /**
   * Returns the cached XML if available and not expired.
   * Returns null if cache is empty or older than 5 minutes.
   */
  public getCachedXml(): { xml: string; ageSeconds: number } | null {
    if (!this._lastXmlCache) return null;
    const ageMs = Date.now() - this._lastXmlCacheTimestamp;
    if (ageMs > this.XML_CACHE_TTL_MS) return null;
    return { xml: this._lastXmlCache, ageSeconds: Math.round(ageMs / 1000) };
  }

  /**
   * Clears the XML cache. Call when session ends or app navigates to a new screen.
   */
  public clearXmlCache(): void {
    this._lastXmlCache = null;
    this._lastXmlCacheTimestamp = 0;
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
   * Auto-detects Appium server version path.
   * - Appium 2: base path is '/' — /status returns JSON with Appium version info
   * - Appium 1: base path is '/wd/hub' — /wd/hub/status returns JSON
   *
   * Strategy: Try Appium 2 root first (GET /status), then fall back to Appium 1.
   */
  private async detectAppiumPath(hostname: string, port: number): Promise<string> {
    const appium2Works = await this.probeStatusEndpoint(hostname, port, '/status');
    if (appium2Works) return '/';

    const appium1Works = await this.probeStatusEndpoint(hostname, port, '/wd/hub/status');
    if (appium1Works) return '/wd/hub/';

    // Default to Appium 2 root with a warning — startSession error handling will give actionable guidance
    Logger.warn(
      `Could not probe Appium at ${hostname}:${port}. ` +
      `Defaulting to Appium 2 path '/'. Ensure Appium is running: npx appium`
    );
    return '/';
  }

  /**
   * Probes a status endpoint. Returns true if it responds with HTTP 200.
   */
  private probeStatusEndpoint(hostname: string, port: number, statusPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        { hostname, port, path: statusPath, method: 'GET', timeout: 3000 },
        (res) => { resolve(res.statusCode === 200); res.resume(); }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.end();
    });
  }

  /**
   * Resolves capabilities from mcp-config.json.
   * Picks a named profile or the first one available.
   */
  private resolveCapabilities(config: McpConfig, profileName?: string): Record<string, any> {
    const profiles = config.mobile.capabilitiesProfiles;
    const names = Object.keys(profiles);

    if (names.length === 0) {
      throw new Error('No capability profiles defined in mcp-config.json. Run setup_project first.');
    }

    const name = profileName ?? names[0];
    const caps = profiles[name];
    if (!caps) {
      throw new Error(`Capability profile "${name}" not found. Available: ${names.join(', ')}`);
    }

    // If a build profile is active, inject its app path
    const activeBuild = this.configService.getActiveBuild(config);
    if (activeBuild?.appPath) {
      caps['appium:app'] = activeBuild.appPath;
    }

    if (!caps['appium:app'] && !caps['appium:noReset'] && caps.browserName !== 'Chrome' && caps.browserName !== 'Safari') {
      Questioner.clarify(
        "No app or browser specified in capabilities. Provide path to .apk/.ipa, or choose 'noReset: true' for already-installed app?",
        "Appium requires an 'appium:app' path, a 'browserName', or 'appium:noReset' to start a session.",
        ["Provide path to app", "Use noReset (app already installed)", "Set browserName (e.g. Chrome, Safari)"]
      );
    }

    // REMOVED: Questioner.clarify for missing iOS bundleId.
    // noReset:true is forced at session start, so Appium will attach to the running app
    // without needing bundleId. If the session fails, Appium will produce a native error
    // with a clear message — no need to halt with CLARIFICATION_REQUIRED.
    if (caps.platformName?.toLowerCase() === 'ios' && caps['appium:noReset'] && !caps['appium:bundleId'] && !caps['appium:app']) {
      Logger.warn('iOS bundleId not set — relying on Appium noReset:true to attach to running app.');
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

    // Check cloud provider
    if (config.mobile.cloud?.provider === 'browserstack') {
      return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@hub-cloud.browserstack.com/wd/hub`;
    }
    if (config.mobile.cloud?.provider === 'saucelabs') {
      return `https://${config.mobile.cloud.username}:${config.mobile.cloud.accessKey}@ondemand.us-west-1.saucelabs.com/wd/hub`;
    }

    const timeouts = this.configService.getTimeouts(config);
    const port = timeouts.appiumPort ?? 4723;
    return `http://localhost:${port}`;
  }
}
