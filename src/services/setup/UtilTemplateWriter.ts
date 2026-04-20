import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../config/McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class UtilTemplateWriter {
  constructor(protected mcpConfigService: McpConfigService) {}

    private writeIfNotExists(filePath: string, content: string) {
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, content);
        }
    }

    /**
     * Atomically copies a directory tree from src to dest.
     * Respects writeIfNotExists semantics: skips files that already exist in dest,
     * preserving any user customisations on re-runs.
     */
    private copyDirRecursive(src: string, dest: string): void {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) {
              fs.mkdirSync(destPath, { recursive: true });
            }
            this.copyDirRecursive(srcPath, destPath);
          } else if (!fs.existsSync(destPath)) {
            // Never overwrite — respect user customisations on re-run
            fs.copyFileSync(srcPath, destPath);
          }
        }
    }

    public scaffoldMobileGestures(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { browser } from '@wdio/globals';

/**
 * Cross-platform W3C Gesture abstractions for Appium.
 * Use these in Page Objects for swipe, scroll, and long-press actions.
 */
export class MobileGestures {
  /**
   * Swipe up (scroll content down).
   */
  static async swipeUp(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * percentage;
    const endY = height * (1 - percentage);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Swipe down (scroll content up).
   */
  static async swipeDown(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * (1 - percentage);
    const endY = height * percentage;

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Long press on an element for a given duration.
   */
  static async longPress(element: WebdriverIO.Element, durationMs: number = 1500) {
    const location = await element.getLocation();
    const size = await element.getSize();
    const x = Math.round(location.x + size.width / 2);
    const y = Math.round(location.y + size.height / 2);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: durationMs },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Scroll until an element with the given text is visible (Android UiScrollable).
   */
  static async scrollToText(text: string) {
    await browser.execute('mobile: scroll', { strategy: 'accessibility id', selector: text });
  }

  /**
   * Handle a native alert by accepting or dismissing it.
   */
  static async handleAlert(accept: boolean = true) {
    if (accept) {
      await browser.acceptAlert();
    } else {
      await browser.dismissAlert();
    }
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        fs.writeFileSync(path.join(projectRoot, targetPath, 'MobileGestures.ts'), content);
    }

    public scaffoldMockServer(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import express from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Local API Mock Server for Mobile Traffic Interception.
 * Start this alongside Appium tests to control backend responses.
 *
 * IMPORTANT: Android emulators cannot reach 'localhost' on the host machine.
 * Use MockServer.getBaseUrl('android') to get the correct address.
 */
export class MockServer {
  private app = express();
  private server: any;
  private scenarios: Map<string, any> = new Map();

  constructor(private port: number = 3000) {
    this.app.use(express.json());
  }

  /**
   * Returns the correct base URL for the mock server based on the platform.
   * Android emulators use 10.0.2.2 (mapped to host localhost).
   * iOS simulators and real devices use localhost directly.
   */
  static getBaseUrl(platform: 'android' | 'ios' = 'android', port: number = 3000): string {
    if (platform === 'android') {
      return \`http://10.0.2.2:\${port}\`;
    }
    return \`http://localhost:\${port}\`;
  }

  /**
   * Register a static route with a fixed response.
   */
  setupRoute(method: 'get' | 'post' | 'put' | 'delete', path: string, response: any, statusCode: number = 200) {
    this.app[method](path, (_req: any, res: any) => {
      res.status(statusCode).json(response);
    });
  }

  /**
   * Register a dynamic route that returns different responses based on the active scenario.
   */
  setupDynamicRoute(method: 'get' | 'post' | 'put' | 'delete', path: string, scenarioKey: string) {
    this.app[method](path, (_req: any, res: any) => {
      const scenario = this.scenarios.get(scenarioKey);
      if (scenario) {
        res.status(scenario.statusCode || 200).json(scenario.body);
      } else {
        res.status(404).json({ error: 'No active scenario for ' + scenarioKey });
      }
    });
  }

  /**
   * Activate a named scenario with a response body and status code.
   */
  setScenario(key: string, body: any, statusCode: number = 200) {
    this.scenarios.set(key, { body, statusCode });
  }

  /**
   * Load scenarios from a JSON file (e.g., test-data/mock-scenarios.json).
   * JSON format: { "scenarioKey": { "method": "get", "path": "/api/users", "response": {...}, "statusCode": 200 } }
   */
  loadScenariosFromFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
      console.warn(\`Mock scenarios file not found: \${filePath}\`);
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const scenarios = JSON.parse(raw);
    for (const [key, config] of Object.entries(scenarios) as any[]) {
      this.setScenario(key, config.response, config.statusCode || 200);
      if (config.method && config.path) {
        this.setupDynamicRoute(config.method, config.path, key);
      }
    }
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(\`Mock Server running on http://localhost:\${this.port}\`);
        console.log(\`  Android emulator URL: http://10.0.2.2:\${this.port}\`);
        resolve(true);
      });
    });
  }

  stop() {
    if (this.server) this.server.close();
    this.scenarios.clear();
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        fs.writeFileSync(path.join(projectRoot, targetPath, 'MockServer.ts'), content);
    }

    public scaffoldAppiumDriver(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { browser, $ } from '@wdio/globals';
import fs from 'fs';

/**
 * AppiumDriver — Core Appium session wrapper for WDIO v9.
 * Provides platform detection, screenshot capture, and context switching.
 */
export class AppiumDriver {
  static async find(selector: string) { return await $(selector); }

  /** Synchronous platform check — valid after session has started. */
  static isAndroid(): boolean {
    return ((browser.capabilities as any)?.platformName ?? '').toLowerCase() === 'android';
  }
  static isIOS(): boolean {
    return ((browser.capabilities as any)?.platformName ?? '').toLowerCase() === 'ios';
  }

  /** Async versions — prefer synchronous isAndroid()/isIOS() inside Page Object methods. */
  static async getPageSource() { return await browser.getPageSource(); }
  static async takeScreenshot(filePath?: string) {
    const base64 = await browser.takeScreenshot();
    if (filePath) fs.writeFileSync(filePath, base64, 'base64');
    return base64;
  }
  static async openDeepLink(url: string) {
    await browser.url(url);
  }
  static async handlePermissionDialog(accept: boolean) {
    if (accept) await browser.acceptAlert().catch(() => {});
    else await browser.dismissAlert().catch(() => {});
  }
  static async switchToWebView() {
    const handles = await browser.getContexts();
    const webview = handles.find((h: string) => h.startsWith('WEBVIEW'));
    if (webview) await browser.switchContext(webview);
  }
  static async switchToNativeContext() {
    await browser.switchContext('NATIVE_APP');
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'AppiumDriver.ts'), content);
    }

    public scaffoldActionUtils(projectRoot: string, elementWait: number = 10000, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { $, $$ } from '@wdio/globals';

/**
 * ActionUtils — Core element interaction helpers for Appium mobile tests.
 *
 * Use these in Page Object methods instead of calling WebdriverIO APIs directly.
 * This provides a single place to add retry logic, logging, or platform-specific
 * workarounds without touching every Page Object.
 */
export class ActionUtils {
  /**
   * Tap an element by selector.
   * Waits for the element to be displayed before tapping.
   */
  static async tap(selector: string, timeout = ${elementWait}) {
    const el = await $(selector);
    await el.waitForDisplayed({ timeout });
    await el.click();
  }

  /**
   * Double-tap an element by selector.
   */
  static async doubleTap(selector: string) {
    const el = await $(selector);
    await el.waitForDisplayed();
    await el.doubleClick();
  }

  /**
   * Type text into a field by selector.
   * Waits for the element, clears existing value, then types.
   */
  static async type(selector: string, text: string, timeout = ${elementWait}) {
    const el = await $(selector);
    await el.waitForDisplayed({ timeout });
    await el.clearValue();
    await el.setValue(text);
  }

  /**
   * Clear the value of an input field by selector.
   */
  static async clear(selector: string) {
    const el = await $(selector);
    await el.waitForDisplayed();
    await el.clearValue();
  }

  /**
   * Clear an input field and type new text (convenience wrapper for type).
   */
  static async clearAndType(selector: string, text: string) {
    await ActionUtils.type(selector, text);
  }

  /**
   * Tap the first element that contains the given visible text.
   * Uses cross-platform accessibility text matching.
   */
  static async tapByText(text: string) {
    // Try accessibility id first, then XPath as fallback
    const byA11y = await \`~\${text}\`;
    const els = await $$(\`*[\${byA11y}]\`);
    if (els.length > 0) {
      await els[0].click();
      return;
    }
    const byXpath = await \`//*[@text='\${text}' or @label='\${text}' or @name='\${text}']\`;
    const el = await $(byXpath);
    await el.waitForDisplayed();
    await el.click();
  }

  /**
   * Tap the Nth element matching a selector (0-indexed).
   * Useful for lists where multiple elements share the same selector.
   */
  static async tapByIndex(selector: string, index: number) {
    const els = await $$(selector);
    if (index >= els.length) {
      throw new Error(\`tapByIndex: only \${els.length} elements found for "\${selector}", index \${index} out of range\`);
    }
    await els[index].waitForDisplayed();
    await els[index].click();
  }

  /**
   * Get the visible text of an element.
   */
  static async getText(selector: string): Promise<string> {
    const el = await $(selector);
    await el.waitForDisplayed();
    return el.getText();
  }

  /**
   * Get the value attribute of an input element.
   */
  static async getValue(selector: string): Promise<string> {
    const el = await $(selector);
    return el.getValue();
  }

  /**
   * Check if an element is currently displayed on screen.
   */
  static async isDisplayed(selector: string): Promise<boolean> {
    try {
      const el = await $(selector);
      return el.isDisplayed();
    } catch {
      return false;
    }
  }

  /**
   * Check if an element is enabled (not greyed out).
   */
  static async isEnabled(selector: string): Promise<boolean> {
    const el = await $(selector);
    return el.isEnabled();
  }

  /**
   * Dismiss the software keyboard.
   */
  static async hideKeyboard() {
    try {
      await (global as any).driver.hideKeyboard();
    } catch {
      // Keyboard may not be visible — ignore
    }
  }

  /**
   * Tap the device Back button (Android only).
   */
  static async tapBack() {
    await (global as any).driver.back();
  }

  /**
   * Tap an element and wait for a different element to appear.
   * Used for transitions where the result element confirms the navigation succeeded.
   */
  static async tapAndWait(tapSelector: string, waitForSelector: string, timeout = ${elementWait}) {
    await ActionUtils.tap(tapSelector);
    const target = await $(waitForSelector);
    await target.waitForDisplayed({ timeout });
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'ActionUtils.ts'), content);
    }

    public scaffoldGestureUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { browser, $ } from '@wdio/globals';

export class GestureUtils {
  static async scrollDown() {
    await browser.execute('mobile: scroll', { direction: 'down' });
  }
  static async swipeLeft(selector?: string) {
    await browser.execute('mobile: swipe', { direction: 'left', element: selector ? (await $(selector)).elementId : undefined });
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'GestureUtils.ts'), content);
    }

    public scaffoldWaitUtils(projectRoot: string, elementWait: number = 10000, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { browser, $ } from '@wdio/globals';

export class WaitUtils {
  static async waitForDisplayed(selector: string, timeout = ${elementWait}) {
    await (await $(selector)).waitForDisplayed({ timeout });
  }
  static async waitForCondition(fn: () => Promise<boolean>, timeout = 15000, pollInterval = 500) {
    await browser.waitUntil(fn, { timeout, interval: pollInterval });
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'WaitUtils.ts'), content);
    }

    public scaffoldAssertionUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `import { browser, $ } from '@wdio/globals';

export class AssertionUtils {
  static async assertDisplayed(selector: string, message?: string) {
    const isDisplayed = await (await $(selector)).isDisplayed();
    if (!isDisplayed) throw new Error(message || \`Element \${selector} is not displayed.\`);
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'AssertionUtils.ts'), content);
    }

    public scaffoldTestContext(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `export class TestContext {
  private static state: Map<string, any> = new Map();
  private static attachments: any[] = [];

  static set<T>(key: string, value: T) { this.state.set(key, value); }
  static get<T>(key: string): T | undefined { return this.state.get(key) as T; }
  static require<T>(key: string): T {
    if (!this.state.has(key)) throw new Error(\`Missing context key: \${key}\`);
    return this.state.get(key) as T;
  }
  static clear() { this.state.clear(); this.attachments = []; }
  static addAttachment(name: string, data: any, mimeType: string) {
    this.attachments.push({ name, data, mimeType });
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'TestContext.ts'), content);
    }

    public scaffoldDataUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = `export class DataUtils {
  static getEnv(key: string, fallback?: string) { return process.env[key] || fallback; }
  static requireEnv(key: string) {
    if (!process.env[key]) throw new Error(\`Missing required env variable: \${key}\`);
    return process.env[key] as string;
  }
}
`;
        const targetPath = paths?.utilsRoot || 'src/utils';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'DataUtils.ts'), content);
    }

    public scaffoldMockScenarios(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const content = JSON.stringify({
                  "login-success": {
                    method: "post",
                    path: "/api/auth/login",
                    statusCode: 200,
                    body: {
                      token: "mock-jwt-token-123",
                      user: { id: 1, name: "Test User", role: "admin" }
                    }
                  },
                  "login-failure": {
                    method: "post",
                    path: "/api/auth/login",
                    statusCode: 401,
                    body: { error: "Invalid credentials" }
                  },
                  "user-profile": {
                    method: "get",
                    path: "/api/user/profile",
                    statusCode: 200,
                    body: { id: 1, name: "Test User", email: "test@example.com" }
                  }
                }, null, 2);
        const targetPath = paths?.testDataRoot || 'src/test-data';
        this.writeIfNotExists(path.join(projectRoot, targetPath, 'mock-scenarios.json'), content);
    }
}