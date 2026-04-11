import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { TestGenerationService } from '../services/TestGenerationService.js';
import { GeneratedCodeValidator } from '../services/GeneratedCodeValidator.js';
import { HybridPromptEngine } from '../services/HybridPromptEngine.js';
import type { McpConfig } from '../services/McpConfigService.js';
import type { CodebaseAnalysisResult } from '../services/CodebaseAnalyzerService.js';

describe('TestGenerationService — Issue #11 Fix Validation', () => {
  const service = new TestGenerationService();

  const mockConfig: McpConfig = {
    mobile: {
      defaultPlatform: 'android',
      capabilitiesProfiles: {}
    },
    paths: {
      featuresRoot: 'features',
      pagesRoot: 'pages',
      stepsRoot: 'step-definitions',
      utilsRoot: 'utils'
    },
    project: {
      language: 'typescript',
      testFramework: 'cucumber',
      client: 'webdriverio'
    }
  };

  const mockAnalysis: CodebaseAnalysisResult = {
    existingFeatures: [],
    existingStepDefinitions: [],
    existingPageObjects: [],
    existingUtils: [],
    conflicts: [],
    architecturePattern: 'pom',
    yamlLocatorFiles: [],
    detectedPaths: {
      featuresRoot: 'features',
      stepsRoot: 'step-definitions',
      pagesRoot: 'pages',
      utilsRoot: 'utils',
      locatorsRoot: 'locators'
    }
  };

  test('should generate a valid prompt string', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.strictEqual(typeof prompt, 'string');
    assert.ok(prompt.length > 0);
  });

  test('[ISSUE #11] prompt header should identify framework as Appium + WebdriverIO + @wdio/cucumber-framework', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('Appium + WebdriverIO + @wdio/cucumber-framework'),
      'Expected prompt to contain "Appium + WebdriverIO + @wdio/cucumber-framework"'
    );
  });

  test('[ISSUE #11] prompt must NOT contain the word "Playwright"', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      !prompt.includes('Playwright'),
      'FAILURE: Prompt contains "Playwright" — this violates Issue #11 fix. AppForge is Appium/WebdriverIO, not Playwright.'
    );
  });

  test('[ISSUE #11] prompt must include explicit constraint against Playwright imports', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('CRITICAL CONSTRAINT'),
      'Expected critical constraint warning'
    );
    assert.ok(
      prompt.includes('ONLY WebdriverIO'),
      'Expected emphasis on WebdriverIO-only usage'
    );
    assert.ok(
      prompt.includes('driver.$()'),
      'Expected mention of WebdriverIO selector syntax'
    );
    assert.ok(
      prompt.includes('Appium'),
      'Expected mention of Appium locator strategies'
    );
    assert.ok(
      prompt.includes('Do NOT import web testing libraries'),
      'Expected warning against other testing frameworks'
    );
  });

  test('[ISSUE #11] prompt must emphasize WebdriverIO and Appium usage', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(prompt.includes('WebdriverIO'), 'Expected WebdriverIO mention');
    assert.ok(prompt.includes('driver.$()'), 'Expected driver.$() pattern');
    assert.ok(prompt.includes('Appium'), 'Expected Appium mention');
  });

  test('[ISSUE #11] prompt must include critical constraint warning with emphasis marker', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );

    assert.ok(
      prompt.includes('⚠️ **CRITICAL CONSTRAINT**'),
      'Expected critical constraint warning with ⚠️ emoji'
    );
  });

  test('should handle optional parameters (testName, screenXml, screenshotBase64)', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis,
      'LoginTest',
      undefined,
      '<xml>test</xml>',
      'base64data'
    );

    assert.ok(prompt.includes('LoginTest'), 'Expected test name');
    assert.ok(prompt.includes('[XML] LIVE UI HIERARCHY'), 'Expected XML section');
    assert.ok(prompt.includes('[IMAGE] SCREENSHOT'), 'Expected screenshot section');
  });

  test('should include existing code reuse sections', async () => {
    const analysisWithCode: CodebaseAnalysisResult = {
      ...mockAnalysis,
      existingStepDefinitions: [
        {
          file: 'login.steps.ts',
          steps: [
            { type: 'Given', pattern: 'I open the login screen' },
            { type: 'When', pattern: 'I enter username {string}' }
          ]
        }
      ],
      existingPageObjects: [
        {
          path: 'pages/LoginPage.ts',
          className: 'LoginPage',
          publicMethods: ['enterUsername', 'enterPassword', 'tapLogin'],
          locators: []
        }
      ]
    };

    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'Test a feature',
      mockConfig,
      analysisWithCode
    );

    assert.ok(prompt.includes('Existing Step Definitions'));
    assert.ok(prompt.includes('Existing Page Objects'));
    assert.ok(prompt.includes('login.steps.ts'));
    assert.ok(prompt.includes('LoginPage.ts'));
  });

  test('should include learning prompt if provided', async () => {
    const learningPrompt = 'Always use accessibility-id selectors for buttons.';

    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in',
      mockConfig,
      mockAnalysis,
      undefined,
      learningPrompt
    );

    assert.ok(prompt.includes(learningPrompt));
  });

  test('should specify correct JSON output format with jsonPageObjects', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in',
      mockConfig,
      mockAnalysis
    );

    assert.ok(prompt.includes('"jsonPageObjects"'));
    assert.ok(prompt.includes('"reusePlan"'));
    assert.ok(prompt.includes('"filesToCreate"'));
  });

  // ─── Hybrid Prompt Engine Tests ───────────────────────────────────────────

  test('[HYBRID] prompt should include CoT reasoning scaffold', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );
    // FewShotLibrary.getCoTScaffold() emits 'MANDATORY REASONING PROTOCOL'
    assert.ok(
      prompt.includes('MANDATORY REASONING PROTOCOL'),
      `Expected CoT scaffold header in prompt. Got first 500 chars: ${prompt.substring(0, 500)}`
    );
    // Step 1 is labelled 'AUDIT REUSE' in the CoT scaffold
    assert.ok(
      prompt.includes('AUDIT REUSE'),
      'Expected AUDIT REUSE step in CoT scaffold'
    );
  });

  test('[HYBRID] prompt should include Gold Standard block when no champion', async () => {
    // mockAnalysis has no existingPageObjects → selectChampion returns null
    // HybridPromptEngine emits the 'GOLD STANDARD' fallback message
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );
    assert.ok(
      prompt.includes('GOLD STANDARD'),
      `Expected GOLD STANDARD block when no champion exists. Prompt snippet: ${prompt.substring(0, 800)}`
    );
  });

  test('[HYBRID] prompt should include architecture anti-pattern block', async () => {
    const prompt = await service.generateAppiumPrompt(
      '/test/project',
      'User logs in with valid credentials',
      mockConfig,
      mockAnalysis
    );
    assert.ok(
      prompt.includes('ANTI-PATTERN'),
      'Expected negative example ANTI-PATTERN block in prompt'
    );
  });
});

// ─── GeneratedCodeValidator Tests ────────────────────────────────────────────

describe('GeneratedCodeValidator — structural checks', () => {
  const validator = new GeneratedCodeValidator();

  const validPageObject = [
    `import { $ } from '@wdio/globals';`,
    `export class LoginPage {`,
    `  async login() { await ActionUtils.tap(this.loginBtn); }`,
    `}`,
  ].join('\n');

  const validStepDefs = [
    `import { Given, When, Then } from '@wdio/cucumber-framework';`,
    `Given('I am on the login screen', async () => { });`,
    `When('I enter valid credentials', async () => { });`,
    `Then('I should see the home screen', async () => { });`,
  ].join('\n');

  test('[VALIDATOR] should pass valid, well-formed code', () => {
    const result = validator.validate({
      stepDefinitions: validStepDefs,
      pageObject: validPageObject,
    });
    assert.ok(result.valid, `Expected valid code to pass. Issues: ${JSON.stringify(result.issues)}`);
    assert.ok(result.score >= 0.7, `Expected score >= 0.7, got ${result.score}`);
  });

  test('[VALIDATOR] should detect missing @wdio/cucumber-framework import', () => {
    // Neither @wdio/cucumber-framework nor @cucumber/cucumber present → MISSING_IMPORT
    const badSteps = `Given('user logs in', async () => { /* no import */ });`;
    const result = validator.validate({ stepDefinitions: badSteps, pageObject: '' });
    assert.ok(!result.valid, 'Expected invalid result for missing cucumber import');
    const issue = result.issues.find(i => i.code === 'MISSING_IMPORT');
    assert.ok(issue, 'Expected MISSING_IMPORT issue code');
  });

  test('[VALIDATOR] should reject direct @cucumber/cucumber import (Appium 3 violation)', () => {
    // Old import style — must now be rejected with WRONG_IMPORT_DIRECT
    const oldStyleSteps = [
      `import { Given } from '@cucumber/cucumber';`,
      `Given('user logs in', async () => {});`,
    ].join('\n');
    const result = validator.validate({ stepDefinitions: oldStyleSteps, pageObject: '' });
    assert.ok(!result.valid, 'Expected invalid result for direct @cucumber/cucumber import');
    const issue = result.issues.find(i => i.code === 'WRONG_IMPORT_DIRECT');
    assert.ok(issue, 'Expected WRONG_IMPORT_DIRECT issue code for bare @cucumber/cucumber import');
  });

  test('[VALIDATOR] should detect unbalanced braces', () => {
    const truncatedCode = `export class BrokenPage {\n  async login() {\n    await ActionUtils.tap(this.btn);\n  // MISSING CLOSING BRACE`;
    const result = validator.validate({ stepDefinitions: '', pageObject: truncatedCode });
    assert.ok(!result.valid, 'Expected invalid result for unbalanced braces');
    const issue = result.issues.find(i => i.code === 'UNBALANCED_BRACES');
    assert.ok(issue, 'Expected UNBALANCED_BRACES issue code');
  });

  test('[VALIDATOR] should detect Playwright imports and reject them', () => {
    const playwrightCode = `import { test } from '@playwright/test';\nGiven('x', async () => {});`;
    const result = validator.validate({ stepDefinitions: playwrightCode, pageObject: '' });
    const issue = result.issues.find(i => i.code === 'WRONG_FRAMEWORK');
    assert.ok(issue, 'Expected WRONG_FRAMEWORK issue for Playwright import');
  });

  test('[VALIDATOR] should detect step file with no Given/When/Then calls', () => {
    const emptySteps = `import { Given } from '@wdio/cucumber-framework';\n// no actual step calls`;
    const result = validator.validate({ stepDefinitions: emptySteps, pageObject: '' });
    const issue = result.issues.find(i => i.code === 'NO_STEP_DEFINITIONS');
    assert.ok(issue, 'Expected NO_STEP_DEFINITIONS issue');
  });

  test('[VALIDATOR] should flag await without async in page object', () => {
    const badPO = `export class Foo {\n  login() { await ActionUtils.tap(this.btn); }\n}`;
    const result = validator.validate({ stepDefinitions: '', pageObject: badPO });
    const issue = result.issues.find(i => i.code === 'AWAIT_WITHOUT_ASYNC');
    assert.ok(issue, 'Expected AWAIT_WITHOUT_ASYNC issue');
  });

  test('[VALIDATOR] method resolution should suggest close match for typo', () => {
    const steps = [
      `import { Given } from '@wdio/cucumber-framework';`,
      `Given('x', async () => { await loginPage.entterPassword(); });`,
    ].join('\n');
    const po = `export class LoginPage {\n  async enterPassword() {}\n}`;
    const result = validator.validate({ stepDefinitions: steps, pageObject: po });
    // entterPassword → suggestion should be enterPassword (1-2 edits)
    const unresolved = result.methodResolution?.unresolved ?? [];
    const suggestion = unresolved.find(u => u.method === 'entterPassword')?.suggestion;
    assert.strictEqual(suggestion, 'enterPassword', 'Expected suggestion "enterPassword" for typo "entterPassword"');
  });
});

// ─── HybridPromptEngine Champion Quality Scoring Tests ───────────────────────

describe('HybridPromptEngine — quality-weighted champion selection', () => {
  const engine = new HybridPromptEngine();

  test('[CHAMPION] balanced 8-method file should beat bloated 30-method file', () => {
    const bloatedPO = {
      path: 'pages/OldLoginPage.ts',
      className: 'OldLoginPage',
      publicMethods: Array.from({ length: 30 }, (_, i) => `method${i}`),
      locators: Array.from({ length: 20 }, (_, i) => ({ name: `loc${i}`, strategy: 'xpath', selector: `//loc${i}` })),
    };
    const balancedPO = {
      path: 'pages/NewLoginPage.ts',
      className: 'NewLoginPage',
      publicMethods: ['login', 'logout', 'enterUsername', 'enterPassword', 'tapSubmit', 'waitForHome', 'verifyTitle', 'getErrorMessage'],
      locators: [
        { name: 'loginBtn', strategy: 'accessibility-id', selector: '~loginButton' },
        { name: 'usernameField', strategy: 'accessibility-id', selector: '~username' },
        { name: 'passwordField', strategy: 'accessibility-id', selector: '~password' },
        { name: 'submitBtn', strategy: 'accessibility-id', selector: '~submit' },
        { name: 'errorMsg', strategy: 'accessibility-id', selector: '~errorMessage' },
        { name: 'titleLabel', strategy: 'accessibility-id', selector: '~screenTitle' },
      ],
    };

    const analysis: CodebaseAnalysisResult = {
      existingPageObjects: [bloatedPO, balancedPO],
      existingStepDefinitions: [],
      existingFeatures: [],
      existingUtils: [],
      conflicts: [],
      architecturePattern: 'pom',
      yamlLocatorFiles: [],
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils',
        locatorsRoot: 'locators',
      },
    };

    const champion = engine.selectChampion(analysis);
    assert.ok(champion, 'Expected a champion to be selected');
    assert.strictEqual(
      champion!.className,
      'NewLoginPage',
      `Expected NewLoginPage (balanced, 8 methods) to beat OldLoginPage (bloated, 30 methods). Got: ${champion!.className}`
    );
  });

  test('[CHAMPION] AST-warned file should lose to clean smaller file', () => {
    const warnedPO = {
      path: 'pages/LazyPage.ts',
      className: 'LazyPage',
      publicMethods: ['login', 'logout', 'navigate', 'click', 'type', 'submit', 'verify', 'close', 'open', 'reload'],
      locators: [
        { name: 'btn', strategy: 'accessibility-id', selector: '~btn' },
        { name: 'field', strategy: 'accessibility-id', selector: '~field' },
        { name: 'label', strategy: 'accessibility-id', selector: '~label' },
        { name: 'header', strategy: 'accessibility-id', selector: '~header' },
        { name: 'footer', strategy: 'accessibility-id', selector: '~footer' },
      ],
    };
    const cleanPO = {
      path: 'pages/CleanPage.ts',
      className: 'CleanPage',
      publicMethods: ['login', 'logout', 'navigate'],
      locators: [
        { name: 'btn', strategy: 'accessibility-id', selector: '~btn' },
        { name: 'field', strategy: 'accessibility-id', selector: '~field' },
      ],
    };

    const analysis: CodebaseAnalysisResult = {
      existingPageObjects: [warnedPO, cleanPO],
      existingStepDefinitions: [],
      existingFeatures: [],
      existingUtils: [],
      conflicts: [],
      architecturePattern: 'pom',
      yamlLocatorFiles: [],
      warnings: ['[ASTScrutinizer] pages/LazyPage.ts contains TODO stub methods'],
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils',
        locatorsRoot: 'locators',
      },
    };

    const champion = engine.selectChampion(analysis);
    assert.ok(champion, 'Expected a champion to be selected');
    assert.strictEqual(
      champion!.className,
      'CleanPage',
      `Expected CleanPage (no AST warnings) to beat LazyPage (AST-warned). Got: ${champion!.className}`
    );
  });

  test('[CHAMPION] base/util classes should be excluded from champion selection', () => {
    const basePO = {
      path: 'pages/BasePage.ts',
      className: 'BasePage',
      publicMethods: ['tap', 'type', 'verify', 'scroll', 'wait', 'swipe', 'back', 'forward', 'reload', 'close'],
      locators: [
        { name: 'overlay', strategy: 'accessibility-id', selector: '~overlay' },
        { name: 'spinner', strategy: 'accessibility-id', selector: '~spinner' },
        { name: 'toast', strategy: 'accessibility-id', selector: '~toast' },
      ],
    };
    const realPO = {
      path: 'pages/LoginPage.ts',
      className: 'LoginPage',
      publicMethods: ['login', 'logout'],
      locators: [{ name: 'loginBtn', strategy: 'accessibility-id', selector: '~loginButton' }],
    };

    const analysis: CodebaseAnalysisResult = {
      existingPageObjects: [basePO, realPO],
      existingStepDefinitions: [],
      existingFeatures: [],
      existingUtils: [],
      conflicts: [],
      architecturePattern: 'pom',
      yamlLocatorFiles: [],
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils',
        locatorsRoot: 'locators',
      },
    };

    const champion = engine.selectChampion(analysis);
    assert.ok(champion, 'Expected a champion to be selected');
    assert.notStrictEqual(
      champion!.className,
      'BasePage',
      'BasePage (infrastructure) should never be selected as champion'
    );
    assert.strictEqual(
      champion!.className,
      'LoginPage',
      `Expected LoginPage (real PO) to be selected. Got: ${champion!.className}`
    );
  });
});