import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../config/McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class WdioConfigBuilder {
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

    public scaffoldWdioConfig(targetDir: string, configSourceDir: string, platform: string, timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number; appiumPort?: number }, reporting?: { format?: string; outputDir?: string }, paths?: ReturnType<McpConfigService['getPaths']>, config?: any) {
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

    public scaffoldWdioSharedConfig(projectRoot: string, timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number; elementWait?: number; appiumPort?: number }, reporting?: { format?: string; outputDir?: string }, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldWdioAndroidConfig(targetDir: string, configSourceDir: string, config?: any) {
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

    public scaffoldWdioIosConfig(targetDir: string, configSourceDir: string, config?: any) {
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
}