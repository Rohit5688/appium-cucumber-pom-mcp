import fs from 'fs';
import path from 'path';
import { McpConfigService } from './McpConfigService.js';
/**
 * Service to manage cloud credentials, environment variables, and multi-env test users.
 */
export class CredentialService {
    mcpConfigService = new McpConfigService();
    /**
     * Updates the .env file with provided key-value pairs.
     */
    async setEnv(projectRoot, data) {
        const envPath = path.join(projectRoot, '.env');
        let content = '';
        try {
            content = await fs.promises.readFile(envPath, 'utf8');
        }
        catch {
            // .env doesn't exist, start fresh
        }
        const lines = content.split('\n');
        for (const [key, value] of Object.entries(data)) {
            const index = lines.findIndex(line => line.startsWith(`${key}=`));
            if (index !== -1) {
                lines[index] = `${key}=${value}`;
            }
            else {
                lines.push(`${key}=${value}`);
            }
        }
        await fs.promises.writeFile(envPath, lines.join('\n'), 'utf8');
        return `Updated .env at ${envPath}`;
    }
    /**
     * Manage multi-environment user credentials (users.{env}.json).
     * Supports creating, reading, and updating user sets for different environments.
     *
     * The directory path is resolved from mcp-config.json's paths.testDataRoot,
     * falling back to 'src/test-data' if not configured.
     */
    async manageUsers(projectRoot, operation, env, users) {
        let config = {};
        let strategy = null;
        let currentEnv = env ?? 'staging';
        try {
            config = this.mcpConfigService.read(projectRoot);
            currentEnv = this.mcpConfigService.getCurrentEnvironment(config, env);
            strategy = this.mcpConfigService.getCredentialStrategy(config);
        }
        catch {
            // Config not readable — show setup guidance
        }
        // STEP 1: If no credential strategy chosen yet, return selection prompt
        if (!strategy) {
            return JSON.stringify({
                action: 'STRATEGY_SELECTION_REQUIRED',
                message: 'No credential strategy configured for this project. Choose one and run manage_config to save it.',
                instruction: 'After choosing, call: manage_config with operation="write" and config={ "credentials": { "strategy": "<chosen>" } }',
                options: {
                    'role-env-matrix': {
                        description: 'Single JSON file with credentials[role][env] structure. Best for most teams.',
                        exampleFile: 'credentials/users.json',
                        exampleContent: {
                            admin: {
                                staging: { username: 'admin@stage.com', password: 'FILL_IN' },
                                local: { username: 'admin@local.com', password: 'FILL_IN' }
                            },
                            readonly: {
                                staging: { username: 'viewer@stage.com', password: 'FILL_IN' }
                            }
                        }
                    },
                    'per-env-files': {
                        description: 'One JSON file per environment: credentials/users.{env}.json. Best for env-isolated secrets.',
                        exampleFile: `credentials/users.${currentEnv}.json`,
                        exampleContent: [
                            { role: 'admin', username: `admin@${currentEnv}.com`, password: 'FILL_IN' },
                            { role: 'readonly', username: `viewer@${currentEnv}.com`, password: 'FILL_IN' }
                        ]
                    },
                    'unified-key': {
                        description: 'Single JSON file with credentials["{role}-{env}"] keys. Best for simple/small projects.',
                        exampleFile: 'credentials/users.json',
                        exampleContent: {
                            [`admin-${currentEnv}`]: { username: `admin@${currentEnv}.com`, password: 'FILL_IN' },
                            [`readonly-${currentEnv}`]: { username: `viewer@${currentEnv}.com`, password: 'FILL_IN' }
                        }
                    },
                    'custom': {
                        description: 'You have an existing credential system. Describe its JSON shape in schemaHint.',
                        instruction: 'Set: { "credentials": { "strategy": "custom", "schemaHint": "Describe your JSON format here" } }'
                    }
                }
            }, null, 2);
        }
        // STEP 2: Resolve credential file path from strategy
        const credentialsDir = path.join(projectRoot, 'credentials');
        let credentialsFile;
        if (strategy.strategy === 'per-env-files') {
            credentialsFile = strategy.file
                ? path.join(projectRoot, strategy.file.replace('{env}', currentEnv))
                : path.join(credentialsDir, `users.${currentEnv}.json`);
        }
        else {
            credentialsFile = strategy.file
                ? path.join(projectRoot, strategy.file)
                : path.join(credentialsDir, 'users.json');
        }
        // STEP 3: Ensure credentials/ directory exists and is gitignored
        if (!fs.existsSync(credentialsDir)) {
            fs.mkdirSync(credentialsDir, { recursive: true });
        }
        const gitignorePath = path.join(projectRoot, '.gitignore');
        try {
            const gi = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
            if (!gi.includes('credentials/')) {
                fs.writeFileSync(gitignorePath, gi.trimEnd() + '\n\n# Credential files — never commit\ncredentials/\n', 'utf8');
            }
        }
        catch { /* non-fatal */ }
        // STEP 4: Read operation
        if (operation === 'read') {
            if (!fs.existsSync(credentialsFile)) {
                return JSON.stringify({
                    status: 'NO_FILE',
                    message: `Credential file not found: ${path.relative(projectRoot, credentialsFile)}`,
                    suggestion: `Call manage_users with operation="write" and users=[...] to create it.`,
                    strategy: strategy.strategy,
                    schemaHint: strategy.schemaHint ?? null
                }, null, 2);
            }
            const content = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
            return JSON.stringify({
                status: 'ok',
                strategy: strategy.strategy,
                file: path.relative(projectRoot, credentialsFile),
                content
            }, null, 2);
        }
        // STEP 5: Write operation — scaffold the file using the chosen strategy format
        if (!users || users.length === 0) {
            return JSON.stringify({
                error: 'USERS_REQUIRED',
                message: 'Provide a users array to write credentials.'
            }, null, 2);
        }
        let fileContent;
        if (strategy.strategy === 'role-env-matrix') {
            // Build/merge role-env-matrix into existing file
            fileContent = fs.existsSync(credentialsFile)
                ? JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))
                : {};
            for (const user of users) {
                const role = user.role ?? 'default';
                if (!fileContent[role])
                    fileContent[role] = {};
                fileContent[role][currentEnv] = { username: user.username, password: user.password };
            }
        }
        else if (strategy.strategy === 'per-env-files') {
            // Replace the env-specific file entirely
            fileContent = users.map(u => ({ role: u.role ?? 'default', username: u.username, password: u.password }));
        }
        else if (strategy.strategy === 'unified-key') {
            fileContent = fs.existsSync(credentialsFile)
                ? JSON.parse(fs.readFileSync(credentialsFile, 'utf8'))
                : {};
            for (const user of users) {
                const role = user.role ?? 'default';
                fileContent[`${role}-${currentEnv}`] = { username: user.username, password: user.password };
            }
        }
        else {
            // custom: write raw users array — LLM will decide the final shape
            fileContent = users;
        }
        fs.writeFileSync(credentialsFile, JSON.stringify(fileContent, null, 2), 'utf8');
        return JSON.stringify({
            status: 'written',
            strategy: strategy.strategy,
            file: path.relative(projectRoot, credentialsFile),
            environment: currentEnv,
            usersWritten: users.length,
            warning: 'Fill in real passwords — this file is gitignored and safe to edit directly.'
        }, null, 2);
    }
}
