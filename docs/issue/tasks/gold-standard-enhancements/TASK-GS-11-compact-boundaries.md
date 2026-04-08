# TASK-GS-11 — Compact Boundaries (Context Compression)

**Status**: DONE  
**Effort**: Medium (~75 min)  
**Depends on**: GS-09 (Sparse Action Map) — builds on ActionMap format  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

In a multi-screen test session, old UI scans from previous screens accumulate in the context:

```
Turn 3: LoginScreen XML — 50KB → 12,500 tokens (no longer needed)
Turn 5: DashboardScreen XML — 80KB → 20,000 tokens (no longer needed)
Turn 8: ProductListScreen XML — 200KB → 50,000 tokens (current — needed)
```

By turn 8, the agent carries 82,500 tokens of stale scan data. This is pure waste.

**Solution**: After 3+ UI scans, auto-compress old scans into a 1-line semantic summary. Keep only the 2 most recent scans uncompressed.

---

## What to Create

### File: `src/services/ContextManager.ts` (NEW)

```typescript
import { ActionMap } from './MobileSmartTreeService';

/**
 * Compact summary of a previous UI scan.
 */
export interface ScanSummary {
  turn: number;
  screenName: string;
  elementCount: number;
  platform: string;
  keyElements: string[];   // Top 3-5 most important element labels
  timestamp: string;
}

/**
 * Full scan record (kept for recent scans).
 */
interface ScanRecord {
  turn: number;
  screenName: string;
  actionMap: ActionMap;
  compactedAt?: number;  // If compacted, when
}

/**
 * ContextManager — manages UI scan history and compacts old scans.
 *
 * USAGE:
 *   const ctx = ContextManager.getInstance();
 *   ctx.recordScan(currentTurn, 'LoginScreen', actionMap);
 *   const compacted = ctx.getCompactedHistory(currentTurn);
 *   // Inject compacted into tool response header for context
 */
export class ContextManager {
  private static instance: ContextManager;

  /** All scans recorded in this session */
  private scans: ScanRecord[] = [];

  /** After this many scans, compact old ones */
  private readonly COMPACT_AFTER_SCANS = 3;

  /** Keep this many recent scans uncompressed */
  private readonly RECENT_SCANS_TO_KEEP = 2;

  public static getInstance(): ContextManager {
    if (!ContextManager.instance) {
      ContextManager.instance = new ContextManager();
    }
    return ContextManager.instance;
  }

  /**
   * Records a new UI scan.
   * Automatically compacts old scans when threshold is reached.
   */
  public recordScan(turn: number, screenName: string, actionMap: ActionMap): void {
    this.scans.push({ turn, screenName, actionMap });
  }

  /**
   * Returns a compact history string for context injection.
   * Old scans → 1-line summary
   * Recent scans → full action map reference
   *
   * @param currentTurn Current conversation turn number
   */
  public getCompactedHistory(currentTurn: number): string {
    if (this.scans.length < this.COMPACT_AFTER_SCANS) {
      return ''; // Not enough scans to warrant compaction
    }

    const sorted = [...this.scans].sort((a, b) => a.turn - b.turn);
    const recentCutoff = sorted.length - this.RECENT_SCANS_TO_KEEP;

    const oldScans = sorted.slice(0, recentCutoff);
    const recentScans = sorted.slice(recentCutoff);

    const lines: string[] = ['[Session Screen History]'];

    // Compact old scans into 1-line summaries
    for (const scan of oldScans) {
      const summary = this.buildOneLiner(scan);
      lines.push(`[Turn ${scan.turn}] ${summary} (compacted)`);
    }

    // Reference recent scans by name
    for (const scan of recentScans) {
      lines.push(`[Turn ${scan.turn}] ${scan.screenName}: ${scan.actionMap.interactiveCount} elements — see latest action map`);
    }

    return lines.join('\n');
  }

  /**
   * Returns only the most recent scan's action map.
   * Used when injecting current context into tool responses.
   */
  public getLatestScan(): ScanRecord | null {
    if (this.scans.length === 0) return null;
    return this.scans[this.scans.length - 1];
  }

  /**
   * Returns the number of unique screens visited in this session.
   */
  public getScreenCount(): number {
    const unique = new Set(this.scans.map(s => s.screenName));
    return unique.size;
  }

  /**
   * Resets the context (call on new session start).
   */
  public reset(): void {
    this.scans = [];
  }

  /**
   * Builds a single-line summary for an old scan.
   * Format: "LoginScreen: 8 elements, key: #1 username-field, #2 password-field, #3 login-btn"
   */
  private buildOneLiner(scan: ScanRecord): string {
    const { actionMap } = scan;
    // Pick top 3 elements by role priority: inputs first, then buttons
    const inputs = actionMap.elements.filter(e => e.role === 'input').slice(0, 2);
    const buttons = actionMap.elements.filter(e => e.role === 'button').slice(0, 2);
    const keyElements = [...inputs, ...buttons].slice(0, 3);

    const keyStr = keyElements.length > 0
      ? 'key: ' + keyElements.map(e => `${e.ref} ${e.label}`).join(', ')
      : 'no interactive elements';

    return `${scan.screenName}: ${actionMap.interactiveCount} elements, ${keyStr}`;
  }
}
```

---

## What to Update

### File: `src/services/ExecutionService.ts`

After every `inspect_ui_hierarchy` result:

```typescript
import { ContextManager } from './ContextManager';

// After building the action map:
const ctxManager = ContextManager.getInstance();
ctxManager.recordScan(currentTurn, args.screenName, actionMap);

// Get compacted history for context injection into response
const history = ctxManager.getCompactedHistory(currentTurn);
if (history) {
  console.log('[ContextManager] Injecting compacted screen history');
}

// Prepend history to the returned content:
return {
  success: true,
  sessionHistory: history || undefined,
  screenSummary: actionMap.screenSummary,
  actionMap: actionMap.dehydratedText,
  // ...
};
```

### File: `src/index.ts` or Session handling

Reset context on new session start:
```typescript
import { ContextManager } from './services/ContextManager';

// In start_appium_session handler, after session starts:
ContextManager.getInstance().reset();
```

---

## Verification

1. Run: `npm run build` — must pass

2. Unit test the compaction logic:

```typescript
import { ContextManager } from './src/services/ContextManager';

const ctx = ContextManager.getInstance();
ctx.reset();

// Simulate 4 scans
const mockMap = (name: string, count: number) => ({
  screenSummary: `${name}: ${count} elements`,
  platform: 'android' as const,
  xmlHash: 'abc123',
  elements: Array.from({ length: count }, (_, i) => ({
    ref: `#${i+1}`, role: 'button' as const, label: `btn-${i}`,
    locator: `~btn-${i}`, strategy: 'accessibility id' as const, states: ['clickable']
  })),
  dehydratedText: '',
  totalElements: count,
  interactiveCount: count,
});

ctx.recordScan(1, 'LoginScreen', mockMap('LoginScreen', 5));
ctx.recordScan(3, 'DashboardScreen', mockMap('DashboardScreen', 12));
ctx.recordScan(5, 'ProductListScreen', mockMap('ProductListScreen', 25));
ctx.recordScan(7, 'ProductDetailScreen', mockMap('ProductDetailScreen', 8));

const history = ctx.getCompactedHistory(7);
console.log('Compacted history:\n', history);

// Should show: LoginScreen and DashboardScreen as compacted, last 2 as "see latest"
console.assert(history.includes('(compacted)'), 'Old scans should be compacted');
console.assert(history.includes('ProductListScreen'), 'Recent scan should appear');
console.log('ContextManager test passed');
```

---

## Done Criteria

- [x] `ContextManager.ts` created with `recordScan()`, `getCompactedHistory()`, `reset()`
- [x] Compaction triggers after 3+ scans
- [x] Old scans compressed to 1-line summary
- [x] Recent 2 scans kept as references
- [x] `ExecutionService.ts` records scans and injects history into response
- [x] Session reset clears context manager state
- [x] `npm run build` passes with zero errors
- [x] Test confirms compaction output format
- [x] Change `Status` above to `DONE`

---

## Notes

- **Turn numbers** — use a simple counter or request counter from `src/index.ts` if available; fallback to `Date.now()` if no turn tracking exists
- **No disk persistence needed** — context resets on every new MCP server start (each chat session)
- **Pair with GS-09** — this task is only valuable if GS-09's dehydrated format is being used
- **Compacted history is ~50 chars per screen** vs. 12,500 tokens of raw XML — massive savings
