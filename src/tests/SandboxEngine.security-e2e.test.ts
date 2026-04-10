import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeSandbox } from '../services/SandboxEngine.js';
import type { SandboxApiRegistry } from '../services/SandboxEngine.js';

/**
 * Full E2E sandbox integration tests:
 * - create temp project with mcp-config.json enabling enhancedSandbox
 * - exercise listFiles, searchFiles, parseAST, getEnv via executeSandbox + real-like API impls
 * - verify feature-flag gating by toggling the config
 */

function writeMcpConfig(dir: string, enabled: boolean) {
  const cfg = {
    project: { language: 'typescript', testFramework: 'cucumber', client: 'webdriverio' },
    mobile: { defaultPlatform: 'android', capabilitiesProfiles: {} },
    features: { enhancedSandbox: enabled }
  };
  fs.writeFileSync(path.join(dir, 'mcp-config.json'), JSON.stringify(cfg, null, 2), 'utf8');
}

describe('SandboxEngine Full E2E Integration (feature-flag enabled)', () => {
  it('should exercise listFiles, searchFiles, parseAST, and getEnv when feature flag is ON', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-sandbox-'));
    try {
      writeMcpConfig(tmp, true);

      // create directory structure and files
      const dirA = path.join(tmp, 'dirA');
      fs.mkdirSync(dirA, { recursive: true });
      fs.writeFileSync(path.join(dirA, 'file1.txt'), 'hello world', 'utf8');
      fs.writeFileSync(path.join(tmp, 'match.ts'), `export function foo(){ return 42 }\n// MATCH_LINE\n`, 'utf8');

      // large file >1MB for parseAST size-limit check
      const largeFile = path.join(tmp, 'large.js');
      fs.writeFileSync(largeFile, 'a'.repeat(1024 * 1024 + 10), 'utf8');

      // symlink (should be ignored by listFiles)
      const target = path.join(tmp, 'dirA', 'file1.txt');
      const link = path.join(tmp, 'symlink.txt');
      try { fs.symlinkSync(target, link); } catch {}

      // implement mockApi mirroring the server-side guarded implementations
      const mockApi: SandboxApiRegistry = {
        listFiles: async (dir: string, options?: any, projectRoot?: string) => {
          const resolvedRoot = projectRoot ? path.resolve(projectRoot) : tmp;
          const cfg = JSON.parse(fs.readFileSync(path.join(resolvedRoot, 'mcp-config.json'), 'utf8'));
          if (!cfg?.features?.enhancedSandbox) throw new Error('enhancedSandbox feature disabled');

          const absDir = path.resolve(resolvedRoot, dir);
          if (!absDir.startsWith(resolvedRoot + path.sep) && absDir !== resolvedRoot) {
            throw new Error('Path traversal blocked');
          }
          const walk = (base: string, rel = ''): string[] => {
            const out: string[] = [];
            const entries = fs.readdirSync(base, { withFileTypes: true });
            for (const e of entries) {
              const full = path.join(base, e.name);
              const relPath = rel ? path.join(rel, e.name) : e.name;
              const stat = fs.lstatSync(full);
              if (stat.isSymbolicLink()) continue;
              if (stat.isFile()) out.push(relPath);
              else if (stat.isDirectory() && options?.recursive) out.push(...walk(full, relPath));
            }
            return out;
          };
          return options?.recursive ? walk(absDir, '') : fs.readdirSync(absDir).filter(n => {
            try { return !fs.lstatSync(path.join(absDir, n)).isSymbolicLink(); } catch { return false; }
          });
        },
        searchFiles: async (pattern: string, dir: string, options?: any) => {
          const projectRoot = options?.projectRoot ? path.resolve(options.projectRoot) : tmp;
          const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'mcp-config.json'), 'utf8'));
          if (!cfg?.features?.enhancedSandbox) throw new Error('enhancedSandbox feature disabled');
          if (/(?:\([^)]*\+[^)]*\)\+)/.test(pattern) || pattern.length > 200) throw new Error('Regex rejected: potential ReDoS');
          const re = new RegExp(pattern, 'gm');
          const files = await mockApi.listFiles(dir, { recursive: true, glob: options?.filePattern || '*' }, projectRoot);
          const hits: any[] = [];
          for (const f of files) {
            const full = path.join(projectRoot, f);
            try {
              const stat = fs.statSync(full);
              if (stat.size > 1024 * 1024) continue;
              const content = fs.readFileSync(full, 'utf8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i])) {
                  hits.push({ file: f, line: i + 1, text: lines[i] });
                }
              }
            } catch {}
          }
          return hits;
        },
        parseAST: async (filePath: string, options?: any) => {
          const projectRoot = options?.projectRoot ? path.resolve(options.projectRoot) : tmp;
          const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'mcp-config.json'), 'utf8'));
          if (!cfg?.features?.enhancedSandbox) throw new Error('enhancedSandbox feature disabled');
          const abs = path.resolve(projectRoot, filePath);
          if (!abs.startsWith(projectRoot + path.sep) && abs !== projectRoot) throw new Error('Path traversal blocked');
          const stats = fs.statSync(abs);
          if (stats.size > 1024 * 1024) throw new Error('File too large');
          const content = fs.readFileSync(abs, 'utf8');
          // simple "signature" extraction imitation
          const sigs: any[] = [];
          const fnMatch = content.match(/export function (\w+)/);
          if (fnMatch) sigs.push({ name: fnMatch[1], type: 'function' });
          return options?.extractSignatures ? sigs : { parsed: true };
        },
        getEnv: async (key: string) => {
          const SAFE_ENV = ['NODE_ENV', 'CI', 'GITHUB_ACTIONS', 'PLATFORM'];
          if (!SAFE_ENV.includes(key)) throw new Error(`Environment variable "${key}" is not allowed`);
          return process.env[key] ?? null;
        }
      };

      // listFiles
      const res1 = await executeSandbox(`return await forge.api.listFiles('.', { recursive: false }, '${tmp}')`, mockApi);
      assert.strictEqual(res1.success, true);
      const listed = Array.isArray(res1.result) ? res1.result : [];
      assert.ok(listed.includes('mcp-config.json') || listed.length > 0);

      // searchFiles: find MATCH_LINE in match.ts
      const res2 = await executeSandbox(`return await forge.api.searchFiles('MATCH_LINE', '.', { projectRoot: '${tmp}' })`, mockApi);
      assert.strictEqual(res2.success, true);
      assert.ok(Array.isArray(res2.result) && (res2.result as any[]).some(r => r.file && r.text && /MATCH_LINE/.test(r.text)));

      // parseAST: extract signature
      const res3 = await executeSandbox(`return await forge.api.parseAST('match.ts', { extractSignatures: true, projectRoot: '${tmp}' })`, mockApi);
      assert.strictEqual(res3.success, true);
      assert.ok(Array.isArray(res3.result) && (res3.result as any[]).some(s => s.name === 'foo'));

      // parseAST on large file should error
      const res4 = await executeSandbox(`return await forge.api.parseAST('large.js', { projectRoot: '${tmp}' })`, mockApi);
      assert.strictEqual(res4.success, false);
      assert.match(res4.error || '', /too large|File too large/i);

      // getEnv allowed
      const res5 = await executeSandbox(`return await forge.api.getEnv('NODE_ENV')`, mockApi);
      assert.strictEqual(res5.success, true);

    } finally {
      // cleanup
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });

  it('should reject sandbox APIs when feature flag is OFF', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'appforge-sandbox-'));
    try {
      writeMcpConfig(tmp, false);
      const mockApi: SandboxApiRegistry = {
        listFiles: async () => { const cfg = JSON.parse(fs.readFileSync(path.join(tmp, 'mcp-config.json'), 'utf8')); if (!cfg.features.enhancedSandbox) throw new Error('enhancedSandbox feature disabled'); return []; },
      };
      const res = await executeSandbox(`return await forge.api.listFiles('.', { recursive: false }, '${tmp}')`, mockApi);
      assert.strictEqual(res.success, false);
      assert.match(res.error || '', /enhancedSandbox feature disabled/i);
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  });
});