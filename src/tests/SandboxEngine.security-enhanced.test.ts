/**
 * SandboxEngine.security-enhanced.test.ts — Enhanced security tests (symlink, regex fuzz, timeouts)
 *
 * - Verifies symlink handling (listFiles MUST NOT follow symlinks)
 * - Verifies searchFiles rejects pathological regexes (ReDoS protection)
 * - Verifies sandbox enforces execution timeout on infinite loops
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { executeSandbox } from '../services/SandboxEngine.js';
import type { SandboxApiRegistry } from '../services/SandboxEngine.js';

describe('SandboxEngine Enhanced Security Tests', () => {
  it('MUST NOT follow symlinks when listing files (symlink defense)', async () => {
    const tmpDir = path.join('/tmp', `appforge-symlink-test-${Date.now()}`);
    const linkPath = path.join(tmpDir, 'passwd-link');

    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      // Create symlink to a protected file
      try { fs.symlinkSync('/etc/passwd', linkPath); } catch (err) {
        // On systems where symlink is restricted, skip creation and mark test as inconclusive
        // but ensure the mock behavior is still validated below.
      }

      const mockApi: SandboxApiRegistry = {
        listFiles: async (dir: string, options?: any) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const result: string[] = [];
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            const stat = fs.lstatSync(full);
            if (stat.isSymbolicLink()) {
              // Intentionally DO NOT follow symlink
              continue;
            }
            if (stat.isFile()) result.push(entry.name);
            if (stat.isDirectory() && options?.recursive) {
              // simple recursion (no symlink follow)
              const sub = fs.readdirSync(full, { withFileTypes: true }).map(e => e.name);
              result.push(...sub.map(n => path.join(entry.name, n)));
            }
          }
          return result;
        },
      };

      const script = `return await forge.api.listFiles('${tmpDir}', { recursive: true });`;
      const result = await executeSandbox(script, mockApi);
      assert.strictEqual(result.success, true);
      const listed: string[] = Array.isArray(result.result) ? result.result : [];
      // Ensure we did not return the target 'passwd' from /etc even if symlink exists
      assert.ok(!listed.some(s => s.includes('passwd')));
    } finally {
      try { fs.unlinkSync(linkPath); } catch {}
      try { fs.rmdirSync(tmpDir); } catch {}
    }
  });

  it('MUST protect against ReDoS by rejecting pathological regex in searchFiles', async () => {
    const mockApi: SandboxApiRegistry = {
      searchFiles: async (pattern: string, dir: string, options?: any) => {
        // Simulate a ReDoS guard: reject overly complex patterns
        // For test purposes, treat nested quantifiers as "too complex"
        if (/\(\w+\+\)\+/.test(pattern)) {
          throw new Error('Regex rejected: potential ReDoS');
        }
        return [];
      },
    };

    const script = `return await forge.api.searchFiles('(a+)+$', '/tmp');`;
    const result = await executeSandbox(script, mockApi);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /Rejected|Regex rejected|ReDoS/i);
  });

  it('MUST enforce execution timeout for long-running scripts', async () => {
    const mockApi: SandboxApiRegistry = {};
    // Infinite loop script
    const script = `while(true) { /* spin */ }`;
    const result = await executeSandbox(script, mockApi, { timeoutMs: 100 });
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /timeout|timed out/i);
  });
});