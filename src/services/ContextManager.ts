import { ActionMap } from './MobileSmartTreeService.js';

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

  /** Internal request counter if explicit turns are not provided */
  private turnCounter = 0;

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
  public recordScan(turn: number | undefined, screenName: string, actionMap: ActionMap): void {
    const activeTurn = turn ?? ++this.turnCounter;
    this.scans.push({ turn: activeTurn, screenName, actionMap });
  }

  /**
   * Returns a compact history string for context injection.
   * Old scans → 1-line summary
   * Recent scans → full action map reference
   *
   * @param currentTurn Current conversation turn number
   */
  public getCompactedHistory(currentTurn?: number): string {
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
    this.turnCounter = 0;
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
