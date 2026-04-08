# TASK-GS-19 — Local Healer Cache (SQLite Locator Fix Cache)

**Status**: TODO (Conditional — implement if healing failure rate > 20%)  
**Effort**: Medium (~90 min)  
**Depends on**: GS-12 (Max Turns Guard), GS-05 (Error Taxonomy)  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

> ⚠️ **Decision Point**: Only implement this task if usage data shows >20% healing failure rate, OR if you observe the same locator being re-healed repeatedly across sessions.

When a locator breaks and is subsequently healed, that fix is thrown away at session end. If the same locator breaks again (e.g., after an app update that partially reverts), the agent re-runs the entire LLM-powered healing process at full cost.

**Solution**: Persist healed locator pairs to a SQLite database so they can be reused without an LLM call.

**Expected savings**: 70% reduction in latency for repeated locator failures. Healing with cache: ~50ms. Healing with LLM: ~3000ms + 2000 tokens.

---

## What to Create

### File: `src/services/HealerCacheService.ts` (NEW)

```typescript
import * as path from 'path';
import * as fs from 'fs';

/**
 * A healed locator pair with metadata.
 */
export interface HealedLocator {
  id?: number;
  originalLocator: string;      // The broken locator
  fixedLocator: string;         // The working replacement
  confidence: number;           // 0.0 to 1.0
  platform: 'android' | 'ios';
  screenName?: string;
  healedAt: string;             // ISO timestamp
  lastVerifiedAt: string;       // ISO timestamp of last successful use
  useCount: number;             // How many times this fix was reused
}

/**
 * HealerCacheService — persists healed locator pairs to SQLite.
 *
 * Database: .AppForge/heal-cache.db
 *
 * USAGE:
 *   const cache = HealerCacheService.getInstance();
 *   const cached = cache.lookup('~login_btn', 'android');
 *   if (cached) {
 *     // Use cached.fixedLocator directly — no LLM call needed
 *   } else {
 *     const fixed = await healWithLLM(...);
 *     cache.store({ originalLocator: '~login_btn', fixedLocator: fixed, ... });
 *   }
 */
export class HealerCacheService {
  private static instance: HealerCacheService;

  private db: any = null; // better-sqlite3 instance
  private readonly DB_PATH: string;
  private isAvailable: boolean = false;

  private constructor() {
    const appForgeDir = path.join(process.cwd(), '.AppForge');
    this.DB_PATH = path.join(appForgeDir, 'heal-cache.db');
    this.initialize(appForgeDir);
  }

  public static getInstance(): HealerCacheService {
    if (!HealerCacheService.instance) {
      HealerCacheService.instance = new HealerCacheService();
    }
    return HealerCacheService.instance;
  }

  /**
   * Looks up a cached fix for a broken locator.
   * Returns null if not found or cache is unavailable.
   *
   * @param originalLocator The broken locator to look up
   * @param platform 'android' or 'ios'
   */
  public lookup(
    originalLocator: string,
    platform: 'android' | 'ios'
  ): HealedLocator | null {
    if (!this.isAvailable || !this.db) return null;

    try {
      const row = this.db.prepare(`
        SELECT * FROM heals
        WHERE original_locator = ? AND platform = ?
        ORDER BY last_verified_at DESC
        LIMIT 1
      `).get(originalLocator, platform);

      if (!row) return null;

      return this.rowToHealedLocator(row);
    } catch {
      return null;
    }
  }

  /**
   * Stores a new healed locator pair.
   * Updates if the same original locator already exists for this platform.
   */
  public store(heal: Omit<HealedLocator, 'id' | 'healedAt' | 'lastVerifiedAt' | 'useCount'>): void {
    if (!this.isAvailable || !this.db) return;

    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        INSERT INTO heals (original_locator, fixed_locator, confidence, platform, screen_name, healed_at, last_verified_at, use_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(original_locator, platform) DO UPDATE SET
          fixed_locator = excluded.fixed_locator,
          confidence = excluded.confidence,
          last_verified_at = excluded.last_verified_at,
          use_count = use_count + 1
      `).run(
        heal.originalLocator,
        heal.fixedLocator,
        heal.confidence,
        heal.platform,
        heal.screenName ?? null,
        now,
        now
      );
    } catch { /* non-fatal */ }
  }

  /**
   * Marks a cached locator as verified (still working).
   * Updates last_verified_at and increments use_count.
   */
  public markVerified(originalLocator: string, platform: 'android' | 'ios'): void {
    if (!this.isAvailable || !this.db) return;

    try {
      this.db.prepare(`
        UPDATE heals
        SET last_verified_at = ?, use_count = use_count + 1
        WHERE original_locator = ? AND platform = ?
      `).run(new Date().toISOString(), originalLocator, platform);
    } catch { /* non-fatal */ }
  }

  /**
   * Evicts stale cache entries (last verified > 30 days ago).
   * Call this periodically (e.g., on session start).
   */
  public evictStale(maxAgeDays: number = 30): number {
    if (!this.isAvailable || !this.db) return 0;

    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

    try {
      const result = this.db.prepare(`
        DELETE FROM heals WHERE last_verified_at < ?
      `).run(cutoff);
      return result.changes;
    } catch {
      return 0;
    }
  }

  /**
   * Returns cache statistics for reporting.
   */
  public getStats(): { totalEntries: number; hitRate?: number; topPlatform?: string } {
    if (!this.isAvailable || !this.db) return { totalEntries: 0 };

    try {
      const total = this.db.prepare('SELECT COUNT(*) as c FROM heals').get()?.c ?? 0;
      const topPlatform = this.db.prepare(`
        SELECT platform, COUNT(*) as c FROM heals GROUP BY platform ORDER BY c DESC LIMIT 1
      `).get()?.platform;

      return { totalEntries: total, topPlatform };
    } catch {
      return { totalEntries: 0 };
    }
  }

  // ─── Private init ─────────────────────────────────────────────────────────

  private initialize(appForgeDir: string): void {
    try {
      // Ensure .AppForge directory exists
      if (!fs.existsSync(appForgeDir)) {
        fs.mkdirSync(appForgeDir, { recursive: true });
      }

      // Try to load better-sqlite3
      // If not installed, fall back to no-op (cache is optional)
      const Database = require('better-sqlite3');
      this.db = new Database(this.DB_PATH);

      // Create table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS heals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_locator TEXT NOT NULL,
          fixed_locator TEXT NOT NULL,
          confidence REAL DEFAULT 0.8,
          platform TEXT NOT NULL,
          screen_name TEXT,
          healed_at TEXT NOT NULL,
          last_verified_at TEXT NOT NULL,
          use_count INTEGER DEFAULT 1,
          UNIQUE(original_locator, platform)
        );

        CREATE INDEX IF NOT EXISTS idx_heals_lookup
          ON heals(original_locator, platform);
      `);

      this.isAvailable = true;
    } catch {
      // SQLite not available — degrade gracefully, cache is optional
      this.isAvailable = false;
    }
  }

  private rowToHealedLocator(row: any): HealedLocator {
    return {
      id: row.id,
      originalLocator: row.original_locator,
      fixedLocator: row.fixed_locator,
      confidence: row.confidence,
      platform: row.platform,
      screenName: row.screen_name,
      healedAt: row.healed_at,
      lastVerifiedAt: row.last_verified_at,
      useCount: row.use_count,
    };
  }
}
```

---

## What to Update

### File: `src/services/SelfHealingService.ts`

Add cache lookup at the start of the healing flow:

```typescript
import { HealerCacheService } from './HealerCacheService';

public async healTest(testPath: string, failedLocator: string, platform: 'android' | 'ios'): Promise<HealResult> {
  // ... max attempts guard (GS-12) ...

  // Check local cache first
  const cache = HealerCacheService.getInstance();
  const cached = cache.lookup(failedLocator, platform);

  if (cached) {
    console.log(`[HealerCache] Cache hit for '${failedLocator}' — reusing fix from ${cached.healedAt}`);

    // Verify the cached locator still works
    const stillWorks = await this.verifyLocator(cached.fixedLocator, platform);
    if (stillWorks) {
      cache.markVerified(failedLocator, platform);
      return {
        success: true,
        originalLocator: failedLocator,
        healedLocator: cached.fixedLocator,
        attempts: 1,
        fromCache: true,
        message: `Cache hit — healed using stored fix (confidence: ${(cached.confidence * 100).toFixed(0)}%)`,
      };
    }

    // Cache entry is stale — proceed to LLM healing
    console.log(`[HealerCache] Cached fix no longer works. Proceeding to LLM healing.`);
  }

  // ... existing LLM healing logic ...

  // After successful LLM heal, store the result:
  cache.store({
    originalLocator: failedLocator,
    fixedLocator: healedLocator,
    confidence: healingResult.candidate?.confidence ?? 0.8,
    platform,
    screenName: args.screenName,
  });
}
```

### File: `package.json`

Add `better-sqlite3` as a dependency:
```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

---

## Verification

1. Run `npm install better-sqlite3` — must succeed
2. Run `npm run build` — must pass
3. Verify `.AppForge/heal-cache.db` is created on first healing attempt
4. Test cache hit by running the same healing scenario twice:
   - First run: LLM call made, result stored
   - Second run: Cache hit, no LLM call, much faster

---

## Done Criteria

- [ ] `HealerCacheService.ts` created with SQLite-backed storage
- [ ] `better-sqlite3` added to `package.json`
- [ ] `lookup()` returns cached fix if available
- [ ] `store()` persists new heals with deduplication
- [ ] Cache integrated into `SelfHealingService` heal flow
- [ ] Stale entries evicted after 30 days
- [ ] Graceful degradation if SQLite unavailable (cache disabled, not crashed)
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Conditional task** — only implement if healing failure rate >20% in real usage
- **better-sqlite3 is synchronous** — no async overhead, perfect for fast cache lookups
- **`UNIQUE(original_locator, platform)`** — ensures one fix per locator/platform combo, no duplicates
- **Graceful degradation** is mandatory — `isAvailable = false` if SQLite fails; cache is optional, not core
- **`.AppForge/heal-cache.db` should be gitignored** — it's an operational artifact, not source code
