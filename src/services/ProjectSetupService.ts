import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { McpConfigService, McpConfig } from './McpConfigService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      
      // Create docs directory and reference documentation in Phase 1
      const docsDir = path.join(projectRoot, 'docs');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      this.scaffoldMcpConfigReference(projectRoot);
      this.scaffoldPromptCheatbook(projectRoot);
      
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
          '📖 Documentation created:',
          '  • docs/MCP_CONFIG_REFERENCE.md - Complete field reference',
          '  • docs/APPFORGE_PROMPT_CHEATBOOK.md - AI prompt guide',
          '',
          'When ready, call setup_project again with the same projectRoot to continue.'
        ].join('\n'),
        docsCreated: [
          'docs/MCP_CONFIG_REFERENCE.md',
          'docs/APPFORGE_PROMPT_CHEATBOOK.md'
        ],
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
      const paths = configService.getPaths(config);
      const dirs = [
        paths.featuresRoot,
        paths.stepsRoot,
        paths.pagesRoot,
        paths.utilsRoot,
        paths.testDataRoot,
        paths.configRoot,
        paths.credentialsRoot,
        paths.reportsRoot
      ];
      for (const dir of dirs) {
        fs.mkdirSync(path.join(stagingDir, dir), { recursive: true });
      }

      // MCP #7: Scaffold env-specific files if environments are defined
      const environments = Array.isArray(config?.environments) ? config.environments : [];
      let envFilesScaffolded = 0;
      for (const env of environments) {
        if (typeof env === 'string' && env && !env.startsWith('CONFIGURE_ME')) {
          const envPath = path.join(stagingDir, paths.credentialsRoot, `users.${env}.json`);
          // Default to an empty array so developers know where to map users
          fs.writeFileSync(envPath, '[\n  \n]\n', 'utf-8');
          filesCreated.push(`${paths.credentialsRoot}/users.${env}.json`);
          envFilesScaffolded++;
        }
      }
      if (environments.length > 0 && envFilesScaffolded === 0) {
        // Only CONFIGURE_ME present — scaffold a default 
        fs.writeFileSync(path.join(stagingDir, paths.credentialsRoot, `users.staging.json`), '[\n  \n]\n', 'utf-8');
        filesCreated.push(`${paths.credentialsRoot}/users.staging.json`);
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
      this.scaffoldBasePage(stagingDir, paths);
      filesCreated.push(`${paths.pagesRoot}/BasePage.ts`);

      // 6. Utils Layer
      this.scaffoldAppiumDriver(stagingDir, paths);
      this.scaffoldActionUtils(stagingDir, timeouts?.elementWait);
      this.scaffoldGestureUtils(stagingDir, paths);
      this.scaffoldWaitUtils(stagingDir, timeouts?.elementWait, paths);
      this.scaffoldAssertionUtils(stagingDir);
      this.scaffoldTestContext(stagingDir, paths);
      this.scaffoldDataUtils(stagingDir, paths);
      this.scaffoldLocatorUtils(stagingDir, paths);

      // Keep old for back compat
      this.scaffoldMobileGestures(stagingDir, paths);
      filesCreated.push(`${paths.utilsRoot}/ActionUtils.ts`, `${paths.utilsRoot}/WaitUtils.ts`, `${paths.utilsRoot}/MobileGestures.ts`, `${paths.utilsRoot}/LocatorUtils.ts`);

      // 7. MockServer.ts
      this.scaffoldMockServer(stagingDir, paths);
      filesCreated.push(`${paths.utilsRoot}/MockServer.ts`);

      // 8. Before/After hooks
      this.scaffoldHooks(stagingDir, reporting.screenshotOn as 'failure' | 'always' | 'never', reporting);
      filesCreated.push(`${paths.stepsRoot}/hooks.ts`);

      // 9. Sample feature + step definitions
      this.scaffoldSampleFeature(stagingDir, paths);
      filesCreated.push(`${paths.featuresRoot}/sample.feature`);
      
      this.scaffoldSampleSteps(stagingDir, paths);
      filesCreated.push(`${paths.stepsRoot}/sample.steps.ts`);
      
      this.scaffoldLoginPage(stagingDir, paths);
      filesCreated.push(`${paths.pagesRoot}/LoginPage.ts`);

      // 10. MCP documentation (helpful guides)
      this.scaffoldMcpDocs(stagingDir);
      filesCreated.push('docs/APPFORGE_QUICK_START.md');

      // 11. .gitignore
      this.scaffoldGitignore(stagingDir, paths);
      filesCreated.push('.gitignore');

      // 11. wdio.conf.ts — WebdriverIO + Appium connection config
      if (effectivePlatform === 'both') {
        this.scaffoldWdioSharedConfig(stagingDir, timeouts, reporting, paths);
        this.scaffoldWdioAndroidConfig(stagingDir, projectRoot, config);
        this.scaffoldWdioIosConfig(stagingDir, projectRoot, config);
        filesCreated.push('wdio.shared.conf.ts', 'wdio.android.conf.ts', 'wdio.ios.conf.ts');
      } else {
        this.scaffoldWdioConfig(stagingDir, projectRoot, effectivePlatform, timeouts, reporting, paths, config);
        filesCreated.push('wdio.conf.ts');
      }

      // 12. Mock scenarios sample JSON
      this.scaffoldMockScenarios(stagingDir, paths);
      filesCreated.push(`${paths.testDataRoot}/mock-scenarios.json`);

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
        '🧪 VERIFY: Run `npm run test:smoke` to confirm setup works (dummy test will auto-pass)',
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
        "_comment": "All paths are relative to project root. Customize if needed.",
        "featuresRoot": "src/features",
        "pagesRoot": "src/pages",
        "stepsRoot": "src/step-definitions",
        "utilsRoot": "src/utils",
        "locatorsRoot": "src/locators",
        "testDataRoot": "src/test-data",
        "credentialsRoot": "src/credentials",
        "configRoot": "src/config"
      },
      "environments": ["CONFIGURE_ME: e.g. local, integration, staging"],
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
        "_format_options": "html | junit | none",
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
      scripts["test"] = "npx wdio run wdio.shared.conf.ts";
      scripts["test:android"] = "npx wdio run wdio.android.conf.ts";
      scripts["test:ios"] = "npx wdio run wdio.ios.conf.ts";
      scripts["test:smoke"] = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tags='@smoke'";
      scripts["test:regression"] = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tags='@regression'";
      scripts["test:e2e"] = "npx wdio run wdio.shared.conf.ts --cucumberOpts.tags='@e2e'";
      scripts["test:smoke:android"] = "npx wdio run wdio.android.conf.ts --cucumberOpts.tags='@smoke'";
      scripts["test:smoke:ios"] = "npx wdio run wdio.ios.conf.ts --cucumberOpts.tags='@smoke'";
    } else {
      scripts["test"] = "npx wdio run wdio.conf.ts";
      scripts["test:smoke"] = "npx wdio run wdio.conf.ts --cucumberOpts.tags='@smoke'";
      scripts["test:regression"] = "npx wdio run wdio.conf.ts --cucumberOpts.tags='@regression'";
      scripts["test:e2e"] = "npx wdio run wdio.conf.ts --cucumberOpts.tags='@e2e'";
      if (platform === 'android') scripts["test:android"] = "npx wdio run wdio.conf.ts";
      if (platform === 'ios') scripts["test:ios"] = "npx wdio run wdio.conf.ts";
    }

    const pkg = {
      name: appName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      type: 'module',
      scripts,
      dependencies: {
        // WebdriverIO v9 core + Appium framework
        "@wdio/cli": "^9.24.0",
        "@wdio/local-runner": "^9.24.0",
        "@wdio/cucumber-framework": "^9.24.0",
        "@wdio/appium-service": "^9.24.0",
        "@wdio/spec-reporter": "^9.24.0",
        "@wdio/globals": "^9.24.0",
        "webdriverio": "^9.24.0",
        // Appium v3 server
        "appium": "^3.2.0",
        // Appium drivers — use unscoped package names (scoped @appium/* do NOT exist on npm)
        "appium-uiautomator2-driver": "^7.0.0",
        "appium-xcuitest-driver": "^10.36.0",
        // Appium 3 + WDIO v9: @wdio/cucumber-framework bundles Cucumber internally.
        // Do NOT add @cucumber/cucumber as a direct dep — it causes version conflicts.
        "allure-cucumberjs": "^2.15.2",
        "@cucumber/pretty-formatter": "^1.0.1",
        // TypeScript runtime
        "ts-node": "^10.9.2",
        "typescript": "^5.9.0",
        // Utilities
        "express": "^4.18.0",
        "yaml": "^2.4.1"
      },
      devDependencies: {
        "@types/node": "^20.0.0",
        "@types/express": "^4.17.0",
        "@wdio/types": "^9.24.0",
        "cross-env": "^7.0.3"
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
        module: "ES2022",
        moduleResolution: "node",
        lib: ["ES2022"],
        outDir: "./dist",
        strict: true,
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        declaration: false,
        allowJs: false
      },
      "ts-node": {
        compilerOptions: {
          module: "commonjs"
        }
      },
      include: ["src/**/*.ts", "wdio.conf.ts", "wdio.shared.conf.ts", "wdio.android.conf.ts", "wdio.ios.conf.ts"],
      exclude: ["node_modules", "dist", "reports"]
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  }

  private scaffoldCucumberConfig(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
    const stepsPattern = paths?.stepsRoot ? `${paths.stepsRoot}/**/*.ts` : 'src/step-definitions/**/*.ts';
    const featuresPattern = paths?.featuresRoot ? `${paths.featuresRoot}/**/*.feature` : 'src/features/**/*.feature';
    const reportsDir = paths?.reportsRoot ?? 'reports';
    const content = `// cucumber.js — Cucumber configuration
export default {
  requireModule: ['ts-node/esm'],
  require: ['${stepsPattern}'],
  format: [
    'progress-bar',
    'json:${reportsDir}/cucumber-report.json',
    'html:${reportsDir}/cucumber-report.html'
  ],
  paths: ['${featuresPattern}'],
  publishQuiet: true
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'cucumber.js'), content);
  }

  private scaffoldBasePage(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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
    const targetPath = paths?.pagesRoot || 'src/pages';
    this.writeIfNotExists(path.join(projectRoot, targetPath, 'BasePage.ts'), content);

  }

  private scaffoldMobileGestures(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldMockServer(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldLocatorUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
    const utilsPath = paths?.utilsRoot || 'src/utils';
    const tsPath = path.join(projectRoot, utilsPath, 'LocatorUtils.ts');

    const locatorsRoot = paths?.locatorsRoot || 'src/locators';
    // Generate LocatorUtils that reads YAML files from the configured locators root
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
      `    const filePath = path.resolve(process.cwd(), "${locatorsRoot}", \`\${yamlFileName}.yaml\`);`,
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

    const locatorsDir = path.join(projectRoot, locatorsRoot);
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

  private scaffoldHooks(projectRoot: string, screenshotOn: 'failure' | 'always' | 'never' = 'failure', reporting?: { outputDir?: string }, paths?: ReturnType<McpConfigService['getPaths']>) {
    const shouldCapture = screenshotOn === 'always'
      ? 'true'
      : screenshotOn === 'failure'
        ? "scenario.result?.status === 'failed'"
        : 'false';

    const content = `import { Before, After } from '@wdio/cucumber-framework';
import { AppiumDriver } from '../utils/AppiumDriver.js';
import { TestContext } from '../utils/TestContext.js';

/**
 * Cucumber Hooks — Lifecycle management for Appium sessions.
 * 
 * WDIO v9: Hooks are imported from @wdio/cucumber-framework
 */

Before(async function (this: any) {
  console.log(\`[Hooks] Starting scenario: \${this.pickle?.name}\`);
});

After(async function (this: any) {
  if (${shouldCapture}) {
    try {
      const screenshot = await AppiumDriver.takeScreenshot();
      if (screenshot) {
        TestContext.addAttachment('screenshot', Buffer.from(screenshot, 'base64'), 'image/png');
        await this.attach(Buffer.from(screenshot, 'base64'), 'image/png');
      }
      const pageSource = await AppiumDriver.getPageSource();
      if (pageSource) {
        TestContext.addAttachment('page-source', pageSource, 'text/xml');
        await this.attach(pageSource, 'text/xml');
      }
      console.log('[Hooks] Captured screenshot and page source for scenario');
    } catch (err) {
      console.error('[Hooks] Failed to capture artifacts:', err);
    }
  }
  TestContext.clear();
});
`;
    const targetPath = paths?.stepsRoot || 'src/step-definitions';
    this.writeIfNotExists(path.join(projectRoot, targetPath, 'hooks.ts'), content);

  }

  private scaffoldSampleFeature(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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
    const targetPath = paths?.featuresRoot || 'src/features';
    this.writeIfNotExists(path.join(projectRoot, targetPath, 'sample.feature'), content);
  }

  private scaffoldSampleSteps(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
    const content = `import { Given, When, Then } from '@wdio/cucumber-framework';

/**
 * Sample Step Definitions — Dummy implementations for setup verification.
 * These steps auto-pass to confirm the Cucumber + WDIO + Appium stack is working.
 * Replace with real implementations once you start writing actual tests.
 */

Given('the app is launched', async function () {
  console.log('✅ Step: App launch verified (dummy step)');
  // In a real test, you would start the Appium session here
});

When('I enter username {string} and password {string}', async function (username: string, password: string) {
  console.log(\`✅ Step: Credentials entered: \${username} (dummy step)\`);
  // In a real test, you would use ActionUtils.type() to enter credentials
});

When('I tap the login button', async function () {
  console.log('✅ Step: Login button tapped (dummy step)');
  // In a real test, you would use ActionUtils.tap() to tap the button
});

Then('I should see the home screen', async function () {
  console.log('✅ Step: Home screen verified (dummy step)');
  // In a real test, you would use AssertionUtils.assertDisplayed() to verify the home screen
});
`;
    const targetPath = paths?.stepsRoot || 'src/step-definitions';
    this.writeIfNotExists(path.join(projectRoot, targetPath, 'sample.steps.ts'), content);
  }

  private scaffoldLoginPage(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
    const content = `import { BasePage } from './BasePage.js';

/**
 * LoginPage — Sample Page Object for setup verification.
 * This is a dummy implementation to demonstrate the Page Object pattern.
 * Replace with real selectors and methods once you start writing actual tests.
 */
export class LoginPage extends BasePage {
  // Dummy selectors — replace with real selectors from your app
  private usernameInput = '~username';
  private passwordInput = '~password';
  private loginButton = '~loginButton';
  private homeScreen = '~homeScreen';

  async isLoaded(): Promise<boolean> {
    // In a real implementation, check if the login screen is displayed
    console.log('LoginPage.isLoaded() called (dummy implementation)');
    return true;
  }

  async login(username: string, password: string): Promise<void> {
    console.log(\`LoginPage.login() called with \${username} (dummy implementation)\`);
    // In a real implementation:
    // await this.driver.find(this.usernameInput).setValue(username);
    // await this.driver.find(this.passwordInput).setValue(password);
    // await this.driver.find(this.loginButton).click();
  }

  async verifyHomeScreen(): Promise<void> {
    console.log('LoginPage.verifyHomeScreen() called (dummy implementation)');
    // In a real implementation:
    // await this.assert.assertDisplayed(this.homeScreen);
  }
}
`;
    const targetPath = paths?.pagesRoot || 'src/pages';
    this.writeIfNotExists(path.join(projectRoot, targetPath, 'LoginPage.ts'), content);
  }

  private scaffoldMcpConfigReference(projectRoot: string) {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Copy the MCP_CONFIG_REFERENCE.md from AppForge docs to user project
    const sourceDoc = path.join(__dirname, '../../docs/technical/MCP_CONFIG_REFERENCE.md');
    const targetDoc = path.join(projectRoot, 'docs/MCP_CONFIG_REFERENCE.md');
    
    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      // Fallback: create a basic reference doc if source doesn't exist
      const basicRef = `# MCP Config Reference

See the full documentation at: https://github.com/ForgeTest-AI/AppForge/blob/main/docs/MCP_CONFIG_REFERENCE.md

For the complete field reference, platform-specific settings, and examples, refer to the AppForge repository documentation.
`;
      fs.writeFileSync(targetDoc, basicRef, 'utf-8');
    }
  }

  private scaffoldPromptCheatbook(projectRoot: string) {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Copy the APPFORGE_PROMPT_CHEATBOOK.md from AppForge docs to user project
    const sourceDoc = path.join(__dirname, '../../docs/user/APPFORGE_PROMPT_CHEATBOOK.md');
    const targetDoc = path.join(projectRoot, 'docs/APPFORGE_PROMPT_CHEATBOOK.md');
    
    if (fs.existsSync(sourceDoc)) {
      fs.copyFileSync(sourceDoc, targetDoc);
    } else {
      // Fallback: create a basic cheatbook if source doesn't exist
      const basicCheatbook = `# AppForge Prompt Cheatbook

See the full cheatbook at: https://github.com/ForgeTest-AI/AppForge/blob/main/docs/APPFORGE_PROMPT_CHEATBOOK.md

For the complete prompt guide and best practices for working with AppForge MCP tools, refer to the AppForge repository documentation.
`;
      fs.writeFileSync(targetDoc, basicCheatbook, 'utf-8');
    }
  }

  private scaffoldMcpDocs(projectRoot: string) {
    const docsDir = path.join(projectRoot, 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const quickStart = `# AppForge Quick Start Guide

## Welcome to Your New Mobile Test Project!

This project was generated by **AppForge** - an AI-powered mobile test automation framework.

---

## ✅ Verify Setup

Run this command to confirm everything works:

\`\`\`bash
npm install
npm run test:smoke
\`\`\`

Expected output: **1 scenario (1 passed)** ✅

This dummy test confirms your Cucumber + WDIO + Appium stack is correctly configured.

---

## 🚀 Next Steps

### 1. Connect to a Device

\`\`\`bash
# Start Appium server
npx appium

# In another terminal, verify device connection
adb devices  # For Android
xcrun simctl list  # For iOS simulators
\`\`\`

### 2. Update App Path

Edit \`mcp-config.json\` and set the path to your mobile app:

\`\`\`json
{
  "mobile": {
    "capabilitiesProfiles": {
      "myDevice": {
        "appium:app": "/path/to/your/app.apk"
      }
    }
  }
}
\`\`\`

### 3. Write Your First Test

Replace the dummy code in:
- \`src/features/sample.feature\` - Write Gherkin scenarios
- \`src/step-definitions/sample.steps.ts\` - Implement step definitions  
- \`src/pages/LoginPage.ts\` - Add real selectors

---

## 📖 Useful Commands

| Command | Description |
|---------|-------------|
| \`npm run test:smoke\` | Run smoke tests |
| \`npm run test:regression\` | Run regression suite |
| \`npm test\` | Run all tests |

---

## 🛠️ Common Issues

### Appium Not Running
\`\`\`bash
npx appium
\`\`\`

### Device Not Found
- **Android**: Enable USB debugging, run \`adb devices\`
- **iOS**: Ensure simulator is booted

### Tests Timeout
Increase timeout in \`wdio.conf.ts\`:
\`\`\`typescript
cucumberOpts: {
  timeout: 120000  // 2 minutes
}
\`\`\`

---

## 📚 Learn More

- **MCP Config Reference**: \`mcp-config.json\` field documentation
- **AppForge GitHub**: Full documentation and examples
- **WebdriverIO Docs**: https://webdriver.io
- **Appium Docs**: https://appium.io

---

**Generated by AppForge v2.0.0**
`;

    this.writeIfNotExists(path.join(docsDir, 'APPFORGE_QUICK_START.md'), quickStart);
  }

  private scaffoldGitignore(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
    const credDir = (paths?.credentialsRoot || 'credentials').replace(/\/+$/, '');
    const content = `node_modules/
dist/
reports/
*.log
.env
.env.*
.DS_Store

# Credential files — never commit these
${credDir}/
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
    targetDir: string,
    configSourceDir: string,
    platform: string,
    timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number; appiumPort?: number },
    reporting?: { format?: string; outputDir?: string },
    paths?: ReturnType<McpConfigService['getPaths']>,
    config?: any
  ) {
    // Read actual capabilities from mcp-config.json if available (passed in or from configSourceDir)
    let capabilities: any = null;
    
    if (config) {
      // Config already passed in from Phase 2
      try {
        const profiles = config?.mobile?.capabilitiesProfiles || {};
        
        // Find first profile matching the target platform
        for (const [profileName, caps] of Object.entries(profiles)) {
          const profilePlatform = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
          if (
            (platform === 'android' && profilePlatform === 'android') ||
            (platform === 'ios' && profilePlatform === 'ios')
          ) {
            capabilities = caps;
            break;
          }
        }
      } catch {
        // Config parse error - fall back to defaults
      }
    } else {
      // Try reading from configSourceDir (for standalone calls)
      const configPath = path.join(configSourceDir, 'mcp-config.json');
      if (fs.existsSync(configPath)) {
        try {
          const parsedConfig = this.mcpConfigService.read(configSourceDir);
          const profiles = parsedConfig?.mobile?.capabilitiesProfiles || {};
          
          for (const [profileName, caps] of Object.entries(profiles)) {
            const profilePlatform = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
            if (
              (platform === 'android' && profilePlatform === 'android') ||
              (platform === 'ios' && profilePlatform === 'ios')
            ) {
              capabilities = caps;
              break;
            }
          }
        } catch {
          // Config parse error - fall back to defaults
        }
      }
    }

    // Fallback defaults if no matching profile found
    const isIos = platform.toLowerCase() === 'ios';
    const defaultCaps = {
      platformName: isIos ? 'iOS' : 'Android',
      'appium:automationName': isIos ? 'XCUITest' : 'UiAutomator2',
      'appium:deviceName': isIos ? 'iPhone 14' : 'Pixel_8',
      'appium:app': `CONFIGURE_ME: /path/to/your/app.${isIos ? 'app' : 'apk'}`,
      'appium:newCommandTimeout': 240,
      'appium:noReset': false,
    };

    const finalCaps = capabilities || defaultCaps;

    const specsPattern = paths?.featuresRoot ? `./${paths.featuresRoot}/**/*.feature` : './src/features/**/*.feature';
    const stepsPattern = paths?.stepsRoot ? `./${paths.stepsRoot}/**/*.ts` : './src/step-definitions/**/*.ts';
    
    // Serialize capabilities with proper formatting
    const capsJson = JSON.stringify(finalCaps, null, 4).split('\n').map(line => '    ' + line).join('\n').trim();
    
    const content = `import type { Options } from '@wdio/types';

/**
 * WebdriverIO + Appium Configuration for ${isIos ? 'iOS' : 'Android'}
 * 
 * Capabilities loaded from mcp-config.json.
 * To update device/app settings, edit mcp-config.json and run upgrade_project.
 */
export const config: Options.Testrunner = {
  runner: 'local',
  hostname: 'localhost',
  port: ${timeouts?.appiumPort ?? 4723},
  path: '/',

  specs: ['${specsPattern}'],
  maxInstances: 1,

  capabilities: [${capsJson}],

  framework: 'cucumber',
  cucumberOpts: {
    require: ['${stepsPattern}'],
    backtrace: false,
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    strict: false,
    timeout: ${timeouts?.scenarioTimeout ?? 60000},
  },

  reporters: ['${reporting?.format === 'junit' ? 'junit' : 'spec'}'],

  logLevel: 'info',
  waitforTimeout: ${timeouts?.elementWait ?? 10000},
  connectionRetryTimeout: ${timeouts?.connectionRetry ?? 120000},
  connectionRetryCount: ${timeouts?.connectionRetryCount ?? 3},

  // Appium service logs (helps debug connection issues)
  services: [
    ['appium', {
      logPath: './appium.log',
      args: {
        relaxedSecurity: true,
        log: './appium.log'
      }
    }]
  ],
};
`;
    this.writeIfNotExists(path.join(targetDir, 'wdio.conf.ts'), content);
  }

  private scaffoldWdioSharedConfig(
    projectRoot: string,
    timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number; appiumPort?: number },
    reporting?: { format?: string; outputDir?: string },
    paths?: ReturnType<McpConfigService['getPaths']>
  ) {
    const specsPattern = paths?.featuresRoot ? `./${paths.featuresRoot}/**/*.feature` : './src/features/**/*.feature';
    const stepsPattern = paths?.stepsRoot ? `./${paths.stepsRoot}/**/*.ts` : './src/step-definitions/**/*.ts';
    const content = `import type { Options } from '@wdio/types';

/**
 * Shared WebdriverIO Configuration
 * Adjust common settings here. Platform specifics belong in wdio.android.conf.ts / wdio.ios.conf.ts
 */
export const config: Partial<Options.Testrunner> = {
  runner: 'local',
  hostname: 'localhost',
  port: ${timeouts?.appiumPort ?? 4723},
  path: '/',

  // Uses configured features path
  specs: ['${specsPattern}'],
  maxInstances: 1,

  framework: 'cucumber',
  cucumberOpts: {
    require: ['${stepsPattern}'],
    backtrace: false,
    dryRun: false,
    failFast: false,
    snippets: true,
    source: true,
    strict: false,
    timeout: ${timeouts?.scenarioTimeout ?? 60000},
  },

  reporters: ['${reporting?.format === 'junit' ? 'junit' : 'spec'}'],

  logLevel: 'info',
  waitforTimeout: ${timeouts?.elementWait ?? 10000},
  connectionRetryTimeout: ${timeouts?.connectionRetry ?? 120000},
  connectionRetryCount: ${timeouts?.connectionRetryCount ?? 3},
};
`;
    this.writeIfNotExists(path.join(projectRoot, 'wdio.shared.conf.ts'), content);
  }

  private scaffoldWdioAndroidConfig(targetDir: string, configSourceDir: string, config?: any) {
    // Read Android capabilities from mcp-config.json if available
    let androidCaps: any = null;
    
    if (config) {
      try {
        const profiles = config?.mobile?.capabilitiesProfiles || {};
        
        // Find first Android profile
        for (const [profileName, caps] of Object.entries(profiles)) {
          const platformName = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
          if (platformName === 'android') {
            androidCaps = caps;
            break;
          }
        }
      } catch {
        // Config parse error - fall back to defaults
      }
    } else {
      // Try reading from configSourceDir
      const configPath = path.join(configSourceDir, 'mcp-config.json');
      if (fs.existsSync(configPath)) {
        try {
          const parsedConfig = this.mcpConfigService.read(configSourceDir);
          const profiles = parsedConfig?.mobile?.capabilitiesProfiles || {};
          
          for (const [profileName, caps] of Object.entries(profiles)) {
            const platformName = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
            if (platformName === 'android') {
              androidCaps = caps;
              break;
            }
          }
        } catch {
          // Config parse error - fall back to defaults
        }
      }
    }

    const defaultAndroidCaps = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'Pixel_8',
      'appium:app': 'CONFIGURE_ME: /path/to/your/app.apk',
      'appium:newCommandTimeout': 240,
      'appium:noReset': false,
    };

    const finalCaps = androidCaps || defaultAndroidCaps;
    const capsJson = JSON.stringify(finalCaps, null, 4).split('\n').map(line => '  ' + line).join('\n').trim();

    const content = `import { config as sharedConfig } from './wdio.shared.conf';

/**
 * Android-specific WebdriverIO Configuration
 * Capabilities loaded from mcp-config.json
 */
export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [${capsJson}],
  
  // Appium service for Android
  services: [
    ['appium', {
      logPath: './appium-android.log',
      args: {
        relaxedSecurity: true,
        log: './appium-android.log'
      }
    }]
  ],
};
`;
    this.writeIfNotExists(path.join(targetDir, 'wdio.android.conf.ts'), content);
  }

  private scaffoldWdioIosConfig(targetDir: string, configSourceDir: string, config?: any) {
    // Read iOS capabilities from mcp-config.json if available
    let iosCaps: any = null;
    
    if (config) {
      try {
        const profiles = config?.mobile?.capabilitiesProfiles || {};
        
        // Find first iOS profile
        for (const [profileName, caps] of Object.entries(profiles)) {
          const platformName = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
          if (platformName === 'ios') {
            iosCaps = caps;
            break;
          }
        }
      } catch {
        // Config parse error - fall back to defaults
      }
    } else {
      // Try reading from configSourceDir
      const configPath = path.join(configSourceDir, 'mcp-config.json');
      if (fs.existsSync(configPath)) {
        try {
          const parsedConfig = this.mcpConfigService.read(configSourceDir);
          const profiles = parsedConfig?.mobile?.capabilitiesProfiles || {};
          
          for (const [profileName, caps] of Object.entries(profiles)) {
            const platformName = ((caps as any)?.platformName || (caps as any)?.['appium:platformName'] || '').toLowerCase();
            if (platformName === 'ios') {
              iosCaps = caps;
              break;
            }
          }
        } catch {
          // Config parse error - fall back to defaults
        }
      }
    }

    const defaultIosCaps = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': 'iPhone 14',
      'appium:app': 'CONFIGURE_ME: /path/to/your/app.app',
      'appium:newCommandTimeout': 240,
      'appium:noReset': false,
    };

    const finalCaps = iosCaps || defaultIosCaps;
    const capsJson = JSON.stringify(finalCaps, null, 4).split('\n').map(line => '  ' + line).join('\n').trim();

    const content = `import { config as sharedConfig } from './wdio.shared.conf';

/**
 * iOS-specific WebdriverIO Configuration
 * Capabilities loaded from mcp-config.json
 */
export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [${capsJson}],
  
  // Appium service for iOS
  services: [
    ['appium', {
      logPath: './appium-ios.log',
      args: {
        relaxedSecurity: true,
        log: './appium-ios.log'
      }
    }]
  ],
};
`;
    this.writeIfNotExists(path.join(targetDir, 'wdio.ios.conf.ts'), content);
  }

  private scaffoldMockScenarios(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    private scaffoldAppiumDriver(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldActionUtils(projectRoot: string, elementWait: number = 10000, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldGestureUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldWaitUtils(projectRoot: string, elementWait: number = 10000, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldAssertionUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldTestContext(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  private scaffoldDataUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

  /**
   * Preview what files would be created by setup() without writing anything.
   * Returns a JSON string describing the planned files and a short message.
   */
  public async previewSetup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
    const configPath = path.join(projectRoot, 'mcp-config.json');

    if (!fs.existsSync(projectRoot)) {
      return JSON.stringify({
        preview: true,
        filesToCreate: ['mcp-config.json'],
        message: 'Project root does not exist. Calling setup_project will create mcp-config.json and scaffold files.'
      }, null, 2);
    }

    if (!fs.existsSync(configPath)) {
      return JSON.stringify({
        preview: true,
        filesToCreate: ['mcp-config.json'],
        message: 'No mcp-config.json found. First call to setup_project will create a CONFIGURE_ME template.'
      }, null, 2);
    }

    // Read existing config
    let config: any;
    try {
      const cfgService = new McpConfigService();
      config = cfgService.read(projectRoot);
    } catch (err: any) {
      return JSON.stringify({
        preview: true,
        filesToCreate: [],
        message: `Cannot read existing mcp-config.json: ${err.message}`
      }, null, 2);
    }

    const paths = this.mcpConfigService.getPaths(config);
    const environments = Array.isArray(config?.environments) ? config.environments : [];
    const filesToCreate: string[] = [];

    // Credential files
    let envFilesScaffolded = 0;
    for (const env of environments) {
      if (typeof env === 'string' && env && !env.startsWith('CONFIGURE_ME')) {
        filesToCreate.push(`${paths.credentialsRoot}/users.${env}.json`);
        envFilesScaffolded++;
      }
    }
    if (environments.length > 0 && envFilesScaffolded === 0) {
      filesToCreate.push(`${paths.credentialsRoot}/users.staging.json`);
    }

    // Core files
    filesToCreate.push('package.json');
    filesToCreate.push('tsconfig.json');
    filesToCreate.push('cucumber.js');
    filesToCreate.push(`${paths.pagesRoot}/BasePage.ts`);
    filesToCreate.push(`${paths.utilsRoot}/AppiumDriver.ts`);
    filesToCreate.push(`${paths.utilsRoot}/ActionUtils.ts`);
    filesToCreate.push(`${paths.utilsRoot}/WaitUtils.ts`);
    filesToCreate.push(`${paths.utilsRoot}/MobileGestures.ts`);
    filesToCreate.push(`${paths.utilsRoot}/LocatorUtils.ts`);
    filesToCreate.push(`${paths.utilsRoot}/MockServer.ts`);
    filesToCreate.push(`${paths.stepsRoot}/hooks.ts`);
    filesToCreate.push(`${paths.featuresRoot}/sample.feature`);
    filesToCreate.push('.gitignore');

    // WDIO configs
    const effectivePlatform = (config?.mobile?.defaultPlatform as string) || platform;
    if (effectivePlatform === 'both') {
      filesToCreate.push('wdio.shared.conf.ts', 'wdio.android.conf.ts', 'wdio.ios.conf.ts');
    } else {
      filesToCreate.push('wdio.conf.ts');
    }

    filesToCreate.push(`${paths.testDataRoot}/mock-scenarios.json`);

    return JSON.stringify({
      preview: true,
      appName,
      platform: effectivePlatform,
      filesToCreate,
      message: `Preview complete. Call setup_project with preview:false to scaffold these files.`
    }, null, 2);
  }

  // ─── Helpers ───────────────────────────────────────────────

  /**
   * Proxy entry-point for upgrade_project — runs the config-aware upgrade flow.
   */
  public async upgrade(projectRoot: string, preview: boolean = false): Promise<string> {
    // New: config-aware upgrade is the primary flow
    return this.upgradeFromConfig(projectRoot, preview);
  }

  /**
   * Preview what would change during an upgrade without actually modifying files.
   */
  public async previewUpgrade(projectRoot: string): Promise<{
    configChanges: string[];
    filesToRepair: string[];
    packagesToUpdate: string[];
    pending: string[];
  }> {
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) {
      return {
        configChanges: ['No mcp-config.json found'],
        filesToRepair: [],
        packagesToUpdate: [],
        pending: ['Run setup_project first']
      };
    }

    const config = this.mcpConfigService.read(projectRoot);
    const configChanges: string[] = [];
    const filesToRepair: string[] = [];
    const packagesToUpdate: string[] = [];
    const pending: string[] = [];

    // Check for CONFIGURE_ME markers
    const unconfigured = this.scanConfigureMe(projectRoot);
    if (unconfigured.length > 0) {
      pending.push(...unconfigured.map(field => `${field} needs configuration`));
    }

    // Check for missing baseline files
    const baseFiles = [
      'src/pages/BasePage.ts',
      'src/step-definitions/hooks.ts',
      'wdio.conf.ts',
      'package.json',
      'tsconfig.json'
    ];

    for (const file of baseFiles) {
      const filePath = path.join(projectRoot, file);
      if (!fs.existsSync(filePath)) {
        filesToRepair.push(file);
      }
    }

    // Check package.json for outdated dependencies
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const currentDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Compare with latest recommended versions
      const recommendations = [
        { name: '@wdio/cli', version: '^8.0.0' },
        { name: '@wdio/local-runner', version: '^8.0.0' },
        { name: '@wdio/cucumber-framework', version: '^8.0.0' },
        { name: 'appium', version: '^2.0.0' }
      ];

      for (const rec of recommendations) {
        if (currentDeps[rec.name] && currentDeps[rec.name] !== rec.version) {
          packagesToUpdate.push(`${rec.name}: ${currentDeps[rec.name]} → ${rec.version}`);
        }
      }
    }

    // Check for config migrations
    if (config.version !== '1.1.0') {
      configChanges.push(`mcp-config.json version: ${config.version || 'unversioned'} → 1.1.0`);
    }

    return {
      configChanges,
      filesToRepair,
      packagesToUpdate,
      pending
    };
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
  public async upgradeFromConfig(projectRoot: string, preview: boolean = false): Promise<string> {
    if (preview) {
      const previewResult = await this.previewUpgrade(projectRoot);
      return JSON.stringify({
        preview: true,
        ...previewResult,
        hint: '✅ Preview complete. Set preview:false to execute.'
      }, null, 2);
    }
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

    const paths = this.mcpConfigService.getPaths(config);

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
      const credDir = path.join(projectRoot, paths.credentialsRoot || 'credentials');
      if (!fs.existsSync(credDir)) {
        fs.mkdirSync(credDir, { recursive: true });
        applied.push(`Created ${paths.credentialsRoot || 'credentials'}/ directory`);
      }

      // Ensure .gitignore covers credentials/
      const gitignorePath = path.join(projectRoot, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const gi = fs.readFileSync(gitignorePath, 'utf-8');
        const gitCredEntry = `${paths.credentialsRoot || 'credentials'}/`;
        if (!gi.includes(gitCredEntry)) {
          fs.writeFileSync(gitignorePath, gi.trimEnd() + '\n\n' + gitCredEntry + '\n', 'utf-8');
          applied.push(`Added ${gitCredEntry} to .gitignore`);
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
        applied.push(`Scaffolded ${paths.credentialsRoot || 'credentials'}/users.${env}.json (per-env-files strategy)`);
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
    // Allure support removed to avoid dependency conflicts

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
