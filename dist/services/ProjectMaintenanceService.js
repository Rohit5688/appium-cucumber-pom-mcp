import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export class ProjectMaintenanceService {
    /**
     * Idempotent tool to upgrade project dependencies and structural aspects.
     */
    async upgradeProject(projectRoot) {
        const logs = [];
        // 1. Auto-detect project structure
        if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
            throw new Error("No package.json found. Is this a valid project root?");
        }
        // 2. Upgrade dependencies
        try {
            logs.push("Updating core dependencies...");
            await execAsync('npm install webdriverio@latest @cucumber/cucumber@latest', { cwd: projectRoot });
            logs.push("✅ Core dependencies updated to latest.");
        }
        catch (error) {
            logs.push(`❌ Failed to update dependencies: ${error.message}`);
        }
        // 3. Ensure backup directory exists
        const backupDir = path.join(projectRoot, '.appium-mcp', 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            logs.push(`✅ Created backup directory at ${backupDir}`);
        }
        // 4. Ensure mcp-config.json exists
        const configPath = path.join(projectRoot, 'mcp-config.json');
        if (!fs.existsSync(configPath)) {
            logs.push('⚠️ Missing mcp-config.json. Run setup_project to generate it.');
        }
        else {
            // Add version tag if missing
            const raw = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(raw);
            if (!config.version) {
                config.version = '1.0.0';
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                logs.push('✅ Migrated mcp-config.json to standard versioning format.');
            }
            // Check for legacy wdio monolith vs multi-config
            const wdioPath = path.join(projectRoot, 'wdio.conf.ts');
            const wdioShared = path.join(projectRoot, 'wdio.shared.conf.ts');
            if (fs.existsSync(wdioPath) && !fs.existsSync(wdioShared)) {
                logs.push('💡 Tip: Your project is using a monolithic wdio.conf.ts. The Appium MCP now supports Multi-Config Architecture (wdio.shared.conf.ts + specific platform configs).');
                logs.push('   > Run `setup_project` with `platform: "both"` to auto-generate the new split configuration files!');
            }
        }
        const summary = logs.join('\n');
        return summary;
    }
}
