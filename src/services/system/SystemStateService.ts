import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/Logger.js';
import type { AppiumSessionService } from '../execution/AppiumSessionService.js';
import { FileStateService } from '../io/FileStateService.js';

export interface SystemState {
  session: {
    active: boolean;
    platform: string | null;
    deviceName: string | null;
    sessionId: string | null;
  };
  files: {
    tracked: number;
    modified: string[];
    lastModified: string | null;
  };
  tests: {
    lastRun: number | null;
    lastStatus: 'pass' | 'fail' | 'never_run';
    failCount: number;
  };
  project: {
    root: string | null;
    configValid: boolean;
  };
}

export class SystemStateService {
  private static instance: SystemStateService | null = null;
  private sessionService: AppiumSessionService | null = null;
  private lastTestRun: { time: number; status: 'pass' | 'fail' } | null = null;

  private constructor() { }

  public static getInstance(): SystemStateService {
    if (!SystemStateService.instance) {
      SystemStateService.instance = new SystemStateService();
    }
    return SystemStateService.instance;
  }

  public registerSessionService(service: AppiumSessionService): void {
    this.sessionService = service;
  }

  public recordTestRun(status: 'pass' | 'fail'): void {
    this.lastTestRun = { time: Date.now(), status };
    Logger.info(`[SystemStateService] recorded test run: ${status}`);
  }

  public getState(projectRoot?: string): SystemState {
    const fileService = FileStateService.getInstance();

    const trackedFiles = (() => {
      try {
        return fileService.getTrackedFiles();
      } catch {
        return [];
      }
    })();

    const modifiedFiles = (() => {
      try {
        return fileService.getModifiedFiles();
      } catch {
        return [];
      }
    })();

    // derive device/session info from driver/capabilities if available
    const driver = this.sessionService?.getDriver ? this.sessionService.getDriver() : null;
    const caps: any = driver ? (driver.capabilities ?? {}) : {};
    return {
      session: {
        active: this.sessionService?.isSessionActive?.() ?? false,
        platform: this.sessionService?.getPlatform?.() ?? (caps.platformName ? String(caps.platformName).toLowerCase() : null),
        deviceName: caps.deviceName ?? caps['appium:deviceName'] ?? null,
        sessionId: driver?.sessionId ?? null,
      },
      files: {
        tracked: trackedFiles.length,
        modified: modifiedFiles,
        lastModified: modifiedFiles.length > 0 ? modifiedFiles[0] : null,
      },
      tests: {
        lastRun: this.lastTestRun?.time ?? null,
        lastStatus: this.lastTestRun?.status ?? 'never_run',
        failCount: this.lastTestRun?.status === 'fail' ? 1 : 0,
      },
      project: {
        root: projectRoot ?? null,
        configValid: projectRoot ? this.isConfigValid(projectRoot) : false,
      },
    };
  }

  private isConfigValid(projectRoot: string): boolean {
    try {
      return fs.existsSync(path.join(projectRoot, 'mcp-config.json'));
    } catch (err: any) {
      Logger.warn(`[SystemStateService.isConfigValid] error checking config: ${err?.message}`);
      return false;
    }
  }
}

export default SystemStateService.getInstance();