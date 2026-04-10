import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectSetupService } from '../services/ProjectSetupService.js';
import { McpConfigService } from '../services/McpConfigService.js';

describe('setup_project Phase Separation Fix', () => {
  let tempDir: string;
  let projectSetupService: ProjectSetupService;
  let configService: McpConfigService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-test-'));
    projectSetupService = new ProjectSetupService();
    configService = new McpConfigService();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore EBUSY/EPERM on windows during cleanup if some file is still handle-locked
      }
    }
  });

  it('Phase 1: should create config template and stop', async () => {
    // First call - Phase 1
    const result = await projectSetupService.setup(tempDir, 'android', 'TestApp');
    const parsed = JSON.parse(result);

    // Verify Phase 1 response
    assert.strictEqual(parsed.phase, 1);
    assert.strictEqual(parsed.status, 'CONFIG_TEMPLATE_CREATED');
    assert.ok(parsed.message.includes('STEP 1 of 2'));
    assert.ok(parsed.message.includes('Open mcp-config.json and fill in'));
    assert.strictEqual(parsed.nextStep, 'Call setup_project again after filling mcp-config.json');

    // Verify config file exists with CONFIGURE_ME placeholders
    const configPath = path.join(tempDir, 'mcp-config.json');
    assert.strictEqual(fs.existsSync(configPath), true);

    const configContent = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.ok(JSON.stringify(configContent.mobile.defaultPlatform).includes('CONFIGURE_ME'));

    // Verify NO other files were created (only config template)
    const files = fs.readdirSync(tempDir);
    assert.ok(files.includes('mcp-config.json'));
    assert.ok(files.includes('.AppForge')); // Schema directory
    assert.ok(!files.includes('package.json'));
    assert.ok(!files.includes('src'));
  });

  it('Phase 2: should fail if required fields still have CONFIGURE_ME', async () => {
    // Phase 1: Create template
    await projectSetupService.setup(tempDir, 'android', 'TestApp');

    // Phase 2: Try to proceed without filling config
    const result2 = await projectSetupService.setup(tempDir, 'android', 'TestApp');
    const parsed2 = JSON.parse(result2);

    // Should fail with required fields missing
    assert.strictEqual(parsed2.phase, 2);
    assert.strictEqual(parsed2.status, 'REQUIRED_FIELDS_MISSING');
    assert.ok(parsed2.message.includes('required fields still have CONFIGURE_ME'));
    assert.ok(parsed2.offendingJsonPaths !== undefined);
    assert.ok(parsed2.offendingJsonPaths.length > 0);
  });

  it('Phase 2: should scaffold full project after user fills config', async () => {
    // Phase 1: Create template
    await projectSetupService.setup(tempDir, 'android', 'TestApp');

    // Simulate user filling the config
    const configPath = path.join(tempDir, 'mcp-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    config.mobile.defaultPlatform = 'android';
    config.mobile.capabilitiesProfiles = {
      pixel8: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Pixel_8',
        'appium:app': '/path/to/app.apk'
      }
    };
    config.environments = ['staging', 'prod'];
    config.currentEnvironment = 'staging';
    config.codegen.tagTaxonomy = ['@smoke', '@regression'];

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Phase 2: Now scaffold the full project
    const result2 = await projectSetupService.setup(tempDir, 'android', 'TestApp');
    const parsed2 = JSON.parse(result2);

    // Verify Phase 2 success
    assert.strictEqual(parsed2.phase, 2);
    assert.strictEqual(parsed2.status, 'SETUP_COMPLETE');
    assert.ok(parsed2.filesCreated !== undefined);
    assert.ok(parsed2.filesCreated.length > 0);

    // Verify project structure was created
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'package.json')), true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'tsconfig.json')), true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'cucumber.js')), true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'wdio.conf.ts')), true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'src', 'pages', 'BasePage.ts')), true);
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'src', 'features', 'sample.feature')), true);
  });

  it('migrateIfNeeded should only run after Phase 2 success', async () => {
    // Phase 1
    await projectSetupService.setup(tempDir, 'android', 'TestApp');
    
    // Config should NOT have been migrated yet (version still has descriptive text)
    const configPath = path.join(tempDir, 'mcp-config.json');
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.strictEqual(config.version, '1.1.0');
    
    // Fill config for Phase 2
    config.mobile.defaultPlatform = 'android';
    config.mobile.capabilitiesProfiles = {
      pixel8: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Pixel_8',
        'appium:app': '/path/to/app.apk'
      }
    };
    config.environments = ['staging'];
    config.currentEnvironment = 'staging';
    config.codegen.tagTaxonomy = ['@smoke'];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    // Phase 2
    await projectSetupService.setup(tempDir, 'android', 'TestApp');
    
    // Now migrate should be called externally (by setup_project.ts)
    configService.migrateIfNeeded(tempDir);
    
    // Verify schema was generated
    const schemaPath = path.join(tempDir, '.AppForge', 'configSchema.json');
    assert.strictEqual(fs.existsSync(schemaPath), true);
  });

  it('should handle the exact scenario from the bug report', async () => {
    // User calls setup_project from scratch
    const phase1Result = await projectSetupService.setup(tempDir, 'android', 'TestApp');
    const phase1 = JSON.parse(phase1Result);

    // Phase 1 should create template and tell user to fill it
    assert.strictEqual(phase1.phase, 1);
    assert.strictEqual(phase1.status, 'CONFIG_TEMPLATE_CREATED');

    // At this point, the tool should STOP and NOT call manage_config
    // The fix ensures that:
    // 1. migrateIfNeeded is not called after Phase 1
    // 2. The tool description warns against calling manage_config
    // 3. The response explicitly says to call setup_project again

    // Verify no files created except config
    const files = fs.readdirSync(tempDir);
    assert.ok(!files.includes('package.json'));

    // User manually edits config (simulated)
    const configPath = path.join(tempDir, 'mcp-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.mobile.defaultPlatform = 'android';
    config.mobile.capabilitiesProfiles = {
      pixel8: {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'Pixel_8',
        'appium:app': '/path/to/app.apk'
      }
    };
    config.environments = ['staging'];
    config.currentEnvironment = 'staging';
    config.codegen.tagTaxonomy = ['@smoke'];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    // User calls setup_project again
    const phase2Result = await projectSetupService.setup(tempDir, 'android', 'TestApp');
    const phase2 = JSON.parse(phase2Result);

    // Phase 2 should scaffold everything
    assert.strictEqual(phase2.phase, 2);
    assert.strictEqual(phase2.status, 'SETUP_COMPLETE');
    assert.ok(phase2.filesCreated.length > 5);

    // Now the full project exists
    assert.strictEqual(fs.existsSync(path.join(tempDir, 'package.json')), true);
  });
});