import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import SystemStateService from '../services/system/SystemStateService.js';
import * as FileStateModule from '../services/io/FileStateService.js';

describe('SystemStateService integration', () => {
  it('should integrate with mocked AppiumSessionService and FileStateService and report state', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-state-'));
    try {
      // create a dummy mcp-config.json to make configValid true
      fs.writeFileSync(path.join(tmp, 'mcp-config.json'), JSON.stringify({ project: { language: 'typescript' }, mobile: { defaultPlatform: 'android', capabilitiesProfiles: {} } }));

      // mock AppiumSessionService
      const mockAppium: any = {
        isSessionActive: () => true,
        getPlatform: () => 'android',
        getDeviceName: () => 'Pixel-7',
        getDriver: () => ({ sessionId: 'sess-123' })
      };

      // mock FileStateService instance
      const mockFileService: any = {
        getTrackedFiles: () => ['a.ts', 'b.ts', 'c.ts'],
        getModifiedFiles: () => ['b.ts'],
      };

      // monkeypatch FileStateService.getInstance to return our mock
      const originalGetInstance = (FileStateModule as any).FileStateService.getInstance;
      (FileStateModule as any).FileStateService.getInstance = () => mockFileService;

      // register session service and record a test run
      SystemStateService.registerSessionService?.(mockAppium as any);
      SystemStateService.recordTestRun?.('pass');

      const state = SystemStateService.getState(tmp);

      assert.strictEqual(state.session.active, true);
      assert.strictEqual(state.session.platform, 'android');
      assert.strictEqual(state.session.sessionId, 'sess-123');

      assert.strictEqual(state.files.tracked, 3);
      assert.deepStrictEqual(state.files.modified, ['b.ts']);

      assert.strictEqual(state.tests.lastStatus, 'pass');
      assert.ok(state.project.configValid);

      // restore
      (FileStateModule as any).FileStateService.getInstance = originalGetInstance;
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });
});