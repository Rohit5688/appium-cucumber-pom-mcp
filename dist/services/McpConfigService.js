import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/Logger.js';
import { AppForgeError } from '../utils/ErrorFactory.js';
/** Returns safe default paths merged with config paths. */
function resolvePaths(config) {
    return {
        featuresRoot: config.paths?.featuresRoot ?? 'features',
        pagesRoot: config.paths?.pagesRoot ?? 'pages',
        stepsRoot: config.paths?.stepsRoot ?? 'step-definitions',
        utilsRoot: config.paths?.utilsRoot ?? 'utils',
        testDataRoot: config.paths?.testDataRoot ?? 'src/test-data',
        reportsRoot: config.paths?.reportsRoot ?? 'reports'
    };
}
export class McpConfigService {
    configFileName = 'mcp-config.json';
    CURRENT_VERSION = '1.1.0';
    read(projectRoot) {
        const configPath = path.join(projectRoot, this.configFileName);
        if (!fs.existsSync(configPath)) {
            throw new AppForgeError("E008_PRECONDITION_FAIL", `Configuration file not found at ${configPath}. Please run setup_project first.`, ["Run setup_project"]);
        }
        try {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return raw;
        }
        catch (error) {
            throw new AppForgeError("E005_CONFIG_CORRUPT", `Failed to parse mcp-config.json: ${error.message}. Fix the JSON syntax error (trailing comma, missing brace, etc.) and retry.`, ["Fix the JSON syntax error in mcp-config.json", "Run: npx jsonlint mcp-config.json"]);
        }
    }
    /**
     * Migrates an old-format mcp-config.json to the current schema version.
     * Call ONLY from setup_project and upgrade_project — NOT from read().
     * All other callers use read() for pure data access with zero side effects.
     */
    migrateIfNeeded(projectRoot) {
        const configPath = path.join(projectRoot, this.configFileName);
        if (!fs.existsSync(configPath))
            return;
        try {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!raw.version || raw.version !== this.CURRENT_VERSION) {
                raw.version = this.CURRENT_VERSION;
                raw.$schema = './.AppForge/configSchema.json'; // Enables IDE autocompletion
                fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
                this.generateSchema(projectRoot);
            }
        }
        catch (error) {
            // Ignored here if JSON is invalid, read() will throw properly
        }
    }
    /**
     * Generates a JSON schema file for IDE autocompletion.
     */
    generateSchema(projectRoot) {
        const schemaDir = path.join(projectRoot, '.AppForge');
        if (!fs.existsSync(schemaDir)) {
            fs.mkdirSync(schemaDir, { recursive: true });
        }
        const schemaPath = path.join(schemaDir, 'configSchema.json');
        if (!fs.existsSync(schemaPath)) {
            const schema = {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "MCP Config Schema",
                "type": "object",
                "properties": {
                    "version": { "type": "string" },
                    "project": {
                        "type": "object",
                        "properties": {
                            "language": { "type": "string", "enum": ["typescript"] },
                            "testFramework": { "type": "string", "enum": ["cucumber"] },
                            "client": { "type": "string", "enum": ["webdriverio"] }
                        },
                        "required": ["language", "testFramework", "client"]
                    },
                    "mobile": {
                        "type": "object",
                        "required": ["defaultPlatform", "capabilitiesProfiles"]
                    }
                },
                "required": ["project", "mobile"]
            };
            fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
        }
    }
    /**
     * Recursively merges `source` into `target`.
     * Arrays are replaced (not concatenated) — this matches config update expectations.
     * Primitives in source always overwrite target.
     */
    static deepMerge(target, source) {
        // Null/undefined source → keep target unchanged
        if (source === null || source === undefined)
            return target;
        // Non-object source → source replaces target
        if (typeof source !== 'object' || Array.isArray(source))
            return source;
        // Both objects → merge recursively
        const output = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] !== null &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                target?.[key] !== null &&
                typeof target?.[key] === 'object' &&
                !Array.isArray(target?.[key])) {
                output[key] = McpConfigService.deepMerge(target[key], source[key]);
            }
            else {
                output[key] = source[key];
            }
        }
        return output;
    }
    write(projectRoot, config) {
        const configPath = path.join(projectRoot, this.configFileName);
        let existingConfig = {};
        if (fs.existsSync(configPath)) {
            existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        const newConfig = McpConfigService.deepMerge(existingConfig, config);
        // Auto-purge placeholder profiles: if user wrote real capability profiles,
        // remove any profile entry where ALL capability values still start with "CONFIGURE_ME".
        // This prevents the default "myDevice" placeholder from blocking setup_project phase 2.
        const profiles = newConfig?.mobile?.capabilitiesProfiles;
        if (profiles && typeof profiles === 'object') {
            const profileKeys = Object.keys(profiles);
            const realProfileCount = profileKeys.filter(k => {
                const caps = profiles[k];
                return caps && typeof caps === 'object' &&
                    Object.values(caps).some((v) => typeof v !== 'string' || !v.startsWith('CONFIGURE_ME'));
            }).length;
            if (realProfileCount > 0) {
                // Remove any profiles where every string value is a CONFIGURE_ME placeholder
                for (const key of profileKeys) {
                    const caps = profiles[key];
                    if (!caps || typeof caps !== 'object')
                        continue;
                    const nonCommentEntries = Object.entries(caps).filter(([k]) => !k.startsWith('_'));
                    const allPlaceholders = nonCommentEntries.every(([, v]) => typeof v === 'string' && v.startsWith('CONFIGURE_ME'));
                    if (allPlaceholders && nonCommentEntries.length > 0) {
                        Logger.info(`[manage_config] Auto-removing placeholder profile "${key}" (all values are CONFIGURE_ME)`);
                        delete profiles[key];
                    }
                }
            }
        }
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    }
    updateAppPath(projectRoot, platform, appPath, forceWrite = false) {
        if (!fs.existsSync(appPath) && !appPath.startsWith('http') && !forceWrite) {
            Logger.warn(`appPath does not exist on disk: ${appPath}. Saving anyway (forceWrite was not set but proceeding defensively).`);
        }
        const config = this.read(projectRoot);
        for (const profileName in config.mobile.capabilitiesProfiles) {
            const profile = config.mobile.capabilitiesProfiles[profileName];
            if (profile.platformName?.toLowerCase() === platform.toLowerCase()) {
                profile['appium:app'] = appPath;
            }
        }
        this.write(projectRoot, config);
    }
    setCloudProvider(projectRoot, provider, username, accessKey) {
        const config = this.read(projectRoot);
        config.mobile.cloud = { provider, username, accessKey };
        this.write(projectRoot, config);
    }
    /** Resolves the configured paths (with defaults). */
    getPaths(config) {
        return resolvePaths(config);
    }
    /** Returns codegen config with safe defaults. */
    getCodegen(config) {
        return {
            customWrapperPackage: config.codegen?.customWrapperPackage ?? null,
            basePageStrategy: config.codegen?.basePageStrategy ?? 'extend',
            namingConvention: {
                pageObjectSuffix: config.codegen?.namingConvention?.pageObjectSuffix ?? 'Page',
                caseStyle: config.codegen?.namingConvention?.caseStyle ?? 'PascalCase'
            },
            gherkinStyle: config.codegen?.gherkinStyle ?? 'strict',
            tagTaxonomy: config.codegen?.tagTaxonomy ?? ['@smoke', '@regression'],
            generateFiles: config.codegen?.generateFiles ?? 'full'
        };
    }
    /** Returns timeout values with safe defaults. */
    getTimeouts(config) {
        return {
            elementWait: config.timeouts?.elementWait ?? 10000,
            scenarioTimeout: config.timeouts?.scenarioTimeout ?? 60000,
            connectionRetry: config.timeouts?.connectionRetry ?? 120000,
            connectionRetryCount: config.timeouts?.connectionRetryCount ?? 3,
            appiumPort: config.timeouts?.appiumPort ?? 4723,
            xmlCacheTtlMinutes: config.timeouts?.xmlCacheTtlMinutes ?? 5
        };
    }
    /** Returns self-heal config with safe defaults. */
    getSelfHeal(config) {
        return {
            confidenceThreshold: config.selfHeal?.confidenceThreshold ?? 0.7,
            maxCandidates: config.selfHeal?.maxCandidates ?? 3,
            autoApply: config.selfHeal?.autoApply ?? false
        };
    }
    /** Returns reporting config with safe defaults. */
    getReporting(config) {
        return {
            format: config.reporting?.format ?? 'html',
            outputDir: config.reporting?.outputDir ?? 'reports',
            screenshotOn: config.reporting?.screenshotOn ?? 'failure'
        };
    }
    /**
     * Returns the active test environment.
     * Priority: explicitEnv arg > config.currentEnvironment > first in environments > 'staging'
     */
    getCurrentEnvironment(config, explicitEnv) {
        if (explicitEnv)
            return explicitEnv;
        if (config.currentEnvironment)
            return config.currentEnvironment;
        if (config.environments && config.environments.length > 0)
            return config.environments[0];
        return 'staging';
    }
    /** Returns the configured environment list, or a default single-item list. */
    getEnvironments(config) {
        return config.environments ?? ['staging'];
    }
    /** Returns the credential strategy or null if not configured. */
    getCredentialStrategy(config) {
        return config.credentials ?? null;
    }
    /**
     * Set or update a named build profile (debug, staging, release, etc.).
     */
    setBuildProfile(projectRoot, name, profile) {
        const config = this.read(projectRoot);
        if (!config.builds)
            config.builds = {};
        config.builds[name] = profile;
        this.write(projectRoot, config);
    }
    /**
     * Set the active build profile (injects appPath into capabilities).
     */
    activateBuild(projectRoot, buildName) {
        const config = this.read(projectRoot);
        if (!config.builds?.[buildName]) {
            throw new Error(`Build profile "${buildName}" not found. Available: ${Object.keys(config.builds ?? {}).join(', ')}`);
        }
        const profile = config.builds[buildName];
        config.activeBuild = buildName;
        // Inject app path into all matching capability profiles
        for (const capName in config.mobile.capabilitiesProfiles) {
            config.mobile.capabilitiesProfiles[capName]['appium:app'] = profile.appPath;
        }
        this.write(projectRoot, config);
        return `Activated build "${buildName}" — app: ${profile.appPath}${profile.serverUrl ? ', server: ' + profile.serverUrl : ''}`;
    }
    /**
     * Returns the currently active build profile.
     */
    getActiveBuild(config) {
        if (config.activeBuild && config.builds?.[config.activeBuild]) {
            return config.builds[config.activeBuild];
        }
        return undefined;
    }
}
