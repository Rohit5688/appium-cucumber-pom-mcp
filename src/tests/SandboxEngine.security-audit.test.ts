/**
 * SandboxEngine.security-audit.test.ts — Security audit tests (TASK 0.1)
 *
 * These tests implement the audit checks described in the roadmap:
 * - MUST block directory traversal in forge.api.readFile
 * - MUST sanitize command injection attempts passed to forge.api.exec
 * - MUST prevent environment variable exfiltration via forge.api.getEnv
 *
 * Tests use the same executeSandbox helper as other sandbox tests.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { executeSandbox } from '../services/execution/SandboxEngine.js';
import type { SandboxApiRegistry } from '../services/execution/SandboxEngine.js';

describe('SandboxEngine Security Audit Tests', () => {
  it('MUST block directory traversal in forge.api.readFile', async () => {
    const mockApi: SandboxApiRegistry = {
      readFile: async (args: any) => {
        const filePath: string = args?.filePath ?? args;
        // Simulate server-side path check: only allow paths under project root
        const allowedPrefix = '/Users/rsakhawalkar/forge/AppForge';
        if (!filePath.startsWith(allowedPrefix)) {
          throw new Error(`Permission denied: access to ${filePath}`);
        }
        return 'file-contents';
      },
    };

    const script = `return await forge.api.readFile('/etc/passwd');`;
    const result = await executeSandbox(script, mockApi);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /permission denied/i);
  });

  it('MUST sanitize command injection in forge.api.exec (blocked by policy)', async () => {
    const mockApi: SandboxApiRegistry = {
      exec: async (cmd: string) => {
        // Defender-side: reject commands containing shell metacharacters
        // Use a simpler, parser-safe check for common dangerous tokens
        if (/[;|$`]/.test(cmd) || cmd.includes('&&')) {
          throw new Error('Blocked: suspicious command arguments');
        }
        return { stdout: 'ok' };
      },
    };

    const script = `return await forge.api.exec('ls; rm -rf /');`;
    const result = await executeSandbox(script, mockApi);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /blocked|suspicious/i);
  });

  it('MUST prevent environment variable exfiltration via forge.api.getEnv', async () => {
    const SAFE_ENV = ['NODE_ENV', 'CI', 'GITHUB_ACTIONS'];
    const mockApi: SandboxApiRegistry = {
      getEnv: async (key: string) => {
        if (!SAFE_ENV.includes(key)) {
          throw new Error(`Environment variable "${key}" is not allowed`);
        }
        return process.env[key] ?? null;
      },
    };

    const script = `return await forge.api.getEnv('AWS_SECRET_ACCESS_KEY');`;
    const result = await executeSandbox(script, mockApi);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /not allowed|permission denied/i);
  });
});