import { remote } from 'webdriverio';
import { McpConfigService } from './McpConfigService.js';
import fs from 'fs';
import path from 'path';
import http from 'http';
/**
 * AppiumSessionService — Manages a live WebdriverIO + Appium session.
 * Enables the MCP server to connect to a real device/emulator, fetch live
 * XML page source, take screenshots, and verify selectors.
 *
 * Supports Appium 2 (path: '/') and Appium 1 (path: '/wd/hub') via
 * automatic server path detection.
 */
export class AppiumSessionService {
    driver = null;
    configService = new McpConfigService();
    // ─── Session Lifecycle ─────────────────────────────────
    /**
     * Starts a new Appium session using capabilities from mcp-config.json.
     * Auto-detects Appium server version (1 vs 2) by probing the /status endpoint.
     * All WebdriverIO verbose logs are suppressed to prevent stdout JSON corruption.
     */
    async startSession(projectRoot, profileName) {
        if (this.driver) {
            await this.endSession();
        }
        const config = this.configService.read(projectRoot);
        const capabilities = this.resolveCapabilities(config, profileName);
        const serverUrl = this.resolveServerUrl(config);
        const parsedUrl = new URL(serverUrl);
        const hostname = parsedUrl.hostname;
        const port = parseInt(parsedUrl.port || '4723', 10);
        // Detect Appium 2 vs Appium 1 server path automatically
        const serverPath = await this.detectAppiumPath(hostname, port);
        console.error(`[AppForge] Detected Appium server path: ${serverPath} at ${hostname}:${port}`);
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
            const caps = this.driver.capabilities;
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
            };
        }
        catch (error) {
            this.driver = null;
            throw this.enrichSessionError(error, serverUrl, serverPath, capabilities);
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
     * Returns current session status.
     */
    isSessionActive() {
        return this.driver !== null;
    }
    /**
     * Cleanly terminates the Appium session.
     * Returns explicit lifecycle state: 'terminated' | 'no_active_session'.
     */
    async endSession() {
        if (!this.driver) {
            return 'no_active_session';
        }
        try {
            await this.driver.deleteSession();
        }
        catch {
            // Session may already be dead — still clear local state
        }
        this.driver = null;
        return 'terminated';
    }
    // ─── Private Helpers ───────────────────────────────────
    ensureSession() {
        if (!this.driver) {
            throw new Error('No active Appium session. Call start_appium_session first, ' +
                'or use inspect_ui_hierarchy with an XML dump.');
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
        console.error(`[AppForge] ⚠️ Could not probe Appium status at ${hostname}:${port}. ` +
            `Defaulting to Appium 2 path '/'. If session fails, ensure Appium is running: npx appium`);
        return '/';
    }
    /**
     * Probes a given status endpoint. Returns true if it responds with HTTP 200.
     */
    probeStatusEndpoint(hostname, port, statusPath) {
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
    enrichSessionError(error, serverUrl, serverPath, capabilities) {
        const msg = error?.message || String(error);
        if (msg.includes('ECONNREFUSED')) {
            return new Error(`[AppForge] Cannot connect to Appium at ${serverUrl} (path: ${serverPath}).\n` +
                `Make sure Appium is running:\n  npx appium\n` +
                `Or start with a specific port:\n  npx appium --port 4723`);
        }
        if (msg.includes('resource could not be found') || msg.includes('HTTP method that is not supported')) {
            return new Error(`[AppForge] Appium endpoint mismatch. The server responded but rejected the session creation request.\n` +
                `Detected path: "${serverPath}" — this was chosen by auto-detection.\n\n` +
                `Possible causes:\n` +
                `  1. If using Appium 2, ensure it is started without --allow-insecure=web_app flag.\n` +
                `  2. Check that the active driver plugin is installed: npx appium driver list\n` +
                `  3. Override the server path via mcp-config.json → mobile.serverPath\n\n` +
                `Raw error: ${msg}`);
        }
        if (msg.includes('session not created') || msg.includes('Could not start')) {
            return new Error(`[AppForge] Appium session creation failed. Check:\n` +
                `1. Is an emulator/simulator running? (adb devices / xcrun simctl list)\n` +
                `2. Is the app installed? (app path: ${capabilities['appium:app'] ?? 'not set'})\n` +
                `3. Are the capabilities correct?\n` +
                `Raw error: ${msg}`);
        }
        if (msg.includes('xcrun') || msg.includes('iOS SDK')) {
            return new Error(`[AppForge] iOS SDK command timed out. Possible causes:\n` +
                `1. Xcode Command Line Tools not installed: xcode-select --install\n` +
                `2. Simulator is unresponsive — try: xcrun simctl shutdown all && open -a Simulator\n` +
                `3. Ensure the correct iOS SDK is available: xcrun --sdk iphonesimulator --show-sdk-version\n` +
                `Raw error: ${msg}`);
        }
        return error;
    }
    /**
     * Resolves capabilities from existing WDIO configs OR mcp-config.json.
     * Priority: 1. Existing wdio.conf.ts/js, 2. mcp-config.json profiles.
     */
    resolveCapabilities(config, profileName) {
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
        let foundCapabilities = null;
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
                        }
                        catch {
                            console.error(`[AppForge] Found capabilities in ${path.basename(p)} but couldn't parse statically. Falling back to mcp-config profiles.`);
                        }
                    }
                }
                catch (e) {
                    console.error(`[AppForge] Error reading ${p}: ${e}`);
                }
            }
        }
        const profiles = config.mobile.capabilitiesProfiles || {};
        const names = Object.keys(profiles);
        let caps;
        if (foundCapabilities) {
            caps = foundCapabilities;
        }
        else {
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
    resolveServerUrl(config) {
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
