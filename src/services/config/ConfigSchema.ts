import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/Logger.js';

export interface CodegenConfig {
  customWrapperPackage?: string | null;
  basePageStrategy?: 'extend' | 'compose' | 'custom';
  namingConvention?: {
    pageObjectSuffix?: 'Page' | 'Screen' | 'Component' | 'Flow';
    caseStyle?: 'PascalCase' | 'camelCase';
  };
  gherkinStyle?: 'strict' | 'flexible';
  tagTaxonomy?: string[];
  generateFiles?: 'full' | 'feature-steps' | 'feature-only';
}

export interface TimeoutsConfig {
  elementWait?: number;
  scenarioTimeout?: number;
  connectionRetry?: number;
  connectionRetryCount?: number;
  appiumPort?: number;
  xmlCacheTtlMinutes?: number;
}

export interface SelfHealConfig {
  confidenceThreshold?: number;
  maxCandidates?: number;
  autoApply?: boolean;
}

export interface ReportingConfig {
  format?: 'html' | 'allure' | 'junit' | 'none';
  outputDir?: string;
  screenshotOn?: 'failure' | 'always' | 'never';
}

export interface BuildProfile {
  appPath: string;
  bundleId?: string;
  serverUrl?: string;
  env?: string;
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
  codegen?: CodegenConfig;
  timeouts?: TimeoutsConfig;
  selfHeal?: SelfHealConfig;
  reporting?: ReportingConfig;
  tsconfigPath?: string | null;
  projectExtensions?: Array<{
    name: string;
    description: string;
    path: string;
    format?: 'yaml' | 'json' | 'text' | 'env';
    injectInto: Array<'generate' | 'analyze' | 'heal' | 'run' | 'check'>;
    maxLines?: number;
    required?: boolean;
  }>;
  environments?: string[];
  currentEnvironment?: string;
  credentials?: {
    strategy: 'role-env-matrix' | 'per-env-files' | 'unified-key' | 'custom';
    file?: string;
    schemaHint?: string;
  };
}

export function resolvePaths(config: McpConfig) {
  return {
    featuresRoot: config.paths?.featuresRoot || 'src/features',
    pagesRoot: config.paths?.pagesRoot || 'src/pages',
    stepsRoot: config.paths?.stepsRoot || 'src/step-definitions',
    utilsRoot: config.paths?.utilsRoot || 'src/utils',
    locatorsRoot: config.paths?.locatorsRoot || 'src/locators',
    testDataRoot: config.paths?.testDataRoot || 'src/test-data',
    credentialsRoot: config.paths?.credentialsRoot || 'src/credentials',
    reportsRoot: config.paths?.reportsRoot || 'reports',
    configRoot: config.paths?.configRoot || 'src/config'
  };
}

export class ConfigSchema {
  public generateSchema(projectRoot: string) {
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

  public ensureSchema(projectRoot: string): void {
    try {
      this.generateSchema(projectRoot);
    } catch (err: any) {
      Logger.warn(`[ensureSchema] failed to generate schema: ${err?.message}`);
    }
  }
}
