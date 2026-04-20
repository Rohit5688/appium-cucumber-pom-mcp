import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/Logger.js';
import type { McpConfig } from './ConfigSchema.js';
import { resolvePaths } from './ConfigSchema.js';

export class ConfigMigration {
  private readonly configFileName = 'mcp-config.json';
  private readonly CURRENT_VERSION = '1.1.0';

  constructor(private facade: any) {}

  public migrateIfNeeded(projectRoot: string): void {
    const configPath = path.join(projectRoot, this.configFileName);
    if (!fs.existsSync(configPath)) return;

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (raw.version === this.CURRENT_VERSION && raw.schemaVersion) return;

      const appForgeDir = path.join(projectRoot, '.AppForge');
      if (!fs.existsSync(appForgeDir)) fs.mkdirSync(appForgeDir, { recursive: true });

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `mcp-config.backup.${ts}.json`;
      const backupPath = path.join(appForgeDir, backupName);
      fs.writeFileSync(backupPath, JSON.stringify(raw, null, 2), 'utf8');

      raw.paths = raw.paths || {};

      const pathKeys = ['featuresRoot','pagesRoot','stepsRoot','utilsRoot','locatorsRoot','testDataRoot','credentialsRoot','reportsRoot','configRoot'];
      for (const k of pathKeys) {
        const v = raw.paths[k];
        if (typeof v === 'string' && v.length > 0) {
          if (!path.isAbsolute(v) && !v.startsWith('src/')) {
            const candidate = path.join(projectRoot, 'src', v);
            try {
              if (fs.existsSync(candidate)) {
                raw.paths[k] = path.join('src', v).replace(/\\/g, '/');
              }
            } catch {
              // ignore
            }
          }
        }
      }

      const defaults = resolvePaths(raw as McpConfig);
      for (const [key, defVal] of Object.entries(defaults)) {
        if (!raw.paths[key]) {
          raw.paths[key] = defVal;
        }
      }

      raw.version = this.CURRENT_VERSION;
      if (!raw.schemaVersion) raw.schemaVersion = '1.0';
      raw.$schema = './.AppForge/configSchema.json';

      fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');

      this.facade.schema.generateSchema(projectRoot);

      const logPath = path.join(appForgeDir, 'migration.log');
      const logLine = `${new Date().toISOString()} Migrated mcp-config.json -> version=${raw.version} schemaVersion=${raw.schemaVersion} (backup: ${backupName})\n`;
      fs.appendFileSync(logPath, logLine, 'utf8');
      Logger.info(`[migrateIfNeeded] normalization applied; backup: ${backupName}`);

    } catch (error: any) {
      Logger.warn(`[migrateIfNeeded] skipped migration due to error parsing mcp-config.json: ${error?.message}`);
    }
  }
}
