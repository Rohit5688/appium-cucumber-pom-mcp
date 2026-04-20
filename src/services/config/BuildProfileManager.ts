import fs from 'fs';
import path from 'path';
import { McpErrors } from '../../types/ErrorSystem.js';
import type { BuildProfile } from './ConfigSchema.js';

export class BuildProfileManager {
  private readonly configFileName = 'mcp-config.json';

  constructor(private facade: any) {}

  public setBuildProfile(projectRoot: string, name: string, profile: BuildProfile): void {
    const config = this.facade.read(projectRoot);
    if (!config.builds) config.builds = {};
    config.builds[name] = profile;
    this.facade.write(projectRoot, config);
  }

  public activateBuild(projectRoot: string, buildName: string): string {
    const config = this.facade.read(projectRoot);
    if (!config.builds?.[buildName]) {
      throw McpErrors.invalidParameter('buildName', `Build profile "${buildName}" not found. Available: ${Object.keys(config.builds ?? {}).join(', ')}`, 'manage_config');
    }
    const profile = config.builds[buildName];
    config.activeBuild = buildName;

    for (const capName in config.mobile.capabilitiesProfiles) {
      if (config.mobile.capabilitiesProfiles[capName]) {
        config.mobile.capabilitiesProfiles[capName]['appium:app'] = profile.appPath;
      }
    }

    this.facade.write(projectRoot, config);
    return `Activated build "${buildName}" — app: ${profile.appPath}${profile.serverUrl ? ', server: ' + profile.serverUrl : ''}`;
  }

  public getActiveBuild(config: any): BuildProfile | undefined {
    if (config.activeBuild && config.builds?.[config.activeBuild]) {
      return config.builds[config.activeBuild];
    }
    return undefined;
  }

  public deleteJsonKey(projectRoot: string, jsonPath: string): boolean {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pathParts = jsonPath.split('.');
    
    let current: any = config;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) return false;
      current = current[pathParts[i]];
    }
    
    const lastKey = pathParts[pathParts.length - 1];
    if (!(lastKey in current)) return false;
    
    delete current[lastKey];
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  }

  public upsertJsonPath(projectRoot: string, jsonPath: string, value: any): void {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) {
      throw McpErrors.fileNotFound(configPath, 'manage_config');
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const pathParts = jsonPath.split('.');
    
    let current: any = config;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const key = pathParts[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    const lastKey = pathParts[pathParts.length - 1];
    current[lastKey] = value;
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

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
