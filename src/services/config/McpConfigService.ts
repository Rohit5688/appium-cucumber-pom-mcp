import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/Logger.js';
import { McpErrors } from '../../types/ErrorSystem.js';
import type { 
  McpConfig, 
  CodegenConfig, 
  TimeoutsConfig, 
  SelfHealConfig, 
  ReportingConfig, 
  BuildProfile 
} from './ConfigSchema.js';
import { ConfigSchema, resolvePaths } from './ConfigSchema.js';
import { ConfigMigration } from './ConfigMigration.js';
import { BuildProfileManager } from './BuildProfileManager.js';

export type { McpConfig, CodegenConfig, TimeoutsConfig, SelfHealConfig, ReportingConfig, BuildProfile };
export { ConfigSchema, resolvePaths };

export class McpConfigService {
  private readonly configFileName = 'mcp-config.json';
  
  public readonly schema: ConfigSchema;
  public readonly migration: ConfigMigration;
  public readonly buildManager: BuildProfileManager;

  constructor() {
    this.schema = new ConfigSchema();
    this.migration = new ConfigMigration(this);
    this.buildManager = new BuildProfileManager(this);
  }

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

  public migrateIfNeeded(projectRoot: string): void {
    this.migration.migrateIfNeeded(projectRoot);
  }

  public ensureSchema(projectRoot: string): void {
    this.schema.ensureSchema(projectRoot);
  }

  private static deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (typeof source !== 'object' || Array.isArray(source)) return source;
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

    const profiles = newConfig?.mobile?.capabilitiesProfiles;
    if (profiles && typeof profiles === 'object') {
      const profileKeys = Object.keys(profiles);
      const realProfileCount = profileKeys.filter(k => {
        const caps = profiles[k];
        return caps && typeof caps === 'object' &&
          Object.values(caps).some((v: any) => typeof v !== 'string' || !v.startsWith('CONFIGURE_ME'));
      }).length;

      if (realProfileCount > 0) {
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
      if (profile && profile.platformName && profile.platformName.toLowerCase() === platform.toLowerCase()) {
        profile['appium:app'] = appPath;
      }
    }
    this.write(projectRoot, config);
  }

  public setCloudProvider(projectRoot: string, provider: 'browserstack' | 'saucelabs' | 'none', username?: string, accessKey?: string): void {
    const config = this.read(projectRoot);
    if (!config.mobile) config.mobile = {} as any;
    config.mobile.cloud = { provider, username, accessKey };
    this.write(projectRoot, config);
  }

  public getPaths(config: McpConfig) {
    return resolvePaths(config);
  }

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

  public getSelfHeal(config: McpConfig): Required<SelfHealConfig> {
    return {
      confidenceThreshold: config.selfHeal?.confidenceThreshold ?? 0.7,
      maxCandidates: config.selfHeal?.maxCandidates ?? 3,
      autoApply: config.selfHeal?.autoApply ?? false
    };
  }

  public getReporting(config: McpConfig): Required<ReportingConfig> {
    return {
      format: config.reporting?.format ?? 'html',
      outputDir: config.reporting?.outputDir ?? 'reports',
      screenshotOn: config.reporting?.screenshotOn ?? 'failure'
    };
  }

  public hasFeature(projectRoot: string, featureName: string): boolean {
    try {
      const cfg = this.read(projectRoot);
      return Boolean((cfg as any)?.features && (cfg as any).features[featureName]);
    } catch {
      return false;
    }
  }

  public getCurrentEnvironment(config: McpConfig, explicitEnv?: string): string {
    if (explicitEnv) return explicitEnv;
    if (config.currentEnvironment) return config.currentEnvironment;
    if (config.environments && config.environments.length > 0) return config.environments[0];
    return 'staging';
  }

  public getEnvironments(config: McpConfig): string[] {
    return config.environments ?? ['staging'];
  }

  public getCredentialStrategy(config: McpConfig): McpConfig['credentials'] | null {
    return config.credentials ?? null;
  }

  public setBuildProfile(projectRoot: string, name: string, profile: BuildProfile): void {
    this.buildManager.setBuildProfile(projectRoot, name, profile);
  }

  public activateBuild(projectRoot: string, buildName: string): string {
    return this.buildManager.activateBuild(projectRoot, buildName);
  }

  public getActiveBuild(config: McpConfig): BuildProfile | undefined {
    return this.buildManager.getActiveBuild(config);
  }

  public deleteJsonKey(projectRoot: string, jsonPath: string): boolean {
    return this.buildManager.deleteJsonKey(projectRoot, jsonPath);
  }

  public upsertJsonPath(projectRoot: string, jsonPath: string, value: any): void {
    this.buildManager.upsertJsonPath(projectRoot, jsonPath, value);
  }

  public getJsonPath(projectRoot: string, jsonPath: string): any {
    return this.buildManager.getJsonPath(projectRoot, jsonPath);
  }
}
