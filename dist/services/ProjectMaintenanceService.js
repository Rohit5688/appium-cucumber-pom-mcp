import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
/**
 * Baseline files that should always exist in a healthy AppForge project.
 * Used by repairProject() to detect and regenerate partial scaffolds.
 */
const BASELINE_FILES = [
    { file: 'mcp-config.json', category: 'config' },
    { file: 'package.json', category: 'config' },
    { file: 'tsconfig.json', category: 'config' },
    { file: 'src/pages/BasePage.ts', category: 'scaffold' },
    { file: 'src/step-definitions/hooks.ts', category: 'scaffold' },
    { file: 'src/features/sample.feature', category: 'scaffold' },
];
export class ProjectMaintenanceService {
    /**
     * Idempotent tool to upgrade project dependencies and structural aspects.
     */
    async upgradeProject(projectRoot) {
        const logs = [];
        if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
            throw new Error("No package.json found. Is this a valid project root?");
        }
        // 1. Upgrade dependencies
        try {
            logs.push("Updating core dependencies...");
            await execAsync('npm install webdriverio@latest @cucumber/cucumber@latest', { cwd: projectRoot });
            logs.push("✅ Core dependencies updated to latest.");
        }
        catch (error) {
            logs.push(`❌ Failed to update dependencies: ${error.message}`);
        }
        // 2. Ensure backup directory exists
        const backupDir = path.join(projectRoot, '.appium-mcp', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            logs.push(`✅ Created backup directory at ${backupDir}`);
        }
        // 3. Detect and report partial setup
        const missingBaseline = this.detectMissingBaseline(projectRoot);
        if (missingBaseline.length > 0) {
            logs.push('');
            logs.push('⚠️ Partial scaffold detected. The following baseline files are missing:');
            missingBaseline.forEach(f => logs.push(`   • ${f}`));
            logs.push('');
            logs.push('💡 Run repair_project to restore missing baseline files without overwriting existing ones.');
        }
        // 4. Ensure mcp-config.json exists (upgrade schema version tag if present)
        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (!fs.existsSync(configPath)) {
            logs.push('⚠️ Missing mcp-config.json — run repair_project to regenerate it.');
        }
        else {
            const raw = fs.readFileSync(configPath, 'utf8');
            try {
                const config = JSON.parse(raw);
                if (!config.version) {
                    config.version = '1.0.0';
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    logs.push('✅ Migrated mcp-config.json to standard versioning format.');
                }
            }
            catch {
                logs.push('❌ existing mcp-config.json is malformed. Cannot parse JSON. Skipping config upgrade.');
            }
            const wdioPath = path.join(projectRoot, 'wdio.conf.ts');
            const wdioShared = path.join(projectRoot, 'wdio.shared.conf.ts');
            if (fs.existsSync(wdioPath) && !fs.existsSync(wdioShared)) {
                logs.push('💡 Tip: Your project is using a monolithic wdio.conf.ts. The Appium MCP now supports Multi-Config Architecture (wdio.shared.conf.ts + specific platform configs).');
                logs.push('   > Run `setup_project` with `platform: "both"` to auto-generate the new split configuration files!');
            }
        }
        return logs.join('\n');
    }
    /**
     * Repairs a partial or interrupted project bootstrap by regenerating
     * missing baseline artifacts without overwriting any existing files.
     *
     * Safe to run after a failed setup_project or on projects that were
     * partially migrated.
     */
    async repairProject(projectRoot, platform = 'android') {
        const logs = [`🔧 Repairing project at ${projectRoot}...`, ''];
        if (!fs.existsSync(projectRoot)) {
            throw new Error(`Project directory does not exist: ${projectRoot}. Run setup_project first.`);
        }
        const missingBefore = this.detectMissingBaseline(projectRoot);
        if (missingBefore.length === 0) {
            return '✅ Project is healthy — all baseline files are present. No repairs needed.';
        }
        logs.push('Missing files detected:');
        missingBefore.forEach(f => logs.push(`   • ${f}`));
        logs.push('');
        // Ensure directory structure exists
        const dirs = ['src/features', 'src/step-definitions', 'src/pages', 'src/utils', 'src/test-data', 'src/config', 'reports', '.appium-mcp'];
        for (const dir of dirs) {
            const full = path.join(projectRoot, dir);
            if (!fs.existsSync(full)) {
                fs.mkdirSync(full, { recursive: true });
                logs.push(`📁 Created directory: ${dir}`);
            }
        }
        // Regenerate missing files
        const repaired = [];
        const skipped = [];
        // mcp-config.json
        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                $schema: "./.appium-mcp/configSchema.json",
                version: "1.1.0",
                project: { language: "typescript", testFramework: "cucumber", client: "webdriverio-appium" },
                mobile: {
                    defaultPlatform: platform,
                    capabilitiesProfiles: {
                        "default": {
                            "platformName": platform === 'ios' ? "iOS" : "Android",
                            "appium:automationName": platform === 'ios' ? "XCUITest" : "UiAutomator2",
                            "appium:deviceName": platform === 'ios' ? "iPhone 14" : "Pixel_8"
                        }
                    }
                },
                paths: {
                    featuresRoot: "src/features",
                    pagesRoot: "src/pages",
                    stepsRoot: "src/step-definitions",
                    utilsRoot: "src/utils"
                },
                reuse: { locatorOrder: ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"] }
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            repaired.push('mcp-config.json');
        }
        else {
            skipped.push('mcp-config.json (existing)');
        }
        // BasePage.ts stub
        const basePage = path.join(projectRoot, 'src', 'pages', 'BasePage.ts');
        if (!fs.existsSync(basePage)) {
            fs.writeFileSync(basePage, `import { browser, $ } from '@wdio/globals';\n\nexport abstract class BasePage {\n  protected async waitForElement(selector: string, timeout = 10000) {\n    const el = await $(selector);\n    await el.waitForDisplayed({ timeout });\n    return el;\n  }\n}\n`);
            repaired.push('src/pages/BasePage.ts');
        }
        else {
            skipped.push('src/pages/BasePage.ts (existing)');
        }
        // hooks.ts stub
        const hooks = path.join(projectRoot, 'src', 'step-definitions', 'hooks.ts');
        if (!fs.existsSync(hooks)) {
            fs.writeFileSync(hooks, `import { Before, After, AfterAll } from '@cucumber/cucumber';\n\nBefore(async function (scenario) {\n  console.log(\`[Hooks] Starting: \${scenario.pickle.name}\`);\n});\n\nAfter(async function () {});\nAfterAll(async function () {});\n`);
            repaired.push('src/step-definitions/hooks.ts');
        }
        else {
            skipped.push('src/step-definitions/hooks.ts (existing)');
        }
        // sample.feature stub
        const sampleFeature = path.join(projectRoot, 'src', 'features', 'sample.feature');
        if (!fs.existsSync(sampleFeature)) {
            fs.writeFileSync(sampleFeature, `@smoke\nFeature: Sample Login Flow\n\n  Scenario: Successful login\n    Given the app is launched\n    When I enter valid credentials\n    Then I should see the home screen\n`);
            repaired.push('src/features/sample.feature');
        }
        else {
            skipped.push('src/features/sample.feature (existing)');
        }
        const missingAfter = this.detectMissingBaseline(projectRoot);
        logs.push('Results:');
        if (repaired.length > 0) {
            logs.push('  ✅ Repaired:');
            repaired.forEach(f => logs.push(`     • ${f}`));
        }
        if (skipped.length > 0) {
            logs.push('  ⏩ Skipped (already exist):');
            skipped.forEach(f => logs.push(`     • ${f}`));
        }
        logs.push('');
        if (missingAfter.length === 0) {
            logs.push('✅ Project repair complete. All baseline files are now present.');
            logs.push('Next step: Run npm install to install dependencies.');
        }
        else {
            logs.push('⚠️ Some files could not be repaired:');
            missingAfter.forEach(f => logs.push(`   • ${f}`));
            logs.push('Consider running setup_project in a new directory.');
        }
        return logs.join('\n');
    }
    /**
     * Returns the list of missing baseline files for a given project root.
     */
    detectMissingBaseline(projectRoot) {
        return BASELINE_FILES
            .filter(({ file }) => !fs.existsSync(path.join(projectRoot, file)))
            .map(({ file }) => file);
    }
}
