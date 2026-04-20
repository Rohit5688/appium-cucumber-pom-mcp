import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../config/McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class TestScaffolder {
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

    public scaffoldSampleFeature(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldSampleSteps(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldHooks(projectRoot: string, screenshotOn: 'failure' | 'always' | 'never' = 'failure', reporting?: { outputDir?: string }, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldBasePage(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldLoginPage(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
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

    public scaffoldLocatorUtils(projectRoot: string, paths?: ReturnType<McpConfigService['getPaths']>) {
        const utilsPath = paths?.utilsRoot || 'src/utils';
        const tsPath = path.join(projectRoot, utilsPath, 'LocatorUtils.ts');
        const locatorsRoot = paths?.locatorsRoot || 'src/locators';
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
}