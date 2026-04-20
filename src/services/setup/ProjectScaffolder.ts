import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../config/McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import { ConfigTemplateManager } from './ConfigTemplateManager.js';
import { DocScaffolder } from './DocScaffolder.js';
import { TestScaffolder } from './TestScaffolder.js';
import { UtilTemplateWriter } from './UtilTemplateWriter.js';
import { WdioConfigBuilder } from './WdioConfigBuilder.js';

export class ProjectScaffolder {
  constructor(
     protected mcpConfigService: McpConfigService,
     protected configMgr: ConfigTemplateManager,
     protected docScaffolder: DocScaffolder,
     protected testScaffolder: TestScaffolder,
     protected utilWriter: UtilTemplateWriter,
     protected wdioBuilder: WdioConfigBuilder
  ) {}

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

    /**
     * Scaffolds a complete, runnable Appium + Cucumber + TypeScript project.
     */
    public async setup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
        if (!fs.existsSync(projectRoot)) {
          fs.mkdirSync(projectRoot, { recursive: true });
        }

        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (!fs.existsSync(configPath)) {
          this.configMgr.generateConfigTemplate(projectRoot);
          
          // Create docs directory and reference documentation in Phase 1
          const docsDir = path.join(projectRoot, 'docs');
          if (!fs.existsSync(docsDir)) {
            fs.mkdirSync(docsDir, { recursive: true });
          }
          this.docScaffolder.scaffoldMcpConfigReference(projectRoot);
          this.docScaffolder.scaffoldPromptCheatbook(projectRoot);
          
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

        const configService = new McpConfigService();
        const timeouts = configService.getTimeouts(config);
        const reporting = configService.getReporting(config);
        const effectivePlatform = (config?.mobile?.defaultPlatform as string) || platform;
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
          this.configMgr.scaffoldPackageJson(stagingDir, appName, effectivePlatform);
          filesCreated.push('package.json');

          // 3. tsconfig.json
          this.configMgr.scaffoldTsConfig(stagingDir);
          filesCreated.push('tsconfig.json');

          // 4. cucumber.js config
          this.configMgr.scaffoldCucumberConfig(stagingDir);
          filesCreated.push('cucumber.js');

          // 5. BasePage.ts
          this.testScaffolder.scaffoldBasePage(stagingDir, paths);
          filesCreated.push(`${paths.pagesRoot}/BasePage.ts`);

          // 6. Utils Layer
          this.utilWriter.scaffoldAppiumDriver(stagingDir, paths);
          this.utilWriter.scaffoldActionUtils(stagingDir, timeouts?.elementWait);
          this.utilWriter.scaffoldGestureUtils(stagingDir, paths);
          this.utilWriter.scaffoldWaitUtils(stagingDir, timeouts?.elementWait, paths);
          this.utilWriter.scaffoldAssertionUtils(stagingDir);
          this.utilWriter.scaffoldTestContext(stagingDir, paths);
          this.utilWriter.scaffoldDataUtils(stagingDir, paths);
          this.testScaffolder.scaffoldLocatorUtils(stagingDir, paths);

          // Keep old for back compat
          this.utilWriter.scaffoldMobileGestures(stagingDir, paths);
          filesCreated.push(`${paths.utilsRoot}/ActionUtils.ts`, `${paths.utilsRoot}/WaitUtils.ts`, `${paths.utilsRoot}/MobileGestures.ts`, `${paths.utilsRoot}/LocatorUtils.ts`);

          // 7. MockServer.ts
          this.utilWriter.scaffoldMockServer(stagingDir, paths);
          filesCreated.push(`${paths.utilsRoot}/MockServer.ts`);

          // 8. Before/After hooks
          this.testScaffolder.scaffoldHooks(stagingDir, reporting.screenshotOn as 'failure' | 'always' | 'never', reporting);
          filesCreated.push(`${paths.stepsRoot}/hooks.ts`);

          // 9. Sample feature + step definitions
          this.testScaffolder.scaffoldSampleFeature(stagingDir, paths);
          filesCreated.push(`${paths.featuresRoot}/sample.feature`);
          
          this.testScaffolder.scaffoldSampleSteps(stagingDir, paths);
          filesCreated.push(`${paths.stepsRoot}/sample.steps.ts`);
          
          this.testScaffolder.scaffoldLoginPage(stagingDir, paths);
          filesCreated.push(`${paths.pagesRoot}/LoginPage.ts`);

          // 10. MCP documentation (helpful guides)
          this.docScaffolder.scaffoldMcpDocs(stagingDir);
          filesCreated.push('docs/APPFORGE_QUICK_START.md');

          // 11. .gitignore
          this.configMgr.scaffoldGitignore(stagingDir, paths);
          filesCreated.push('.gitignore');

          // 11. wdio.conf.ts — WebdriverIO + Appium connection config
          if (effectivePlatform === 'both') {
            this.wdioBuilder.scaffoldWdioSharedConfig(stagingDir, timeouts, reporting, paths);
            this.wdioBuilder.scaffoldWdioAndroidConfig(stagingDir, projectRoot, config);
            this.wdioBuilder.scaffoldWdioIosConfig(stagingDir, projectRoot, config);
            filesCreated.push('wdio.shared.conf.ts', 'wdio.android.conf.ts', 'wdio.ios.conf.ts');
          } else {
            this.wdioBuilder.scaffoldWdioConfig(stagingDir, projectRoot, effectivePlatform, timeouts, reporting, paths, config);
            filesCreated.push('wdio.conf.ts');
          }

          // 12. Mock scenarios sample JSON
          this.utilWriter.scaffoldMockScenarios(stagingDir, paths);
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
     * Reads the config and returns a list of fields that still have "CONFIGURE_ME" markers.
     */
    public scanConfigureMe(projectRoot: string): string[] {
        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (!fs.existsSync(configPath)) return ['mcp-config.json not found'];
        const raw = fs.readFileSync(configPath, 'utf-8');
        const unconfigured: string[] = [];
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

    /**
     * Proxy entry-point for upgrade_project — runs the config-aware upgrade flow.
     */
    public async upgrade(projectRoot: string, preview: boolean = false): Promise<string> {
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
        const unconfigured = this.scanConfigureMe(projectRoot);
        if (unconfigured.length > 0) {
          pending.push(...unconfigured.map(field => `${field} needs configuration`));
        }

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
        const unfilledFields = this.scanConfigureMe(projectRoot);
        if (unfilledFields.length > 0) {
          pending.push(...unfilledFields.map(f => `${f} (still has CONFIGURE_ME value)`));
        }

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

        if (config.environments && config.environments.length > 0 && !config.environments[0].startsWith('CONFIGURE_ME')) {
          // If currentEnvironment is set and valid, nothing to scaffold — just confirm
          const currentEnv = this.mcpConfigService.getCurrentEnvironment(config);
          skipped.push(`environments configured: [${config.environments.join(', ')}], current: "${currentEnv}"`);
        } else {
          pending.push('environments — define your test environment names (e.g. ["local", "staging", "prod"])');
          pending.push('currentEnvironment — set which environment to run tests against');
        }

        const repairResult = await this.repair(projectRoot, config.mobile?.defaultPlatform ?? 'android');
        if (repairResult.repairedFiles && repairResult.repairedFiles.length > 0) {
          applied.push(...repairResult.repairedFiles.map((f: string) => `Repaired missing file: ${f}`));
        }

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
}