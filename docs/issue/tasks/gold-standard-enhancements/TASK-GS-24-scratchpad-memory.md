# TASK-GS-24 — Scratchpad Memory (Cross-Worker Knowledge Sharing)

**Status**: TODO (Low Priority — Implement only if parallel execution is added)  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — standalone directory structure  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

> ⚠️ **Decision Point**: This task has low priority. Only implement if multiple parallel agent workers need to share findings. For single-agent workflows, this adds no value.

In a multi-agent scenario (e.g., one agent analyzing UI hierarchy while another generates test data), agents cannot share intermediate findings. Each re-discovers the same information independently.

**Solution**: Create a `.agent_scratchpad/` directory structure with typed memory slots that agents can read and write. Think of it as a shared whiteboard for the current session.

**Use cases**:
- Agent 1 records: "LoginScreen has 8 elements, last scanned at turn 5"
- Agent 2 reads this and skips re-scanning
- Agent 1 notes: "Password field uses resource-id, not accessibility-id"
- Agent 3 reads this and selects the correct locator strategy

---

## What to Create

### Directory Structure

```
.agent_scratchpad/
├── README.md              ← What this directory is and how to use it
├── ui-findings/           ← UI scan results and element discoveries
│   └── {screenName}.json
├── healing-notes/         ← Notes from healing attempts
│   └── {locator-hash}.json
├── session.json           ← Current session metadata
└── shared-memory.json     ← General-purpose key-value store
```

### File: `src/services/ScratchpadService.ts` (NEW)

```typescript
import * as fs from 'fs';
import * as path from 'path';

/**
 * A named memory slot in the scratchpad.
 */
export interface ScratchpadEntry<T = any> {
  key: string;
  value: T;
  author: string;         // Which tool/agent wrote this
  timestamp: string;
  ttlMs?: number;         // Optional TTL — entry expires after this
  tags?: string[];        // For categorization/search
}

/**
 * ScratchpadService — shared memory for cross-agent knowledge sharing.
 *
 * Persists to .agent_scratchpad/ and survives process restarts within a session.
 * Entries can have TTLs for automatic cleanup.
 *
 * USAGE:
 *   const scratchpad = ScratchpadService.getInstance();
 *   // Write:
 *   scratchpad.write('ui:LoginScreen:elementCount', 8, 'inspect_ui_hierarchy');
 *   // Read:
 *   const count = scratchpad.read<number>('ui:LoginScreen:elementCount');
 *   // Find by tag:
 *   const uiFindings = scratchpad.findByTag('ui-scan');
 */
export class ScratchpadService {
  private static instance: ScratchpadService;

  private readonly SCRATCHPAD_DIR: string;
  private readonly SHARED_MEMORY_FILE: string;
  private memory: Map<string, ScratchpadEntry> = new Map();
  private isDirty: boolean = false;

  private constructor() {
    this.SCRATCHPAD_DIR = path.join(process.cwd(), '.agent_scratchpad');
    this.SHARED_MEMORY_FILE = path.join(this.SCRATCHPAD_DIR, 'shared-memory.json');
    this.initialize();
    this.loadFromDisk();
  }

  public static getInstance(): ScratchpadService {
    if (!ScratchpadService.instance) {
      ScratchpadService.instance = new ScratchpadService();
    }
    return ScratchpadService.instance;
  }

  /**
   * Writes a value to the scratchpad.
   *
   * @param key    Namespaced key, e.g. "ui:LoginScreen:elementCount"
   * @param value  Any JSON-serializable value
   * @param author Name of the tool/service writing this
   * @param ttlMs  Optional TTL in milliseconds
   */
  public write<T>(
    key: string,
    value: T,
    author: string,
    options?: { ttlMs?: number; tags?: string[] }
  ): void {
    this.evictExpired(); // Cleanup before adding

    const entry: ScratchpadEntry<T> = {
      key,
      value,
      author,
      timestamp: new Date().toISOString(),
      ttlMs: options?.ttlMs,
      tags: options?.tags,
    };

    this.memory.set(key, entry);
    this.isDirty = true;
    this.saveToDisk();
  }

  /**
   * Reads a value from the scratchpad.
   * Returns null if not found or expired.
   */
  public read<T>(key: string): T | null {
    const entry = this.memory.get(key);
    if (!entry) return null;

    // Check TTL
    if (this.isExpired(entry)) {
      this.memory.delete(key);
      this.isDirty = true;
      return null;
    }

    return entry.value as T;
  }

  /**
   * Returns all entries matching a tag.
   */
  public findByTag(tag: string): ScratchpadEntry[] {
    this.evictExpired();
    return [...this.memory.values()].filter(e => e.tags?.includes(tag));
  }

  /**
   * Returns all keys matching a prefix.
   * e.g. findByPrefix('ui:LoginScreen') → all entries for that screen
   */
  public findByPrefix(prefix: string): ScratchpadEntry[] {
    this.evictExpired();
    return [...this.memory.values()].filter(e => e.key.startsWith(prefix));
  }

  /**
   * Deletes a specific entry.
   */
  public delete(key: string): void {
    this.memory.delete(key);
    this.isDirty = true;
    this.saveToDisk();
  }

  /**
   * Clears all entries and deletes the directory contents.
   * Call on new session start.
   */
  public clear(): void {
    this.memory.clear();
    this.isDirty = false;
    try {
      if (fs.existsSync(this.SHARED_MEMORY_FILE)) {
        fs.unlinkSync(this.SHARED_MEMORY_FILE);
      }
    } catch { /* non-fatal */ }
  }

  /**
   * Returns a summary of current scratchpad contents.
   */
  public getSummary(): string {
    this.evictExpired();
    const count = this.memory.size;
    if (count === 0) return 'Scratchpad is empty.';

    const entries = [...this.memory.values()].map(e =>
      `  ${e.key}: ${JSON.stringify(e.value).substring(0, 60)} (by ${e.author})`
    );
    return `Scratchpad (${count} entries):\n${entries.join('\n')}`;
  }

  /** Writes a namespaced UI finding for a specific screen */
  public recordUiFinding(screenName: string, data: object, author: string): void {
    this.write(`ui:${screenName}`, data, author, {
      ttlMs: 30 * 60 * 1000, // 30 minutes
      tags: ['ui-scan'],
    });
  }

  /** Looks up a stored UI finding for a screen */
  public getUiFinding(screenName: string): object | null {
    return this.read<object>(`ui:${screenName}`);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private initialize(): void {
    try {
      if (!fs.existsSync(this.SCRATCHPAD_DIR)) {
        fs.mkdirSync(this.SCRATCHPAD_DIR, { recursive: true });
      }

      // Create subdirectories
      for (const dir of ['ui-findings', 'healing-notes']) {
        const subDir = path.join(this.SCRATCHPAD_DIR, dir);
        if (!fs.existsSync(subDir)) {
          fs.mkdirSync(subDir, { recursive: true });
        }
      }

      // Create README if not exists
      const readmePath = path.join(this.SCRATCHPAD_DIR, 'README.md');
      if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, [
          '# Agent Scratchpad',
          '',
          'This directory is a shared memory space for AppForge agents.',
          'It persists within a session and is cleared on new session start.',
          '',
          '## Structure',
          '- `shared-memory.json` — General-purpose key-value store',
          '- `ui-findings/` — UI scan results per screen',
          '- `healing-notes/` — Healing attempt notes',
          '',
          '## Important',
          'Do not manually edit these files during an active agent session.',
          'They are cleared automatically at session start.',
          '',
          '*Auto-generated by AppForge ScratchpadService*',
        ].join('\n'), 'utf-8');
      }
    } catch { /* non-fatal */ }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.SHARED_MEMORY_FILE)) {
        const data = JSON.parse(fs.readFileSync(this.SHARED_MEMORY_FILE, 'utf-8'));
        if (Array.isArray(data)) {
          for (const entry of data) {
            if (!this.isExpired(entry)) {
              this.memory.set(entry.key, entry);
            }
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  private saveToDisk(): void {
    if (!this.isDirty) return;
    try {
      const data = [...this.memory.values()];
      fs.writeFileSync(this.SHARED_MEMORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;
    } catch { /* non-fatal */ }
  }

  private isExpired(entry: ScratchpadEntry): boolean {
    if (!entry.ttlMs) return false;
    const age = Date.now() - new Date(entry.timestamp).getTime();
    return age > entry.ttlMs;
  }

  private evictExpired(): void {
    let evicted = false;
    for (const [key, entry] of this.memory.entries()) {
      if (this.isExpired(entry)) {
        this.memory.delete(key);
        evicted = true;
      }
    }
    if (evicted) {
      this.isDirty = true;
      this.saveToDisk();
    }
  }
}
```

---

## What to Update

### File: `src/index.ts`

Reset scratchpad on new session start:

```typescript
import { ScratchpadService } from './services/ScratchpadService';

// In start_appium_session handler, after session starts:
ScratchpadService.getInstance().clear();
```

Add `read_scratchpad` and `write_scratchpad` tools (optional):

```typescript
{
  name: 'read_scratchpad',
  description: 'Read a value from the shared agent scratchpad memory.',
  inputSchema: { properties: { key: { type: 'string' } }, required: ['key'] }
},
{
  name: 'write_scratchpad',
  description: 'Write a value to the shared agent scratchpad memory.',
  inputSchema: {
    properties: {
      key: { type: 'string' },
      value: { type: 'string', description: 'JSON string value to store' },
      ttlMinutes: { type: 'number', description: 'Optional TTL in minutes' }
    },
    required: ['key', 'value']
  }
}
```

### File: `.gitignore`

```
.agent_scratchpad/
```

---

## Verification

1. Run `npm run build` — must pass

2. Test roundtrip:
   ```typescript
   import { ScratchpadService } from './src/services/ScratchpadService';

   const pad = ScratchpadService.getInstance();
   pad.clear();

   pad.write('test:key1', { count: 42 }, 'test-tool');
   const read = pad.read<{ count: number }>('test:key1');
   console.assert(read?.count === 42, 'Roundtrip failed');

   // Test TTL expiry
   pad.write('test:key2', 'expires', 'test-tool', { ttlMs: 1 });
   await new Promise(r => setTimeout(r, 5));
   const expired = pad.read('test:key2');
   console.assert(expired === null, 'TTL not working');

   console.log('ScratchpadService tests passed');
   console.log(pad.getSummary());
   ```

3. Verify `.agent_scratchpad/` created with README and subdirectories

---

## Done Criteria

- [ ] `ScratchpadService.ts` created with `write()`, `read()`, `findByTag()`, `clear()`
- [ ] `.agent_scratchpad/` structure created with README and `ui-findings/`, `healing-notes/`
- [ ] TTL-based expiration works correctly
- [ ] Scratchpad cleared on `start_appium_session`
- [ ] `read_scratchpad` and `write_scratchpad` tools added (optional)
- [ ] `.agent_scratchpad/` added to `.gitignore`
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Single-agent value** — even without parallel workers, the scratchpad reduces re-scanning. Agents can check `ui:LoginScreen` before re-calling `inspect_ui_hierarchy`
- **JSON storage** is kept simple — SQLite would be overkill for this use case
- **TTL is optional** — entries without TTL persist until `clear()` is called
- **Auto-cleared on session start** — prevents stale data from previous sessions affecting new ones
- **The README in `.agent_scratchpad/`** helps humans understand what the directory is if they browse the project
