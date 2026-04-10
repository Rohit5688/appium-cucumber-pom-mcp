import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/Logger.js';
import { McpErrors } from '../types/ErrorSystem.js';
import { Questioner } from '../utils/Questioner.js';

export interface CodegenConfig {
  /**
   * If your team has a shared base Page Object package (e.g., '@myorg/test-utils'),
   * set this. AppForge will import from it instead of generating BasePage.ts.
   */
  customWrapperPackage?: string | null;

  /**
   * How generated Page Objects inherit from BasePage.
   * "extend" = class LoginPage extends BasePage (default)
   * "compose" = BasePage methods injected, no class inheritance
   * "custom" = LLM uses your existing pattern
   */
  basePageStrategy?: 'extend' | 'compose' | 'custom';

  namingConvention?: {
    /**
     * Suffix for generated Page Object files/classes.
     * "Page" → LoginPage.ts | "Screen" → LoginScreen.ts
     */
    pageObjectSuffix?: 'Page' | 'Screen' | 'Component' | 'Flow';
    /** "PascalCase" → LoginPage | "camelCase" → loginPage */
    caseStyle?: 'PascalCase' | 'camelCase';
  };

  /**
   * "strict" = enforce Given/When/Then in feature files
   * "flexible" = LLM uses best judgment on step keywords
   */
  gherkinStyle?: 'strict' | 'flexible';

  /**
   * Valid tags for this project. LLM will only use tags from this list.
   * Match your test management system (Jira Xray, TestRail, etc.) tag names.
   */
  tagTaxonomy?: string[];

  /**
   * Which files to generate in generate_cucumber_pom.
   * "full" = feature + steps + page object (default)
   * "feature-steps" = feature + steps only (you write page objects)
   * "feature-only" = only the Gherkin feature file
   */
  generateFiles?: 'full' | 'feature-steps' | 'feature-only';
}

export interface TimeoutsConfig {
  /** Default wait for elements in ActionUtils/WaitUtils (ms). Default: 10000 */
  elementWait?: number;
  /** Cucumber scenario timeout (ms). Default: 60000 */
  scenarioTimeout?: number;
  /** WebdriverIO connection retry timeout (ms). Default: 120000 */
  connectionRetry?: number;
  /** WebdriverIO connection retry count. Default: 3 */
  connectionRetryCount?: number;
  /** Appium server port. Default: 4723 */
  appiumPort?: number;
  /** How long to cache page XML from inspect_ui (minutes). Default: 5 */
  xmlCacheTtlMinutes?: number;
}

export interface SelfHealConfig {
  /** Minimum confidence (0.0–1.0) to include a selector candidate. Default: 0.7 */
  confidenceThreshold?: number;
  /** How many replacement candidates to show. Default: 3 */
  maxCandidates?: number;
  /** If true, auto-apply the highest-confidence candidate. Default: false */
  autoApply?: boolean;
}

export interface ReportingConfig {
  /** Report format. Default: "html" */
  format?: 'html' | 'allure' | 'junit' | 'none';
  /** Output directory for reports. Default: "reports" */
  outputDir?: string;
  /** When to capture screenshots. Default: "failure" */
  screenshotOn?: 'failure' | 'always' | 'never';
}

export interface McpConfig {
  $schema?: string;
  version?: string;
  schemaVersion?: string;
  project: {
    language: string;
    testFramework: string;
    client: string;
    executionCommand?: string;
  };
  mobile: {
    defaultPlatform: string;
    capabilitiesProfiles: Record<string, any>;
    cloud?: {
      provider: 'browserstack' | 'saucelabs' | 'none';
      username?: string;
      accessKey?: string;
    };
  };
  paths?: {
    featuresRoot?: string;
    pagesRoot?: string;
    stepsRoot?: string;
    utilsRoot?: string;
    locatorsRoot?: string;
    testDataRoot?: string;
    credentialsRoot?: string;
    reportsRoot?: string;
    configRoot?: string; 
  };
  execution?: {
    timeoutMs?: number;
    reportPath?: string;
  };
  reuse?: {
    locatorOrder?: string[];
  };
  builds?: Record<string, BuildProfile>;
  activeBuild?: string;

  /** Code generation style preferences. See docs/MCP_CONFIG_REFERENCE.md for details. */
  codegen?: CodegenConfig;

  /** Timeout values used in generated test files and tools. */
  timeouts?: TimeoutsConfig;

  /** Self-healing selector behavior. */
  selfHeal?: SelfHealConfig;

  /** Test reporting format and behavior. */
  reporting?: ReportingConfig;

  /**
   * Relative path to the TypeScript config file for this project.
   * When set, this path is ALWAYS passed as `--tsconfig <path>` to TypeScript
   * compilation steps (SandboxEngine, validate_and_write).
   * User-supplied — no auto-detection. Leave null to use runner defaults.
   * Example: "tsconfig.json" | "config/tsconfig.test.json"
   */
  tsconfigPath?: string | null;

  /**
   * Project-specific config files that AppForge tools should read and inject
   * into their LLM context during planning, generation, and healing.
   *
   * Each entry: the tool reads the file, parses it, prepends it to the prompt.
   * Tools ONLY read files whose operation name is in `injectInto`.
   *
   * Use for: device capability overrides YAML, feature flags, remote config files.
   * Use `repoContext` for: static team conventions, architecture decisions.
   *
   * See TestForge docs/issues/project-extensions-design.md for full design.
   */
  projectExtensions?: Array<{
    name: string;
    description: string;           // MANDATORY — LLM instruction on how to use this file
    path: string;                  // relative to projectRoot
    format?: 'yaml' | 'json' | 'text' | 'env';
    injectInto: Array<'generate' | 'analyze' | 'heal' | 'run' | 'check'>;
    maxLines?: number;             // for text/log files, default 100
    required?: boolean;            // check_environment FAILs if missing, default false
  }>;
  /**
   * The list of test environment names for this project.
   * User-defined (e.g. ["local", "integration", "staging", "prod"]).
   * Validated against currentEnvironment on manage_config write.
   */
  environments?: string[];

  /**
   * The environment currently under test.
   * Tools that read/write env-specific files (users.{env}.json, credentials lookups)
   * use this as the default when no explicit env is provided.
   */
  currentEnvironment?: string;

  /**
   * Credential storage strategy for this project.
   * Controls how manage_users creates and reads credential files.
   * Strategy is user-selected; the reader is LLM-generated at generate_cucumber_pom time.
   */
  credentials?: {
    /**
     * 'role-env-matrix' — credentials[role][env] in single file (see paths.credentialsRoot/users.json)
     * 'per-env-files'   — <paths.credentialsRoot>/users.{env}.json per environment
     * 'unified-key'     — credentials['{role}-{env}'] in single file (see paths.credentialsRoot/users.json)
     * 'custom'          — user-defined; schemaHint describes the format
     */
    strategy: 'role-env-matrix' | 'per-env-files' | 'unified-key' | 'custom';

    /** Path to the credential file (relative to projectRoot). Default: 'src/credentials/users.json' (override with paths.credentialsRoot) */
    file?: string;

    /** For strategy='custom': plain-English description of the JSON structure, used in LLM prompts */
    schemaHint?: string;
  };
}

export interface BuildProfile {
  appPath: string;
  bundleId?: string;
  serverUrl?: string;
  env?: string;
}

/**
 * Returns safe default paths merged with config paths.
 * ALL paths are relative to PROJECT ROOT for consistency.
 * Users can customize to any structure: 'src/features', 'test/e2e', 'features', etc.
 */
function resolvePaths(config: McpConfig) {
  return {
    featuresRoot: config.paths?.featuresRoot || 'src/features',
    pagesRoot: config.paths?.pagesRoot || 'src/pages',
    stepsRoot: config.paths?.stepsRoot || 'src/step-definitions',
    utilsRoot: config.paths?.utilsRoot || 'src/utils',
    locatorsRoot: config.paths?.locatorsRoot || 'src/locators',
    testDataRoot: config.paths?.testDataRoot || 'src/test-data',
    credentialsRoot: config.paths?.credentialsRoot || 'src/credentials',
    reportsRoot: config.paths?.reportsRoot || 'reports',
    configRoot: config.paths?.configRoot || 'src/config'  // ADD THIS LINE
  };
}


export class McpConfigService {
  private readonly configFileName = 'mcp-config.json';
  private readonly CURRENT_VERSION = '1.1.0';

  public read(projectRoot: string): McpConfig {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return raw as McpConfig;
    } catch (error: any) {
      throw McpErrors.schemaValidationFailed(`Failed to parse mcp-config.json: ${error.message}. Fix the JSON syntax error.`, 'manage_config');
    }
  }

  /**
   * Migrates an old-format mcp-config.json to the current schema version.
   * Call ONLY from setup_project and upgrade_project — NOT from read().
   * All other callers use read() for pure data access with zero side effects.
   */
  public migrateIfNeeded(projectRoot: string): void {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      // Idempotent skip: already migrated
      if (raw.version === this.CURRENT_VERSION && raw.schemaVersion) return;

      // Ensure .AppForge exists for backups/logs
      const appForgeDir = path.join(projectRoot, '.AppForge');
      if (!fs.existsSync(appForgeDir)) fs.mkdirSync(appForgeDir, { recursive: true });

      // Create backup before mutating
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `mcp-config.backup.${ts}.json`;
      const backupPath = path.join(appForgeDir, backupName);
      fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2), 'utf8');

      // -------------- Normalization & Defaults --------------
      // Ensure paths object exists
      raw.paths = raw.paths || {};

      // 1) Normalize legacy bare paths: if user set e.g. "features": "features"
      //    but project has src/<value>, prefer 'src/<value>' to preserve expectation.
      const pathKeys = ['featuresRoot','pagesRoot','stepsRoot','utilsRoot','locatorsRoot','testDataRoot','credentialsRoot','reportsRoot','configRoot'];
      for (const k of pathKeys) {
        const v = raw.paths[k];
        if (typeof v === 'string' && v.length > 0) {
          // if not absolute and doesn't already start with 'src/' check for src/<v>
          if (!path.isAbsolute(v) && !v.startsWith('src/')) {
            const candidate = path.join(projectRoot, 'src', v);
            try {
              if (fs.existsSync(candidate)) {
                // store relative form 'src/<v>' to keep config consistent
                raw.paths[k] = path.join('src', v).replace(/\\/g, '/');
              }
            } catch {
              // ignore fs errors; leave user value as-is
            }
          }
        }
      }

      // 2) Fill missing path keys with resolvePaths defaults (non-destructive)
      const defaults = resolvePaths(raw as McpConfig);
      for (const [key, defVal] of Object.entries(defaults)) {
        if (!raw.paths[key]) {
          raw.paths[key] = defVal;
        }
      }

      // 3) Update version/schema metadata and $schema pointer
      raw.version = this.CURRENT_VERSION;
      if (!raw.schemaVersion) raw.schemaVersion = '1.0';
      raw.$schema = './.AppForge/configSchema.json';

      // Persist changes
      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');

      // Generate schema file to support IDE autocompletion (no-op if exists)
      this.generateSchema(projectRoot);

      // Append migration log
      const logPath = path.join(appForgeDir, 'migration.log');
      const logLine = `${new Date().toISOString()} Migrated mcp-config.json -> version=${raw.version} schemaVersion=${raw.schemaVersion} (backup: ${backupName})\n`;
      fs.appendFileSync(logPath, logLine, 'utf8');
      Logger.info(`[migrateIfNeeded] normalization applied; backup: ${backupName}`);

    } catch (error: any) {
      // If JSON is invalid, leave file untouched — read() will surface the error to the caller.
      Logger.warn(`[migrateIfNeeded] skipped migration due to error parsing mcp-config.json: ${error?.message}`);
    }
  }

  /**
   * Generates a JSON schema file for IDE autocompletion.
   */
  private generateSchema(projectRoot: string) {
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
   * Public wrapper to ensure the config schema file exists.
   * Safe to call idempotently after creating or migrating mcp-config.json.
   */
  public ensureSchema(projectRoot: string): void {
    try {
      this.generateSchema(projectRoot);
    } catch (err: any) {
      Logger.warn(`[ensureSchema] failed to generate schema: ${err?.message}`);
    }
  }

  /**
   * Recursively merges `source` into `target`.
   * Arrays are replaced (not concatenated) — this matches config update expectations.
   * Primitives in source always overwrite target.
   */
  private static deepMerge(target: any, source: any): any {
    // Null/undefined source → keep target unchanged
    if (source === null || source === undefined) return target;
    // Non-object source → source replaces target
    if (typeof source !== 'object' || Array.isArray(source)) return source;
    // Both objects → merge recursively
    const output: any = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target?.[key] !== null &&
        typeof target?.[key] === 'object' &&
        !Array.isArray(target?.[key])
      ) {
        output[key] = McpConfigService.deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  public write(projectRoot: string, config: Partial<McpConfig>): void {
    const configPath = path.join(projectRoot, this.configFileName);
    let existingConfig: any = {};
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
          Object.values(caps).some((v: any) => typeof v !== 'string' || !v.startsWith('CONFIGURE_ME'));
      }).length;

      if (realProfileCount > 0) {
        // Remove any profiles where every string value is a CONFIGURE_ME placeholder
        for (const key of profileKeys) {
          const caps = profiles[key];
          if (!caps || typeof caps !== 'object') continue;
          const nonCommentEntries = Object.entries(caps).filter(([k]) => !k.startsWith('_'));
          const allPlaceholders = nonCommentEntries.every(([, v]) =>
            typeof v === 'string' && v.startsWith('CONFIGURE_ME')
          );
          if (allPlaceholders && nonCommentEntries.length > 0) {
            Logger.info(`[manage_config] Auto-removing placeholder profile "${key}" (all values are CONFIGURE_ME)`);
            delete profiles[key];
          }
        }
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
  }

  public updateAppPath(projectRoot: string, platform: 'android' | 'ios', appPath: string, forceWrite: boolean = false): void {
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

  public setCloudProvider(projectRoot: string, provider: 'browserstack' | 'saucelabs' | 'none', username?: string, accessKey?: string): void {
    const config = this.read(projectRoot);
    config.mobile.cloud = { provider, username, accessKey };
    this.write(projectRoot, config);
  }

  /** Resolves the configured paths (with defaults). */
  public getPaths(config: McpConfig) {
    return resolvePaths(config);
  }

  /** Returns codegen config with safe defaults. */
  public getCodegen(config: McpConfig): Required<CodegenConfig> {
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
  public getTimeouts(config: McpConfig): Required<TimeoutsConfig> {
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
  public getSelfHeal(config: McpConfig): Required<SelfHealConfig> {
    return {
      confidenceThreshold: config.selfHeal?.confidenceThreshold ?? 0.7,
      maxCandidates: config.selfHeal?.maxCandidates ?? 3,
      autoApply: config.selfHeal?.autoApply ?? false
    };
  }

  /** Returns reporting config with safe defaults. */
  public getReporting(config: McpConfig): Required<ReportingConfig> {
    return {
      format: config.reporting?.format ?? 'html',
      outputDir: config.reporting?.outputDir ?? 'reports',
      screenshotOn: config.reporting?.screenshotOn ?? 'failure'
    };
  }

  /**
   * Returns whether a named feature flag is enabled for the given project.
   * Reads mcp-config.json and returns false on any error (safe default).
   */
  public hasFeature(projectRoot: string, featureName: string): boolean {
    try {
      const cfg = this.read(projectRoot);
      return Boolean((cfg as any)?.features && (cfg as any).features[featureName]);
    } catch {
      return false;
    }
  }

  /**
   * Returns the active test environment.
   * Priority: explicitEnv arg > config.currentEnvironment > first in environments > 'staging'
   */
  public getCurrentEnvironment(config: McpConfig, explicitEnv?: string): string {
    if (explicitEnv) return explicitEnv;
    if (config.currentEnvironment) return config.currentEnvironment;
    if (config.environments && config.environments.length > 0) return config.environments[0];
    return 'staging';
  }

  /** Returns the configured environment list, or a default single-item list. */
  public getEnvironments(config: McpConfig): string[] {
    return config.environments ?? ['staging'];
  }

  /** Returns the credential strategy or null if not configured. */
  public getCredentialStrategy(config: McpConfig): McpConfig['credentials'] | null {
    return config.credentials ?? null;
  }

  /**
   * Set or update a named build profile (debug, staging, release, etc.).
   */
  public setBuildProfile(projectRoot: string, name: string, profile: BuildProfile): void {
    const config = this.read(projectRoot);
    if (!config.builds) config.builds = {};
    config.builds[name] = profile;
    this.write(projectRoot, config);
  }

  /**
   * Set the active build profile (injects appPath into capabilities).
   */
  public activateBuild(projectRoot: string, buildName: string): string {
    const config = this.read(projectRoot);
    if (!config.builds?.[buildName]) {
      throw McpErrors.invalidParameter('buildName', `Build profile "${buildName}" not found. Available: ${Object.keys(config.builds ?? {}).join(', ')}`, 'manage_config');
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
  public getActiveBuild(config: McpConfig): BuildProfile | undefined {
    if (config.activeBuild && config.builds?.[config.activeBuild]) {
      return config.builds[config.activeBuild];
    }
    return undefined;
  }

  /**
   * JSON-aware edit: Delete a key by JSON path (e.g., 'mobile.capabilitiesProfiles.myDevice')
   * Returns true if the key was found and deleted, false otherwise.
   */
  public deleteJsonKey(projectRoot: string, jsonPath: string): boolean {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pathParts = jsonPath.split('.');
    
    // Navigate to parent object
    let current: any = config;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) return false;
      current = current[pathParts[i]];
    }
    
    // Delete the final key
    const lastKey = pathParts[pathParts.length - 1];
    if (!(lastKey in current)) return false;
    
    delete current[lastKey];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  }

  /**
   * JSON-aware edit: Upsert a value by JSON path (e.g., 'mobile.capabilitiesProfiles.pixel8')
   * Creates intermediate objects if they don't exist.
   */
  public upsertJsonPath(projectRoot: string, jsonPath: string, value: any): void {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pathParts = jsonPath.split('.');
    
    // Navigate to parent, creating objects as needed
    let current: any = config;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const key = pathParts[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    const lastKey = pathParts[pathParts.length - 1];
    current[lastKey] = value;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * JSON-aware edit: Get a value by JSON path (e.g., 'mobile.defaultPlatform')
   * Returns undefined if the path doesn't exist.
   */
  public getJsonPath(projectRoot: string, jsonPath: string): any {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pathParts = jsonPath.split('.');
    
    let current: any = config;
    for (const part of pathParts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
}
