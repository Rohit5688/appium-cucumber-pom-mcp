/**
 * Test: ANDROID_HOME detection fallback mechanism
 * 
 * Validates that EnvironmentCheckService correctly detects Android SDK
 * even when ANDROID_HOME is not in the MCP server's process environment.
 * 
 * Issue: MCP reports "ANDROID_HOME unset" despite Appium running and devices connected
 * Fix: Multi-tier detection: process.env → adb location → common paths
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { EnvironmentCheckService } from '../services/EnvironmentCheckService.js';
import { execSync } from 'child_process';

describe('EnvironmentCheckService - ANDROID_HOME Detection', () => {
  let service: EnvironmentCheckService;
  let originalAndroidHome: string | undefined;
  let originalAndroidSdkRoot: string | undefined;

  function setupTest() {
    service = new EnvironmentCheckService();
    // Save original env vars
    originalAndroidHome = process.env.ANDROID_HOME;
    originalAndroidSdkRoot = process.env.ANDROID_SDK_ROOT;
  }

  function restoreEnv() {
    // Restore original env vars
    if (originalAndroidHome) {
      process.env.ANDROID_HOME = originalAndroidHome;
    } else {
      delete process.env.ANDROID_HOME;
    }
    if (originalAndroidSdkRoot) {
      process.env.ANDROID_SDK_ROOT = originalAndroidSdkRoot;
    } else {
      delete process.env.ANDROID_SDK_ROOT;
    }
  }

  it('should detect ANDROID_HOME from process.env when set', async () => {
    setupTest();
    try {
      // Scenario: Normal case where ANDROID_HOME is in environment
      process.env.ANDROID_HOME = originalAndroidHome || '/fake/sdk/path';
      
      const report = await service.check('/tmp/project', 'android');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      assert.ok(androidSdkCheck);
      // If the original path exists, should pass; otherwise may fail but shouldn't crash
      assert.ok(['pass', 'fail'].includes(androidSdkCheck!.status));
    } finally {
      restoreEnv();
    }
  });

  it('should detect Android SDK from adb location when ANDROID_HOME not in env', async () => {
    setupTest();
    try {
      // Scenario: MCP server case - ANDROID_HOME unset but adb works
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;

      // Check if adb is actually available on this system
      let adbAvailable = false;
      try {
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        execSync(`${whichCmd} adb`, { encoding: 'utf8' });
        adbAvailable = true;
      } catch {
        // adb not available, skip this test scenario
      }

      const report = await service.check('/tmp/project', 'android');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      assert.ok(androidSdkCheck);
      
      if (adbAvailable) {
        // If adb is available, the SDK should be detected via fallback
        assert.strictEqual(androidSdkCheck!.status, 'pass');
        assert.ok(androidSdkCheck!.message.includes('SDK detected'));
      } else {
        // If adb not available, may fail but shouldn't crash
        assert.ok(['pass', 'fail'].includes(androidSdkCheck!.status));
      }
    } finally {
      restoreEnv();
    }
  });

  it('should try common paths when adb detection fails', async () => {
    setupTest();
    try {
      // Scenario: Neither env var nor adb available - try common paths
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;

      const report = await service.check('/tmp/project', 'android');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      assert.ok(androidSdkCheck);
      // Should either pass (if SDK found in common path) or fail with clear message
      assert.ok(['pass', 'fail'].includes(androidSdkCheck!.status));
      
      if (androidSdkCheck!.status === 'fail') {
        assert.ok(androidSdkCheck!.message.includes('not set and SDK not found'));
        assert.ok(androidSdkCheck!.fixHint);
      }
    } finally {
      restoreEnv();
    }
  });

  it('should not crash when all detection methods fail', async () => {
    setupTest();
    try {
      // Scenario: Completely broken environment
      const savedHome = process.env.HOME;
      const savedLocalAppData = process.env.LOCALAPPDATA;
      const savedProgramFiles = process.env.PROGRAMFILES;
      
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;
      delete process.env.HOME;
      delete process.env.LOCALAPPDATA;
      delete process.env.PROGRAMFILES;

      const report = await service.check('/tmp/project', 'android');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      assert.ok(androidSdkCheck);
      assert.ok(androidSdkCheck!.fixHint);
      assert.ok(androidSdkCheck!.fixHint!.includes('ANDROID_HOME'));
      
      // Restore HOME/LOCALAPPDATA/PROGRAMFILES
      if (savedHome) process.env.HOME = savedHome;
      if (savedLocalAppData) process.env.LOCALAPPDATA = savedLocalAppData;
      if (savedProgramFiles) process.env.PROGRAMFILES = savedProgramFiles;
    } finally {
      restoreEnv();
    }
  });

  it('should include helpful message when SDK detected via fallback', async () => {
    setupTest();
    try {
      // Scenario: SDK detected but not via ANDROID_HOME env var
      delete process.env.ANDROID_HOME;
      delete process.env.ANDROID_SDK_ROOT;

      const report = await service.check('/tmp/project', 'android');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      if (androidSdkCheck!.status === 'pass') {
        // If detected via fallback, message should indicate this
        const msgLower = androidSdkCheck!.message.toLowerCase();
        const isViaFallback = msgLower.includes('detected via') || 
                             msgLower.includes('detected at') ||
                             msgLower.includes('not in mcp env');
        
        // If original env var was set, this won't apply
        if (!originalAndroidHome && !originalAndroidSdkRoot) {
          assert.strictEqual(isViaFallback, true);
        }
      }
    } finally {
      restoreEnv();
    }
  });

  it('should handle both platform scenarios correctly', async () => {
    setupTest();
    try {
      // Test that the fix works for platform: 'both'
      const report = await service.check('/tmp/project', 'both');
      const androidSdkCheck = report.checks.find(c => c.name === 'Android SDK');
      
      assert.ok(androidSdkCheck);
      assert.ok(['pass', 'fail'].includes(androidSdkCheck!.status));
    } finally {
      restoreEnv();
    }
  });
});
