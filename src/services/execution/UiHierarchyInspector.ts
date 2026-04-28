import { Logger } from '../../utils/Logger.js';
import { ScreenshotStorage } from '../../utils/ScreenshotStorage.js';
import { AppForgeError } from '../../utils/ErrorFactory.js';
import { MobileSmartTreeService } from '../execution/MobileSmartTreeService.js';
import { ContextManager } from '../system/ContextManager.js';
import { SharedExecState } from './SharedExecState.js';



export class UiHierarchyInspector {
  constructor(protected state: SharedExecState, protected facade: any) { }

  get sessionManager() { return this.state.sessionManager; }
  get jobs() { return this.state.jobs; }

  /**
   * Captures UI Hierarchy (XML) and Screenshot (Base64) for Vision Healing.
   * If no xmlDump is provided and a live session exists, auto-fetches from the device.
   *
   * Issue #15 FIX: Now generates valid locatorStrategies for each element.
   * SCREENSHOT STORAGE FIX: Requires projectRoot to store screenshots correctly in MCP context.
   */
  public async inspectHierarchy(projectRoot: string, xmlDump?: string, screenshotBase64?: string, stepHints?: string[], includeRawXml?: boolean): Promise<{
    snapshot: string;
    sessionHistory?: string;
    elementCount: { total: number; interactive: number };
    screenshotPath?: string;
    screenshotBase64?: string;  // returned for MCP ImageContent (Maestro pattern)
    screenshotSize?: number;
    timestamp: string;
    source: 'provided' | 'live_session';
    platform: 'android' | 'ios';  // exposed so callers can select correct schema
    rawXml?: string;  // only populated in full mode (for healer tools)
  }> {

    let xml = xmlDump ?? '';
    let screenshot = screenshotBase64 ?? '';
    let source: 'provided' | 'live_session' = 'provided';
    if (stepHints && stepHints.length > 0 && !xmlDump) {
      const keywords = this.extractStepKeywords(stepHints);
      let platform = 'android';
      if (this.sessionManager?.hasActiveSession(projectRoot)) {
        const sessionService = await this.sessionManager.getSession(projectRoot);
        platform = sessionService.getPlatform() ?? 'android';
      }
      const nativeElements = await this.findElementsByKeywords(keywords, platform as any, projectRoot);

      if (nativeElements.length > 0) {
        const snapshotLines = [
          `[Screen: live | stepHints filter: "${keywords.join(', ')}" | timestamp: ${new Date().toLocaleTimeString()}]`,
          `Found ${nativeElements.length} matching elements (native on-device query — no full XML fetched)`,
          '',
          ...nativeElements.map((el, i) => {
            const role = el.tag.split('.').pop() ?? 'element';
            return `#${i + 1}  ${role.padEnd(10)} "${el.text.substring(0, 40).padEnd(40)}"   ${el.locator}`;
          }),
          '',
          'These elements were found using on-device queries — zero XML transferred.',
          'LOCATOR PRIORITY: Use the locator shown above directly in your Page Object.'
        ];

        return {
          snapshot: snapshotLines.join('\n'),
          elementCount: { total: nativeElements.length, interactive: nativeElements.length },
          timestamp: new Date().toISOString(),
          source: 'live_session',
          platform: (platform === 'ios' ? 'ios' : 'android') as 'android' | 'ios',
        };

      }
      // If native query returned 0 results, fall through to full XML snapshot below
    }

    if (!xml && this.sessionManager?.hasActiveSession(projectRoot)) {
      const sessionService = await this.sessionManager.getSession(projectRoot);
      xml = await sessionService.getPageSource();
      // Cache the XML for self-heal recovery (chicken-and-egg fix)
      sessionService.cacheXml(xml);
      screenshot = await sessionService.takeScreenshot();
      source = 'live_session';
    }

    if (!xml) {
      throw new AppForgeError(
        'SESSION_REQUIRED',
        'No active Appium session and no XML dump provided.',
        ['Call start_appium_session first before inspecting UI, or provide xmlDump.']
      );
    }

    let platformToUse: 'android' | 'ios' | 'both' = 'android';
    if (this.sessionManager?.hasActiveSession(projectRoot)) {
      const sessionService = await this.sessionManager.getSession(projectRoot);
      platformToUse = (sessionService.getPlatform() as 'android' | 'ios' | 'both') ?? 'android';
    }

    const smartTree = MobileSmartTreeService.getInstance();
    const actionMap = smartTree.buildSparseMap(xml, platformToUse === 'both' ? 'android' : platformToUse, source);
    const ctxManager = ContextManager.getInstance();
    const screenNameMatch = actionMap.screenSummary.match(/^([^:]+)/);
    const screenName = screenNameMatch ? screenNameMatch[1] : 'UnknownScreen';
    ctxManager.recordScan(undefined, screenName, actionMap);
    const history = ctxManager.getCompactedHistory();
    if (history) {
      Logger.info('[ContextManager] Injecting compacted screen history');
    }

    const snapshot = actionMap.dehydratedText;
    let screenshotPath: string | undefined;
    let screenshotSize: number | undefined;
    if (screenshot) {
      const storage = new ScreenshotStorage(projectRoot);
      const stored = storage.store(screenshot, 'inspect');
      screenshotPath = stored.relativePath;
      screenshotSize = stored.size;
    }

    return {
      snapshot,
      sessionHistory: history || undefined,
      elementCount: { total: actionMap.totalElements, interactive: actionMap.interactiveCount },
      screenshotPath,
      screenshotBase64: screenshot || undefined,  // return for MCP ImageContent
      screenshotSize,
      timestamp: new Date().toISOString(),
      source,
      platform: (platformToUse === 'both' ? 'android' : platformToUse) as 'android' | 'ios',
      // Raw XML only for healer tools that explicitly need it
      rawXml: includeRawXml ? xml : undefined
    };

  }

  /**
   * Extracts actionable keywords from natural-language step descriptions.
   * Input:  ["Tap the Login button", "Enter username in the field"]
   * Output: ["login", "username"]
   *
   * Strategy: remove Gherkin keywords, common verbs, articles, prepositions.
   * Keep nouns/adjectives — these are the element labels on screen.
   */
  public extractStepKeywords(steps: string[]): string[] {
    const STOP_WORDS = new Set([
      'given', 'when', 'then', 'and', 'but', 'i', 'the', 'a', 'an', 'to', 'on', 'in',
      'at', 'by', 'for', 'with', 'from', 'into', 'tap', 'click', 'press', 'enter',
      'type', 'input', 'verify', 'check', 'see', 'confirm', 'navigate', 'go',
      'open', 'close', 'select', 'choose', 'scroll', 'swipe', 'should', 'is',
      'am', 'are', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'field', 'button', 'screen', 'page', 'view', 'bar', 'icon', 'text', 'label',
      'this', 'that', 'these', 'those', 'my', 'your', 'its', 'their', 'our'
    ]);
    return [
      ...new Set(
        steps.flatMap(step =>
          step
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && !STOP_WORDS.has(word))
        )
      )
    ];
  }

  /**
   * Runs native on-device queries to find elements by keyword.
   * Returns raw elements directly from the device — no full page source needed.
   *
   * Android: Uses UiSelector textContains + descriptionContains
   * iOS: Uses NSPredicate label CONTAINS[cd]
   *
   * Falls back to full XML if no native session is available (xmlDump mode).
   */
  public async findElementsByKeywords(keywords: string[], platform: 'android' | 'ios' | 'both', projectRoot: string): Promise<{ locator: string; text: string; tag: string }[]> {
    if (!this.sessionManager?.hasActiveSession(projectRoot)) return [];
    const sessionService = await this.sessionManager.getSession(projectRoot);
    const driver = sessionService.getDriver();
    if (!driver) return [];
    const results: { locator: string; text: string; tag: string }[] = [];
    for (const kw of keywords) {
      try {
        if (platform === 'ios') {
          // iOS NSPredicate: partial match, case-insensitive
          const predicate = `label CONTAINS[cd] "${kw}" OR name CONTAINS[cd] "${kw}" OR value CONTAINS[cd] "${kw}"`;
          const els = driver.$$(
            `-ios predicate string:${predicate}`
          );
          let count = 0;
          for (const el of els) {
            if (count++ >= 5) break;
            const label = await el.getAttribute('label') ?? '';
            const name = await el.getAttribute('name') ?? '';
            const tag = await el.getAttribute('type') ?? 'XCUIElementTypeOther';
            const locator = name ? `~${name}` : `label:${label}`;
            if (label || name) results.push({ locator, text: label || name, tag });
          }
        } else {
          // Android UiSelector: textContains OR descriptionContains
          const textSelector = `new UiSelector().textContains("${kw}")`;
          const descSelector = `new UiSelector().descriptionContains("${kw}")`;
          for (const sel of [textSelector, descSelector]) {
            try {
              const els = driver.$$(`android=${sel}`);
              let count = 0;
              for (const el of els) {
                if (count++ >= 5) break;
                const text = await el.getText() ?? '';
                const desc = await el.getAttribute('content-desc') ?? '';
                const resId = await el.getAttribute('resource-id') ?? '';
                const tag = await el.getAttribute('class') ?? 'android.view.View';
                const locator = desc ? `~${desc}` : resId ? `id=${resId}` : text ? `text=${text}` : '';
                if (locator) results.push({ locator, text: text || desc, tag });
              }
            } catch { /* element not found for this selector — continue */ }
          }
        }
      } catch {
        // Keyword not found on screen — skip silently, continue with next keyword
      }
    }

    return [...new Map(results.map(r => [r.locator, r])).values()];
  }
}