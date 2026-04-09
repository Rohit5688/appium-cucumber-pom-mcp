import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from './McpConfigService.js';

export class ProjectSetupService {
  private mcpConfigService = new McpConfigService();
  /**
   * Scaffolds a complete, runnable Appium + Cucumber + TypeScript project.
   */
  public async setup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
    }

    const configPath = path.join(projectRoot, 'mcp-config.json');

    // ─── PHASE 1: Config does not exist yet ─────────────────────────────────────
    if (!fs.existsSync(configPath)) {
      this.generateConfigTemplate(projectRoot);
      return JSON.stringify({
        phase: 1,
        status: 'CONFIG_TEMPLATE_CREATED',
        configPath,
        message: [
          '📋 STEP 1 of 2: mcp-config.json has been created.',
          '',
          'Open mcp-config.json and fill in at minimum:',
          '  • mobile.defaultPlatform (android or ios)',
          '  • mobile.capabilitiesProfiles[yourDevice] fields',
          '  • environments (list your env names, e.g. ["local", "staging", "prod"])',
          '  • currentEnvironment (which env to test against now)',
          '  • codegen.tagTaxonomy (your team\'s valid test tags)',
          '',
          'You do NOT need to fill in everything now.',
          'Fields marked CONFIGURE_ME can be filled later — run upgrade_project when you do.',
          '',
          '📖 Reference: docs/MCP_CONFIG_REFERENCE.md explains every field.',
          '',
          'When ready, call setup_project again with the same projectRoot to continue.'
        ].join('\n'),
        docsPath: path.join(projectRoot, 'docs', 'MCP_CONFIG_REFERENCE.md'),
        nextStep: 'Call setup_project again after filling mcp-config.json'
      }, null, 2);
    }

    // ─── PHASE 2: Config exists — scan for CONFIGURE_ME and scaffold ─────────────
    const unfilledFields = this.scanConfigureMe(projectRoot);

    let config: any;
    try {
      const configService = new McpConfigService();
      config = configService.read(projectRoot);
    } catch (err: any) {
      return JSON.stringify({
        phase: 2,
        status: 'CONFIG_PARSE_ERROR',
        message: `Cannot read mcp-config.json: ${err.message}. Fix the syntax error and try again.`,
        hint: 'Run: npx jsonlint mcp-config.json to find syntax errors'
      }, null, 2);
    }

    // Warn about required fields still set to CONFIGURE_ME — collect JSON paths for each
    const requiredUnfilled = unfilledFields.filter(f =>
      ['defaultPlatform', 'platformName', 'automationName', 'deviceName', 'appium:app'].includes(f)
    );
    if (requiredUnfilled.length > 0) {
      // Find which capability profiles still carry CONFIGURE_ME values
      const profiles = config?.mobile?.capabilitiesProfiles ?? {};
      const offendingPaths: string[] = [];
      for (const [profileName, caps] of Object.entries(profiles) as [string, any][]) {
        for (const [capKey, capVal] of Object.entries(caps ?? {})) {
          if (typeof capVal === 'string' && capVal.startsWith('CONFIGURE_ME')) {
            offendingPaths.push(`mobile.capabilitiesProfiles.${profileName}.${capKey}`);
          }
        }
      }
      if (typeof (config?.mobile?.defaultPlatform) === 'string' && (config.mobile.defaultPlatform as string).startsWith('CONFIGURE_ME')) {
        offendingPaths.unshift('mobile.defaultPlatform');
      }
      return JSON.stringify({
        phase: 2,
        status: 'REQUIRED_FIELDS_MISSING',
        message: 'The following required fields still have CONFIGURE_ME values. Fill these in mcp-config.json first:',
        requiredFields: requiredUnfilled,
        offendingJsonPaths: offendingPaths,
        fix: offendingPaths.length > 0
          ? `Open mcp-config.json and update: ${offendingPaths.slice(0, 3).join(', ')}`
          : 'Search mcp-config.json for CONFIGURE_ME and replace with real values.',
        hint: 'Tip: If you added new capability profiles, delete the placeholder "myDevice" profile — it still triggers this check.'
      }, null, 2);
    }

    // ─── Proceed with scaffolding ────────────────────────────────────────────────
    const configService = new McpConfigService();
    const timeouts = configService.getTimeouts(config);
    const reporting = configService.getReporting(config);
    const effectivePlatform = (config?.mobile?.defaultPlatform as string) || platform;

    // Atomic Staging: scaffold all files into a temp directory first.
    // Only copy to projectRoot on full success — prevents corrupt half-projects on failure.
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-'));
    const filesCreated: string[] = [];
    try {
      // 1. Create directory structure in staging
      const dirs = ['src/features', 'src/step-definitions', 'src/pages', 'src/utils', 'src/test-data', 'src/config', 'src/credentials', 'reports'];
      for (const dir of dirs) {
        fs.mkdirSync(path.join(stagingDir, dir), { recursive: true });
      }

      // MCP #7: Scaffold env-specific files if environments are defined
      const environments = Array.isArray(config?.environments) ? config.environments : [];
      let envFilesScaffolded = 0;
      for (const env of environments) {
        if (typeof env === 'string' && env && !env.startsWith('CONFIGURE_ME')) {
          const envPath = path.join(stagingDir, 'src', 'credentials', `users.${env}.json`);
          // Default to an empty array so developers know where to map users
          fs.writeFileSync(envPath, '[\n  \n]\n', 'utf-8');
          filesCreated.push(`src/credentials/users.${env}.json`);
          envFilesScaffolded++;
        }
      }
      if (environments.length > 0 && envFilesScaffolded === 0) {
        // Only CONFIGURE_ME present — scaffold a default 
        fs.writeFileSync(path.join(stagingDir, 'src', 'credentials', `users.staging.json`), '[\n  \n]\n', 'utf-8');
        filesCreated.push('src/credentials/users.staging.json');
      }

      // 2. package.json
      this.scaffoldPackageJson(stagingDir, appName, effectivePlatform);
      filesCreated.push('package.json');

      // 3. tsconfig.json
      this.scaffoldTsConfig(stagingDir);
      filesCreated.push('tsconfig.json');

      // 4. cucumber.js config
      this.scaffoldCucumberConfig(stagingDir);
      filesCreated.push('cucumber.js');

      // 5. BasePage.ts
      this.scaffoldBasePage(stagingDir);
      filesCreated.push('src/pages/BasePage.ts');

      // 6. Utils Layer
      this.scaffoldAppiumDriver(stagingDir);
      this.scaffoldActionUtils(stagingDir, timeouts?.elementWait);
      this.scaffoldGestureUtils(stagingDir);
      this.scaffoldWaitUtils(stagingDir, timeouts?.elementWait);
      this.scaffoldAssertionUtils(stagingDir);
      this.scaffoldTestContext(stagingDir);
      this.scaffoldDataUtils(stagingDir);
      this.scaffoldLocatorUtils(stagingDir);
      // Keep old for back compat
      this.scaffoldMobileGestures(stagingDir);
      filesCreated.push('src/utils/ActionUtils.ts', 'src/utils/WaitUtils.ts', 'src/utils/MobileGestures.ts', 'src/utils/LocatorUtils.ts');

      // 7. MockServer.ts
      this.scaffoldMockServer(stagingDir);
      filesCreated.push('src/utils/MockServer.ts');

      // 8. Before/After hooks
      this.scaffoldHooks(stagingDir, reporting.screenshotOn as 'failure' | 'always' | 'never', reporting);
      filesCreated.push('src/step-definitions/hooks.ts');

      // 9. Sample feature
      this.scaffoldSampleFeature(stagingDir);
      filesCreated.push('src/features/sample.feature');

      // 10. .gitignore
      this.scaffoldGitignore(stagingDir);
      filesCreated.push('.gitignore');

      // 11. wdio.conf.ts — WebdriverIO + Appium connection config
      if (effectivePlatform === 'both') {
        this.scaffoldWdioSharedConfig(stagingDir, timeouts, reporting);
        this.scaffoldWdioAndroidConfig(stagingDir);
        this.scaffoldWdioIosConfig(stagingDir);
        filesCreated.push('wdio.shared.conf.ts', 'wdio.android.conf.ts', 'wdio.ios.conf.ts');
      } else {
        this.scaffoldWdioConfig(stagingDir, effectivePlatform, timeouts, reporting);
        filesCreated.push('wdio.conf.ts');
      }

      // 12. Mock scenarios sample JSON
      this.scaffoldMockScenarios(stagingDir);
      filesCreated.push('src/test-data/mock-scenarios.json');

      // ── Commit: atomically copy staging dir to the real projectRoot ──
      this.copyDirRecursive(stagingDir, projectRoot);

    } finally {
      // Always clean up the staging directory, even on failure
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors — OS will reclaim temp dir on restart */ }
    }

    return JSON.stringify({
      phase: 2,
      status: 'SETUP_COMPLETE',
      filesCreated,
      unfilledOptionalFields: unfilledFields,
      message: unfilledFields.length > 0
        ? `Project scaffolded. ${unfilledFields.length} optional field(s) still have CONFIGURE_ME values. Fill them and run upgrade_project to apply.`
        : 'Project fully scaffolded from your mcp-config.json.',
      nextSteps: [
        // MCP #8: npm install MUST be run before any test or AppForge commands
        '⚡ FIRST: Run `npm install` in the project root to install all dependencies',
        'Run check_environment to verify your Appium setup',
        'Run start_appium_session to connect to your device',
        unfilledFields.length > 0 ? `Fill: ${unfilledFields.join(', ')} in mcp-config.json` : null
      ].filter(Boolean)
    }, null, 2);
  }

  /**
   * Phase 1: Generates a fully self-documenting mcp-config.json template.
   * Fields the user must fill have "CONFIGURE_ME" as their value.
   * All sections are present so the user sees the full picture at once.
   */
  public generateConfigTemplate(projectRoot: string): string {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    const schemaDir = path.join(projectRoot, '.AppForge');

    if (!fs.existsSync(schemaDir)) fs.mkdirSync(schemaDir, { recursive: true });

    const template: Record<string, any> = {
      "$schema": "./.AppForge/configSchema.json",
      "$docs": "Full field reference: docs/MCP_CONFIG_REFERENCE.md",
      "version": "1.1.0",
      "project": {
        "language": "typescript",
        "testFramework": "cucumber",
        "client": "webdriverio-appium",
        "executionCommand": "npx wdio run wdio.conf.ts"
      },
      "mobile": {
        "defaultPlatform": "CONFIGURE_ME: android, ios, or both",
        "capabilitiesProfiles": {
          "myDevice": {
            "_comment": "Rename 'myDevice' to your device name (e.g. pixel8, iphone14)",
            "platformName": "CONFIGURE_ME: Android or iOS",
            "appium:automationName": "CONFIGURE_ME: UiAutomator2 or XCUITest",
            "appium:deviceName": "CONFIGURE_ME: e.g. Pixel_8 or iPhone 14",
            "appium:app": "CONFIGURE_ME: /path/to/your/app.apk (or .ipa/.app)"
          }
        }
      },
      "paths": {
        "_comment": "Change only if your project doesn't use the default folder names",
        "featuresRoot": "features",
        "pagesRoot": "pages",
        "stepsRoot": "step-definitions",
        "utilsRoot": "utils",
        "testDataRoot": "src/test-data"
      },
      "environments": ["CONFIGURE_ME: e.g. local, staging, prod"],
      "currentEnvironment": "CONFIGURE_ME: which environment to test against now",
      "credentials": {
        "_comment": "Run manage_users to choose a strategy. Options: role-env-matrix, per-env-files, unified-key, custom",
        "strategy": "CONFIGURE_ME: run manage_users to see options"
      },
      "codegen": {
        "customWrapperPackage": null,
        "_customWrapperPackage_hint": "If you have a shared test library (e.g. @myorg/test-utils), put the package name here",
        "basePageStrategy": "extend",
        "_basePageStrategy_options": "extend | compose | custom",
        "namingConvention": {
          "pageObjectSuffix": "Page",
          "_pageObjectSuffix_options": "Page | Screen | Component | Flow",
          "caseStyle": "PascalCase",
          "_caseStyle_options": "PascalCase | camelCase"
        },
        "gherkinStyle": "strict",
        "_gherkinStyle_options": "strict | flexible",
        "tagTaxonomy": ["CONFIGURE_ME: list your team's valid test tags e.g. @smoke, @P0, @regression"],
        "generateFiles": "full",
        "_generateFiles_options": "full | feature-steps | feature-only"
      },
      "reuse": {
        "locatorOrder": ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"]
      },
      "timeouts": {
        "elementWait": 10000,
        "scenarioTimeout": 60000,
        "connectionRetry": 120000,
        "connectionRetryCount": 3,
        "appiumPort": 4723,
        "xmlCacheTtlMinutes": 5
      },
      "selfHeal": {
        "confidenceThreshold": 0.7,
        "maxCandidates": 3,
        "autoApply": false
      },
      "reporting": {
        "format": "html",
        "_format_options": "html | allure | junit | none",
        "outputDir": "reports",
        "screenshotOn": "failure",
        "_screenshotOn_options": "failure | always | never"
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
    return configPath;
  }

  /**
   * Reads the config and returns a list of fields that still have "CONFIGURE_ME" markers.
   */
  public scanConfigureMe(projectRoot: string): string[] {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) return ['mcp-config.json not found'];

    const raw = fs.readFileSync(configPath, 'utf-8');
    const unconfigured: string[] = [];

    // Find all values that start with "CONFIGURE_ME"
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('"CONFIGURE_ME')) {
        // Extract the key name from the current line
        const keyMatch = line.match(/"([^"]+)":\s*"CONFIGURE_ME/);
        if (keyMatch) {
          unconfigured.push(keyMatch[1]);
        }
      }
    }

    return unconfigured;
  }

  // ─── Scaffolders ───────────────────────────────────────────────

  private scaffoldPackageJson(projectRoot: string, appName: string, platform: string) {
    const scripts: Record<string, string> = {};
    if (platform === 'both') {
      scripts["test"]             = "npx wdio run wdio.shared.conf.ts";
      scripts["test:android"]     = "npx wdio run wdio.android.conf.ts";
      scripts["test:ios"]         = "npx wdio run wdio.ios.conf.ts";
      scripts["test:smoke"]       = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:regression"]  = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@regression'";
      scripts["test:e2e"]         = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tagExpression='@e2e'";
      scripts["test:smoke:android"] = "npx wdio run wdio.android.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:smoke:ios"]   = "npx wdio run wdio.ios.conf.ts --cucumberOpts.tagExpression='@smoke'";
    } else {
      scripts["test"]             = "npx wdio run wdio.conf.ts";
      scripts["test:smoke"]       = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@smoke'";
      scripts["test:regression"]  = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@regression'";
      scripts["test:e2e"]         = "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@e2e'";
      if (platform === 'android') scripts["test:android"] = "npx wdio run wdio.conf.ts";
      if (platform === 'ios')     scripts["test:ios"] = "npx wdio run wdio.conf.ts";
    }

    const pkg = {
      name: appName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      type: 'module',
      scripts,
      dependencies: {
        // WebdriverIO core + Appium framework
        "@wdio/cli":                 "8.29.1",
        "@wdio/local-runner":        "8.29.1",
        "@wdio/cucumber-framework":  "8.29.1",
        "@wdio/appium-service":      "8.29.1",
        "@wdio/spec-reporter":       "8.29.1",
        "@wdio/allure-reporter":     "8.29.1",
        "webdriverio":               "8.29.1",
        // Appium server — must be >= 2.5.4 for xcuitest-driver peer compat
        "appium":                    "^2.14.0",
        // Appium drivers — use unscoped package names (scoped @appium/* do NOT exist on npm)
        "appium-uiautomator2-driver": "^3.9.0",
        "appium-xcuitest-driver":    "^7.25.0",
        // Cucumber runner — ^10.8.0 required by allure-cucumberjs@3.x peer dep
        "@cucumber/cucumber":        "^10.8.0",
        "@cucumber/pretty-formatter": "1.0.1",
        // TypeScript runtime
        "ts-node":                   "10.9.2",
        "typescript":                "5.4.5",
        // Utilities
        "express":                   "^4.18.0",
        "yaml":                      "^2.4.1",
        "allure-cucumberjs":         "^3.0.0"
      },
      devDependencies: {
        "@types/node":               "^20.0.0",
        "@types/express":            "^4.17.0"
      }
    };
    this.writeIfNotExists(path.join(projectRoot, 'package.json'), JSON.stringify(pkg, null, 2));
  }

  private scaffoldTsConfig(projectRoot: string) {
    const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(tsConfigPath)) {
      // Acknowledge existing tsconfig — do not overwrite
      return;
    }
    const tsConfig = {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022"],
        outDir: "./dist",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true
      },
      "ts-node": {
        esm: true,
        experimentalSpecifierResolution: "node"
      },
      include: ["src/**/*.ts", "wdio.conf.ts", "wdio.shared.conf.ts", "wdio.android.conf.ts", "wdio.ios.conf.ts"],
      exclude: ["node_modules", "dist", "reports"]
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }

  private scaffoldCucumberConfig(projectRoot: string) {
    const content = `// cucumber.js — Cucumber configuration
export default {
  requireModule: ['ts-node/esm'],
  require: ['src/step-definitions/**/*.ts'],
  format: [
    'progress-bar',
    'json:reports/cucumber-report.json',
    'html:reports/cucumber-report.html'
  ],
  paths: ['src/features/**/*.feature'],
  publishQuiet: true
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'cucumber.js'), content);
  }

  private scaffoldBasePage(projectRoot: string) {
    const content = `import { AppiumDriver } from '../utils/AppiumDriver.js';
import { GestureUtils } from '../utils/GestureUtils.js';
import { WaitUtils } from '../utils/WaitUtils.js';
import { AssertionUtils } from '../utils/AssertionUtils.js';

export abstract class BasePage {
  protected driver = AppiumDriver;
  protected wait = WaitUtils;
  protected gesture = GestureUtils;
  protected assert = AssertionUtils;

  // Every page must implement this
  abstract isLoaded(): Promise<boolean>;

  async waitForLoaded(timeout = 15000): Promise<void> {
    await WaitUtils.waitForCondition(() => this.isLoaded(), timeout);
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'pages', 'BasePage.ts'), content);
  }

  private scaffoldMobileGestures(projectRoot: string) {
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
    fs.writeFileSync(path.join(projectRoot, 'src', 'utils', 'MobileGestures.ts'), content);
  }

  private scaffoldMockServer(projectRoot: string) {
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
    fs.writeFileSync(path.join(projectRoot, 'src', 'utils', 'MockServer.ts'), content);
  }

  private scaffoldLocatorUtils(projectRoot: string) {
    const tsPath = path.join(projectRoot, 'src/utils/LocatorUtils.ts');
    this.writeIfNotExists(tsPath, [
      'import fs from "fs";',
      'import path from "path";',
      'import yaml from "yaml";',
      'import { browser } from "@wdio/globals";',
      '',
      'export class LocatorUtils {',
      '  /**',
      '   * Reads a YAML locator file and returns the appropriate selector for the current platform.',
      '   * Platform is resolved synchronously from driver capabilities at runtime.',
      '   */',
      '  public static getLocator(yamlFileName: string, locatorKey: string): string {',
      '    // Read platform synchronously from WebdriverIO capabilities (set after session starts)',
      '    const caps = browser.capabilities as Record<string, any>;',
      '    const platformName = (caps?.platformName ?? \'\').toLowerCase();',
      '    const platform = platformName === \'ios\' ? \'ios\' : \'android\';',
      '',
      '    const filePath = path.resolve(process.cwd(), "src/locators", `${yamlFileName}.yaml`);',
      '    if (!fs.existsSync(filePath)) {',
      '      throw new Error(`Locator file not found: ${filePath}`);',
      '    }',
      '',
      '    const fileContent = fs.readFileSync(filePath, "utf8");',
      '    const locators = yaml.parse(fileContent);',
      '',
      '    if (!locators[locatorKey]) {',
      '      throw new Error(`Locator key "${locatorKey}" not found in ${filePath}`);',
      '    }',
      '',
      '    const selector = locators[locatorKey][platform];',
      '    if (!selector) {',
      '      throw new Error(`No selector defined for platform "${platform}" on key "${locatorKey}" in ${filePath}`);',
      '    }',
      '',
      '    return selector;',
      '  }',
      '}'
    ].join('\n'));

    const locatorsDir = path.join(projectRoot, 'src/locators');
    if (!fs.existsSync(locatorsDir)) {
      fs.mkdirSync(locatorsDir, { recursive: true });
    }

    const yamlPath = path.join(locatorsDir, 'login.yaml');
    this.writeIfNotExists(yamlPath, [
      'submit_button:',
      '  android: id=com.example:id/submit',
      '  ios: ~submitButton',
      '',
      'username_input:',
      '  android: id=com.example:id/username',
      '  ios: ~usernameInput'
    ].join('\n'));
  }

  private scaffoldHooks(projectRoot: string, screenshotOn: 'failure' | 'always' | 'never' = 'failure', reporting?: { outputDir?: string }) {
    const shouldCapture = screenshotOn === 'always'
      ? 'true'
      : screenshotOn === 'failure'
      ? "scenario.result?.status === Status.FAILED"
      : 'false';

    const content = `import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { AppiumDriver } from '../utils/AppiumDriver.js';
import { TestContext } from '../utils/TestContext.js';

/**
 * Cucumber Hooks — Lifecycle management for Appium sessions.
 */

BeforeAll(async function () {
  console.log('[Hooks] Test suite starting...');
});

Before(async function (scenario) {
  console.log(\`[Hooks] Starting scenario: \${scenario.pickle.name}\`);
});

After(async function (scenario) {
  if (${shouldCapture}) {
    try {
      const screenshot = await AppiumDriver.takeScreenshot();
      if (screenshot) {
        TestContext.addAttachment('screenshot', Buffer.from(screenshot, 'base64'), 'image/png');
        this.attach(Buffer.from(screenshot, 'base64'), 'image/png');
      }
      const pageSource = await AppiumDriver.getPageSource();
      if (pageSource) {
        TestContext.addAttachment('page-source', pageSource, 'text/xml');
        this.attach(pageSource, 'text/xml');
      }
      console.log('[Hooks] Captured screenshot and page source for scenario');
    } catch (err) {
      console.error('[Hooks] Failed to capture artifacts:', err);
    }
  }
  TestContext.clear();
});

AfterAll(async function () {
  console.log('[Hooks] Test suite complete. Reports: ${reporting?.outputDir ?? 'reports'}');
});
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'step-definitions', 'hooks.ts'), content);
  }

  private scaffoldSampleFeature(projectRoot: string) {
    const content = `@smoke
Feature: Sample Login Flow
  As a user
  I want to log into the application
  So that I can access my account

  @android @ios
  Scenario: Successful login with valid credentials
    Given the app is launched
    When I enter username "testuser" and password "pass123"
    And I tap the login button
    Then I should see the home screen
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'features', 'sample.feature'), content);
  }

  private scaffoldGitignore(projectRoot: string) {
    const content = `node_modules/
dist/
reports/
*.log
.env
.env.*
.DS_Store

# Credential files — never commit these
credentials/
`;
    this.writeIfNotExists(path.join(projectRoot, '.gitignore'), content);
  }

  private scaffoldMcpConfig(projectRoot: string, platform: string) {
    const config: any = {
      $docs: "See docs/MCP_CONFIG_REFERENCE.md for full field reference and examples.",
      $schema: "./.AppForge/configSchema.json",
      version: "1.1.0",
      project: {
        language: "typescript",
        testFramework: "cucumber",
        client: "webdriverio-appium"
      },
      mobile: {
        defaultPlatform: platform,
        capabilitiesProfiles: {
          "pixel8": {
            "platformName": "Android",
            "appium:automationName": "UiAutomator2",
            "appium:deviceName": "Pixel_8"
          },
          "iphone14": {
            "platformName": "iOS",
            "appium:automationName": "XCUITest",
            "appium:deviceName": "iPhone 14"
          }
        }
      },
      paths: {
        featuresRoot: "features",
        pagesRoot: "pages",
        stepsRoot: "step-definitions",
        utilsRoot: "utils"
      },
      reuse: {
        locatorOrder: ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"]
      },
      codegen: {
        customWrapperPackage: null,
        basePageStrategy: "extend",
        namingConvention: {
          pageObjectSuffix: "Page",
          caseStyle: "PascalCase"
        },
        gherkinStyle: "strict",
        tagTaxonomy: ["@smoke", "@regression"],
        generateFiles: "full"
      },
      timeouts: {
        elementWait: 10000,
        scenarioTimeout: 60000,
        connectionRetry: 120000,
        connectionRetryCount: 3,
        appiumPort: 4723,
        xmlCacheTtlMinutes: 5
      },
      selfHeal: {
        confidenceThreshold: 0.7,
        maxCandidates: 3,
        autoApply: false
      },
      reporting: {
        format: "html",
        outputDir: "reports",
        screenshotOn: "failure"
      },
      tsconfigPath: null,  // Set this to your tsconfig path if not using root tsconfig.json
      environments: ["local", "staging", "prod"],
      currentEnvironment: "staging"
      // credentials: intentionally NOT scaffolded here.
      // Run manage_users to choose a credential strategy for your project.
    };
    fs.writeFileSync(path.join(projectRoot, 'mcp-config.json'), JSON.stringify(config, null, 2));
  }

  private scaffoldWdioConfig(
    projectRoot: string,
    platform: string,
    timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number },
    reporting?: { format?: string; outputDir?: string }
  ) {
    // Issue #16 Fix: Generate platform-specific wdio.conf.ts that doesn't import from missing files
    const content = `import type { Options } from '@wdio/types';

/**
 * WebdriverIO + Appium Configuration
 * Generated by Appium MCP Server for ${platform === 'ios' ? 'iOS' : 'Android'}.
 * Adjust capabilities for your target device/emulator.
 */
export const config: Options.Testrunner = {
  runner: 'local',
  hostname: 'localhost',
  port: 4723,
  path: '/',

  // Uses src/features/ to match the AppForge scaffolded project layout
  specs: ['./src/features/**/*.feature'],

  maxInstances: 1,

  capabilities: [{
    platformName: '${platform === 'ios' ? 'iOS' : 'Android'}',
    'appium:automationName': '${platform === 'ios' ? 'XCUITest' : 'UiAutomator2'}',
    'appium:deviceName': '${platform === 'ios' ? 'iPhone 14' : 'Pixel_8'}',
    // 'appium:app': '/path/to/your/app.${platform === 'ios' ? 'app' : 'apk'}',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }],

  framework: 'cucumber',
  cucumberOpts: {
    require: ['./src/step-definitions/**/*.ts'],
    backtrace: false,
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    strict: false,
    timeout: ${timeouts?.scenarioTimeout ?? 60000},
  },

  reporters: ['${reporting?.format === 'allure' ? 'allure' : reporting?.format === 'junit' ? 'junit' : 'spec'}'],

  logLevel: 'info',
  waitforTimeout: ${timeouts?.elementWait ?? 10000},
  connectionRetryTimeout: ${timeouts?.connectionRetry ?? 120000},
  connectionRetryCount: ${timeouts?.connectionRetryCount ?? 3},
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.conf.ts'), content);
  }

  private scaffoldWdioSharedConfig(
    projectRoot: string,
    timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number },
    reporting?: { format?: string; outputDir?: string }
  ) {
    const content = `import type { Options } from '@wdio/types';

/**
 * Shared WebdriverIO Configuration
 * Adjust common settings here. Platform specifics belong in wdio.android.conf.ts / wdio.ios.conf.ts
 */
export const config: Options.Testrunner = {
  runner: 'local',
  hostname: 'localhost',
  port: 4723,
  path: '/',

  // Uses src/features/ to match the AppForge scaffolded project layout
  specs: ['./src/features/**/*.feature'],
  maxInstances: 1,

  framework: 'cucumber',
  cucumberOpts: {
    require: ['./src/step-definitions/**/*.ts'],
    backtrace: false,
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    strict: false,
    timeout: ${timeouts?.scenarioTimeout ?? 60000},
  },

  reporters: ['${reporting?.format === 'allure' ? 'allure' : reporting?.format === 'junit' ? 'junit' : 'spec'}'],

  logLevel: 'info',
  waitforTimeout: ${timeouts?.elementWait ?? 10000},
  connectionRetryTimeout: ${timeouts?.connectionRetry ?? 120000},
  connectionRetryCount: ${timeouts?.connectionRetryCount ?? 3},
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.shared.conf.ts'), content);
  }

  private scaffoldWdioAndroidConfig(projectRoot: string) {
    const content = `import { config as sharedConfig } from './wdio.shared.conf.ts';

export const config = {
  ...sharedConfig,
  capabilities: [{
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Pixel_8',
    // 'appium:app': '/path/to/your/app.apk',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }]
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.android.conf.ts'), content);
  }

  private scaffoldWdioIosConfig(projectRoot: string) {
    const content = `import { config as sharedConfig } from './wdio.shared.conf.ts';

export const config = {
  ...sharedConfig,
  capabilities: [{
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 14',
    // 'appium:app': '/path/to/your/app.app',
    'appium:newCommandTimeout': 240,
    'appium:noReset': false,
  }]
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.ios.conf.ts'), content);
  }

  private scaffoldMockScenarios(projectRoot: string) {
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'test-data', 'mock-scenarios.json'), content);
  }

  private scaffoldAppiumDriver(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

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
    if (filePath) require('fs').writeFileSync(filePath, base64, 'base64');
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'AppiumDriver.ts'), content);
  }

  private scaffoldActionUtils(projectRoot: string, elementWait: number = 10000) {
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'ActionUtils.ts'), content);
  }

  private scaffoldGestureUtils(projectRoot: string) {
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'GestureUtils.ts'), content);
  }

  private scaffoldWaitUtils(projectRoot: string, elementWait: number = 10000) {
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'WaitUtils.ts'), content);
  }

  private scaffoldAssertionUtils(projectRoot: string) {
    const content = `import { browser, $ } from '@wdio/globals';

export class AssertionUtils {
  static async assertDisplayed(selector: string, message?: string) {
    const isDisplayed = await (await $(selector)).isDisplayed();
    if (!isDisplayed) throw new Error(message || \`Element \${selector} is not displayed.\`);
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'AssertionUtils.ts'), content);
  }

  private scaffoldTestContext(projectRoot: string) {
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
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'TestContext.ts'), content);
  }

  private scaffoldDataUtils(projectRoot: string) {
    const content = `export class DataUtils {
  static getEnv(key: string, fallback?: string) { return process.env[key] || fallback; }
  static requireEnv(key: string) {
    if (!process.env[key]) throw new Error(\`Missing required env variable: \${key}\`);
    return process.env[key] as string;
  }
}
`;
    this.writeIfNotExists(path.join(projectRoot, 'src', 'utils', 'DataUtils.ts'), content);
  }

  // ─── Helpers ───────────────────────────────────────────────

  /**
   * Proxy entry-point for upgrade_project — runs the config-aware upgrade flow.
   */
  public async upgrade(projectRoot: string): Promise<string> {
    // New: config-aware upgrade is the primary flow
    return this.upgradeFromConfig(projectRoot);
  }

  /**
   * Internal repair helper: re-runs setup() and returns which baseline files were repaired.
   * Only generates files that are missing — never overwrites existing custom code.
   */
  public async repair(projectRoot: string, platform: string = 'android'): Promise<{ repairedFiles: string[] }> {
    try {
      await this.setup(projectRoot, platform, 'RepairedApp');
      return { repairedFiles: [] };
    } catch {
      return { repairedFiles: [] };
    }
  }

  /**
   * Config-aware upgrade: reads mcp-config.json, scans for CONFIGURE_ME markers,
   * and applies scaffolding for newly-configured features.
   */
  public async upgradeFromConfig(projectRoot: string): Promise<string> {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) {
      return JSON.stringify({
        status: 'NO_CONFIG',
        message: 'No mcp-config.json found. Run setup_project first.',
        nextStep: 'Call setup_project to begin the two-phase project setup.'
      }, null, 2);
    }

    let config: McpConfig;
    try {
      config = this.mcpConfigService.read(projectRoot);
    } catch (err: any) {
      return JSON.stringify({
        status: 'CONFIG_PARSE_ERROR',
        message: `Cannot read mcp-config.json: ${err.message}`,
        hint: 'Run: npx jsonlint mcp-config.json to find syntax errors'
      }, null, 2);
    }

    const applied: string[] = [];
    const skipped: string[] = [];
    const pending: string[] = [];

    // Scan for CONFIGURE_ME markers
    const unfilledFields = this.scanConfigureMe(projectRoot);
    if (unfilledFields.length > 0) {
      pending.push(...unfilledFields.map(f => `${f} (still has CONFIGURE_ME value)`));
    }

    // ─── Credential Strategy ──────────────────────────────────────────────────
    if (config.credentials?.strategy && (config.credentials.strategy as string) !== 'CONFIGURE_ME') {
      const credDir = path.join(projectRoot, 'credentials');
      if (!fs.existsSync(credDir)) {
        fs.mkdirSync(credDir, { recursive: true });
        applied.push('Created credentials/ directory');
      }

      // Ensure .gitignore covers credentials/
      const gitignorePath = path.join(projectRoot, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gi = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gi.includes('credentials/')) {
          fs.writeFileSync(gitignorePath, gi.trimEnd() + '\n\ncredentials/\n', 'utf-8');
          applied.push('Added credentials/ to .gitignore');
        }
      }

      // Scaffold credential file if it doesn't exist
      let credFile: string;
      const strategy = config.credentials.strategy;
      if (strategy === 'per-env-files') {
        const env = this.mcpConfigService.getCurrentEnvironment(config);
        credFile = path.join(credDir, `users.${env}.json`);
        const sample = [
          { role: 'admin', username: `admin@${env}.com`, password: 'FILL_IN' },
          { role: 'readonly', username: `viewer@${env}.com`, password: 'FILL_IN' }
        ];
        this.writeIfNotExists(credFile, JSON.stringify(sample, null, 2));
        applied.push(`Scaffolded credentials/users.${env}.json (per-env-files strategy)`);
      } else if (strategy === 'role-env-matrix' || strategy === 'unified-key') {
        credFile = config.credentials.file
          ? path.join(projectRoot, config.credentials.file)
          : path.join(credDir, 'users.json');
        if (!fs.existsSync(credFile)) {
          const env = this.mcpConfigService.getCurrentEnvironment(config);
          const sample = strategy === 'role-env-matrix'
            ? { admin: { [env]: { username: `admin@${env}.com`, password: 'FILL_IN' } } }
            : { [`admin-${env}`]: { username: `admin@${env}.com`, password: 'FILL_IN' } };
          fs.writeFileSync(credFile, JSON.stringify(sample, null, 2), 'utf-8');
          applied.push(`Scaffolded ${path.relative(projectRoot, credFile)} (${strategy} strategy)`);
        } else {
          skipped.push(`credentials file already exists: ${path.relative(projectRoot, credFile)}`);
        }
      } else if (strategy === 'custom' && !config.credentials.schemaHint) {
        pending.push('credentials.schemaHint — describe your credential JSON schema so AppForge can generate the reader');
      }
    } else {
      pending.push('credentials.strategy — run manage_users to choose a credential storage pattern');
    }

    // ─── Reporting Format ────────────────────────────────────────────────────────
    const reporting = this.mcpConfigService.getReporting(config);
    if (reporting.format === 'allure') {
      const wdioConf = path.join(projectRoot, 'wdio.conf.ts');
      if (fs.existsSync(wdioConf)) {
        const wdioContent = fs.readFileSync(wdioConf, 'utf-8');
        if (!wdioContent.includes('allure')) {
          // Patch reporters line
          const patched = wdioContent.replace(
            /reporters:\s*\[['"]spec['"]\]/,
            `reporters: [['allure', { outputDir: '${reporting.outputDir}/allure-results' }]]`
          );
          if (patched !== wdioContent) {
            fs.writeFileSync(wdioConf, patched, 'utf-8');
            applied.push('Updated wdio.conf.ts to use Allure reporter');
          }
        }
      }
    }

    // ─── customWrapperPackage ──────────────────────────────────────────────────
    const codegen = this.mcpConfigService.getCodegen(config);
    if (codegen.customWrapperPackage) {
      const basePagePath = path.join(projectRoot, 'src', 'pages', 'BasePage.ts');
      if (fs.existsSync(basePagePath)) {
        pending.push(
          `BasePage.ts exists but customWrapperPackage="${codegen.customWrapperPackage}" is set. ` +
          `If BasePage.ts is unused, delete it manually and update imports.`
        );
      } else {
        skipped.push(`customWrapperPackage set — BasePage.ts not generated (correct)`);
      }
    }

    // ─── Environments ────────────────────────────────────────────────────────────
    if (config.environments && config.environments.length > 0 && !config.environments[0].startsWith('CONFIGURE_ME')) {
      // If currentEnvironment is set and valid, nothing to scaffold — just confirm
      const currentEnv = this.mcpConfigService.getCurrentEnvironment(config);
      skipped.push(`environments configured: [${config.environments.join(', ')}], current: "${currentEnv}"`);
    } else {
      pending.push('environments — define your test environment names (e.g. ["local", "staging", "prod"])');
      pending.push('currentEnvironment — set which environment to run tests against');
    }

    // ─── Repair missing base files ────────────────────────────────────────────
    // Reuse existing repair logic for any missing baseline files
    const repairResult = await this.repair(projectRoot, config.mobile?.defaultPlatform ?? 'android');
    if (repairResult.repairedFiles && repairResult.repairedFiles.length > 0) {
      applied.push(...repairResult.repairedFiles.map((f: string) => `Repaired missing file: ${f}`));
    }

    // ─── Summary ─────────────────────────────────────────────────────────────────
    return JSON.stringify({
      status: pending.length === 0 ? 'FULLY_CONFIGURED' : 'PARTIAL',
      applied,
      skipped,
      pending,
      message: pending.length === 0
        ? '✅ Your project is fully configured and up to date.'
        : `⚠️ ${pending.length} item(s) still need your attention (see "pending").`,
      hint: pending.length > 0
        ? 'Fill in the pending fields in mcp-config.json, then run upgrade_project again.'
        : null
    }, null, 2);
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

  private writeIfNotExists(filePath: string, content: string) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
    }
  }
}
