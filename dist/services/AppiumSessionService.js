import { remote } from 'webdriverio';
import { McpConfigService } from './McpConfigService.js';
import http from 'http';
import { Questioner } from '../utils/Questioner.js';
import { McpErrors } from '../types/ErrorSystem.js';
import { Logger } from '../utils/Logger.js';
import { withRetry, RetryPolicies } from '../utils/RetryEngine.js';
/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 */
export class AppiumSessionService {
    driver = null;
    configService = new McpConfigService();
    projectRoot = '';
    _lastXmlCache = null;
    _lastXmlCacheTimestamp = 0;
    XML_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    getDriver() {
        return this.driver;
    }
    getPlatform() {
        return (this.driver?.capabilities?.platformName || 'android').toLowerCase();
    }
    /**
     * Starts a new Appium session using capabilities from mcp-config.json.
     * Now uses SessionManager for proper lifecycle management and crash prevention.
     * Returns session info including initial page source and screenshot.
     */
    async startSession(projectRoot, profileName) {
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
        let driver = null;
        try {
            // Wrap session creation with exponential backoff retry for transient Appium failures
            // (e.g. device USB reconnect, server warm-up delays, CI race conditions).
            const retryResult = await withRetry(async () => {
                const d = await remote({
                    protocol: 'http',
                    hostname,
                    port,
                    path: serverPath,
                    capabilities,
                    // CRITICAL: Suppress WebdriverIO stdout logs to prevent MCP JSON-RPC pipe corruption.
                    // Log output must ONLY go to stderr (console.error), never stdout.
                    logLevel: 'error',
                    // Disable wdio's own retries — our RetryEngine manages the outer loop.
                    connectionRetryTimeout: 30000, // 30 seconds max
                    connectionRetryCount: 1, // Single attempt per withRetry iteration
                });
                if (!d || !d.sessionId) {
                    throw new Error('Session created but missing sessionId');
                }
                return d;
            }, {
                ...RetryPolicies.appiumSession,
                onRetry: (err, attempt, delayMs) => {
                    Logger.warn(`[AppForge] Appium session start failed (attempt ${attempt}): ${err.message}. Retrying in ${delayMs}ms...`);
                },
            });
            driver = retryResult.value;
            // Store the driver reference immediately - session is valid even if initial fetch is slow
            this.driver = driver;
            // Get session info
            const caps = driver.capabilities;
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
        }
        catch (error) {
            // Critical: Clean up driver on ANY error to prevent resource leaks
            if (driver) {
                try {
                    await driver.deleteSession();
                }
                catch (cleanupError) {
                    Logger.warn("Error cleaning up failed session", { error: String(cleanupError) });
                }
            }
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('ECONNREFUSED')) {
                throw McpErrors.appiumNotReachable(serverUrl, 'start_appium_session');
            }
            if (msg.includes('session not created') || msg.includes('Could not start')) {
                throw McpErrors.appiumCommandFailed(`Session creation failed. ${msg}`, error instanceof Error ? error : undefined, 'start_appium_session');
            }
            if (msg.includes('timeout')) {
                throw McpErrors.sessionTimeout('start_appium_session');
            }
            // Re-throw with enhanced context
            throw McpErrors.appiumCommandFailed(`Unexpected session creation error: ${msg}`, error instanceof Error ? error : undefined, 'start_appium_session');
        }
    }
    /**
     * Returns the current live page source (XML hierarchy) from the device.
     */
    async getPageSource() {
        this.ensureSession();
        return await this.driver.getPageSource();
    }
    /**
     * Takes a live screenshot and returns it as Base64.
     */
    async takeScreenshot() {
        this.ensureSession();
        return await this.driver.takeScreenshot();
    }
    /**
     * Verifies whether a selector actually exists on the current screen.
     * Used by self-healing to validate a healed selector before returning it.
     */
    async verifySelector(selector) {
        this.ensureSession();
        try {
            const element = await this.driver.$(selector);
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
        }
        catch {
            return { exists: false, displayed: false, enabled: false };
        }
    }
    /**
     * Executes a mobile command (swipe, scroll, deeplink, etc.)
     */
    async executeMobile(command, args = {}) {
        this.ensureSession();
        return await this.driver.execute(`mobile: ${command}`, args);
    }
    /**
     * BUG-06 FIX: Returns true only if driver reference exists AND the session is
     * still alive on the Appium server. Previously returned this.driver !== null,
     * which lies when the device disconnects or the Appium server crashes.
     *
     * Sync fast-path: returns false immediately if driver is null.
     * For a definitive live check, use isSessionAlive() (async).
     */
    isSessionActive() {
        return this.driver !== null;
    }
    /**
     * Async liveness ping — confirms the session is genuinely alive on the server.
     * Use this before any critical operation to avoid misleading session-not-found errors.
     */
    async isSessionAlive() {
        if (!this.driver)
            return false;
        try {
            // getStatus() calls the Appium /status endpoint — fast, no side effects.
            // If the server or device is gone, this throws immediately.
            await this.driver.getStatus();
            return true;
        }
        catch {
            // Session is dead — clean up the stale reference so future callers get false
            this.driver = null;
            return false;
        }
    }
    /**
     * Returns the project root path from the active session.
     */
    getProjectRoot() {
        return this.projectRoot;
    }
    /**
     * Cleanly terminates the Appium session.
     */
    async endSession() {
        this.clearXmlCache();
        if (this.driver) {
            try {
                await this.driver.deleteSession();
            }
            catch {
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
    cacheXml(xml) {
        this._lastXmlCache = xml;
        this._lastXmlCacheTimestamp = Date.now();
    }
    /**
     * Returns the cached XML if available and not expired.
     * Returns null if cache is empty or older than 5 minutes.
     */
    getCachedXml() {
        if (!this._lastXmlCache)
            return null;
        const ageMs = Date.now() - this._lastXmlCacheTimestamp;
        if (ageMs > this.XML_CACHE_TTL_MS)
            return null;
        return { xml: this._lastXmlCache, ageSeconds: Math.round(ageMs / 1000) };
    }
    /**
     * Clears the XML cache. Call when session ends or app navigates to a new screen.
     */
    clearXmlCache() {
        this._lastXmlCache = null;
        this._lastXmlCacheTimestamp = 0;
    }
    // ─── Private Helpers ───────────────────────────────────
    ensureSession() {
        if (!this.driver) {
            throw McpErrors.sessionNotFound('none', 'AppiumSessionService');
        }
    }
    /**
     * Auto-detects Appium server version path.
     * - Appium 2: base path is '/' — /status returns JSON with Appium version info
     * - Appium 1: base path is '/wd/hub' — /wd/hub/status returns JSON
     *
     * Strategy: Try Appium 2 root first (GET /status), then fall back to Appium 1.
     */
    async detectAppiumPath(hostname, port) {
        const appium2Works = await this.probeStatusEndpoint(hostname, port, '/status');
        if (appium2Works)
            return '/';
        const appium1Works = await this.probeStatusEndpoint(hostname, port, '/wd/hub/status');
        if (appium1Works)
            return '/wd/hub/';
        // Default to Appium 2 root with a warning — startSession error handling will give actionable guidance
        Logger.warn(`Could not probe Appium at ${hostname}:${port}. ` +
            `Defaulting to Appium 2 path '/'. Ensure Appium is running: npx appium`);
        return '/';
    }
    /**
     * Probes a status endpoint. Returns true if it responds with HTTP 200.
     */
    probeStatusEndpoint(hostname, port, statusPath) {
        return new Promise((resolve) => {
            const req = http.request({ hostname, port, path: statusPath, method: 'GET', timeout: 3000 }, (res) => { resolve(res.statusCode === 200); res.resume(); });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }
    /**
     * Resolves capabilities from mcp-config.json.
     * Picks a named profile or the first one available.
     */
    resolveCapabilities(config, profileName) {
        const profiles = config.mobile.capabilitiesProfiles;
        const names = Object.keys(profiles);
        if (names.length === 0) {
            throw McpErrors.missingConfig('capabilitiesProfiles', 'start_appium_session');
        }
        const name = profileName ?? names[0];
        const caps = profiles[name];
        if (!caps) {
            throw McpErrors.invalidParameter('profileName', `Profile "${name}" not found. Available: ${names.join(', ')}`, 'start_appium_session');
        }
        // If a build profile is active, inject its app path
        const activeBuild = this.configService.getActiveBuild(config);
        if (activeBuild?.appPath) {
            caps['appium:app'] = activeBuild.appPath;
        }
        if (!caps['appium:app'] && !caps['appium:noReset'] && caps.browserName !== 'Chrome' && caps.browserName !== 'Safari') {
            Questioner.clarify("No app or browser specified in capabilities. Provide path to .apk/.ipa, or choose 'noReset: true' for already-installed app?", "Appium requires an 'appium:app' path, a 'browserName', or 'appium:noReset' to start a session.", ["Provide path to app", "Use noReset (app already installed)", "Set browserName (e.g. Chrome, Safari)"]);
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
    resolveServerUrl(config) {
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
