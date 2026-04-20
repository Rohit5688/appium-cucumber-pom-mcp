import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../config/McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class ConfigTemplateManager {
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

    public scaffoldPackageJson(projectRoot: string, appName: string, platform: string) {
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

    public scaffoldTsConfig(projectRoot: string) {
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

    public scaffoldCucumberConfig(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldMcpConfig(projectRoot: string, platform: string) {
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

    public scaffoldGitignore(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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
}