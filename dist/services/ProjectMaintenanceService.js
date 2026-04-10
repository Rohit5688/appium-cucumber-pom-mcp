import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { UtilAuditService } from './UtilAuditService.js';
import { validateProjectRoot } from '../utils/SecurityUtils.js';
import { McpErrors } from '../types/ErrorSystem.js';
const execFileAsync = promisify(execFile);
import { ProjectSetupService } from './ProjectSetupService.js';
export class ProjectMaintenanceService {
    utilAuditService = new UtilAuditService();
    projectSetupService = new ProjectSetupService();
    /**
     * Idempotent tool to upgrade project dependencies and structural aspects.
     *
     * CB-1 FIX: Validates projectRoot to prevent shell injection attacks
     */
    async upgradeProject(projectRoot, preview = false) {
        // CB-1 FIX: Validate projectRoot before any operations
        try {
            validateProjectRoot(projectRoot);
        }
        catch (error) {
            throw McpErrors.projectValidationFailed(`Invalid projectRoot: ${error.message}`, 'ProjectMaintenanceService');
        }
        // New: config-aware upgrade is the primary flow
        return this.projectSetupService.upgrade(projectRoot, preview);
    }
    /**
     * Safe to run at any time — only generates files that are missing and never overwrites existing ones.
     *
     * CB-1 FIX: Validates projectRoot to prevent shell injection attacks
     */
    async repairProject(projectRoot, platform = 'android', preview = false) {
        // CB-1 FIX: Validate projectRoot before any operations
        try {
            validateProjectRoot(projectRoot);
        }
        catch (error) {
            throw McpErrors.projectValidationFailed(`Invalid projectRoot: ${error.message}`, 'ProjectMaintenanceService');
        }
        // PREVIEW: report which baseline files would be regenerated without writing anything.
        if (preview) {
            const baseFiles = [
                'src/pages/BasePage.ts',
                'src/step-definitions/hooks.ts',
                'wdio.conf.ts',
                'package.json',
                'tsconfig.json',
                'cucumber.js',
                '.gitignore'
            ];
            const missing = [];
            for (const f of baseFiles) {
                if (!fs.existsSync(path.join(projectRoot, f)))
                    missing.push(f);
            }
            const previewResult = {
                preview: true,
                filesToRepair: missing,
                hint: '✅ Preview complete. Call repair_project with preview:false to perform repair.'
            };
            return JSON.stringify(previewResult, null, 2);
        }
        try {
            await this.projectSetupService.setup(projectRoot, platform, 'RepairedApp');
            return "✅ Project repair completed. Missing baseline files were regenerated.";
        }
        catch (error) {
            throw McpErrors.projectValidationFailed(`Failed to repair project: ${error.message}`, 'ProjectMaintenanceService');
        }
    }
}
