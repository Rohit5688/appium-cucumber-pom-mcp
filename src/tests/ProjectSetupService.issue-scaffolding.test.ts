import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ProjectSetupService } from '../services/ProjectSetupService.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ProjectSetupService - Scaffolding Fix Issue', () => {
  let testDir: string;
  let setupService: ProjectSetupService;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-test-'));
    setupService = new ProjectSetupService();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should successfully scaffold mock-scenarios.json with paths parameter', async () => {
    // Phase 1: Create config template
    const phase1Result = await setupService.setup(testDir, 'android', 'TestApp');
    const phase1Data = JSON.parse(phase1Result);
    expect(phase1Data.phase).toBe(1);
    expect(phase1Data.status).toBe('CONFIG_TEMPLATE_CREATED');

    // Simulate user filling in required fields
    const configPath = path.join(testDir, 'mcp-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    config.mobile.defaultPlatform = 'android';
    config.mobile.capabilitiesProfiles = {
      pixel8: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Pixel_8',
        'appium:app': '/tmp/test.apk'
      }
    };
    config.environments = ['local', 'staging'];
    config.currentEnvironment = 'staging';
    config.codegen.tagTaxonomy = ['@smoke', '@regression'];

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Phase 2: Scaffold project
    const phase2Result = await setupService.setup(testDir, 'android', 'TestApp');
    const phase2Data = JSON.parse(phase2Result);
    
    expect(phase2Data.phase).toBe(2);
    expect(phase2Data.status).toBe('SETUP_COMPLETE');

    // Verify mock-scenarios.json was created in the correct location
    const mockScenariosPath = path.join(testDir, 'src/test-data/mock-scenarios.json');
    expect(fs.existsSync(mockScenariosPath)).toBe(true);

    // Verify the content is valid JSON
    const mockScenariosContent = fs.readFileSync(mockScenariosPath, 'utf-8');
    const mockScenarios = JSON.parse(mockScenariosContent);
    
    expect(mockScenarios).toHaveProperty('login-success');
    expect(mockScenarios['login-success']).toHaveProperty('method', 'post');
    expect(mockScenarios['login-success']).toHaveProperty('path', '/api/auth/login');
    expect(mockScenarios['login-success']).toHaveProperty('statusCode', 200);

    // Verify all other expected files were created
    expect(fs.existsSync(path.join(testDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'src/pages/BasePage.ts'))).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'src/utils/ActionUtils.ts'))).toBe(true);
  });

  it('should work with custom paths configuration', async () => {
    // Phase 1: Create config template
    await setupService.setup(testDir, 'android', 'TestApp');

    // Fill config with custom paths
    const configPath = path.join(testDir, 'mcp-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    config.mobile.defaultPlatform = 'ios';
    config.mobile.capabilitiesProfiles = {
      iphone14: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': 'iPhone 14',
        'appium:app': '/tmp/test.app'
      }
    };
    config.environments = ['staging'];
    config.currentEnvironment = 'staging';
    config.codegen.tagTaxonomy = ['@smoke'];
    
    // Use custom paths
    config.paths.testDataRoot = 'custom/test-data';

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Phase 2: Scaffold with custom paths
    const phase2Result = await setupService.setup(testDir, 'ios', 'TestApp');
    const phase2Data = JSON.parse(phase2Result);
    
    expect(phase2Data.status).toBe('SETUP_COMPLETE');

    // Verify mock-scenarios.json was created in custom location
    const mockScenariosPath = path.join(testDir, 'custom/test-data/mock-scenarios.json');
    expect(fs.existsSync(mockScenariosPath)).toBe(true);

    const mockScenariosContent = fs.readFileSync(mockScenariosPath, 'utf-8');
    const mockScenarios = JSON.parse(mockScenariosContent);
    expect(mockScenarios).toHaveProperty('login-success');
  });
});