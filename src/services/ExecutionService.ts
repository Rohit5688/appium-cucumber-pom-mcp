import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { AppiumSessionService } from './AppiumSessionService.js';
import { McpConfigService } from './McpConfigService.js';
import { Questioner } from '../utils/Questioner.js';
import { ScreenshotStorage } from '../utils/ScreenshotStorage.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  reportPath?: string;
  stats?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  /** Populated on failure when a live Appium session is available */
  failureContext?: {
    screenshotPath: string;
    screenshotSize: number;
    pageSource: string;
    timestamp: string;
  };
}

/**
 * Element structure returned by inspect_ui_hierarchy.
 * Issue #15 FIX: locatorStrategies now contains only VALID WebdriverIO selectors.
 */
export interface ParsedElement {
  tag: string;
  id: string;
  text: string;
  bounds: string;
  className?: string;
  contentDesc?: string;
  resourceId?: string;
  /** Valid WebdriverIO selectors that can be used directly in driver.$() */
  locatorStrategies: string[];
}

export class ExecutionService {
  private sessionService: AppiumSessionService | null = null;

  /** Inject a live session service for auto-fetch capabilities. */
  public setSessionService(service: AppiumSessionService): void {
    this.sessionService = service;
  }

  /**
   * Validates Cucumber tag expression against an allowlist.
   * Issue #17: Prevent shell injection via unsanitised tags parameter.
   * Valid characters: @, alphanumeric, spaces, parentheses, logical operators (!, &, |, comma)
   */
  private validateTagExpression(tags: string): boolean {
    if (!tags || tags.trim() === '') return true; // Empty is OK
    // Allowlist: @ (tag prefix), word chars, spaces, brackets, and logical operators
    const allowedPattern = /^[@\w\s()!&|,]+$/;
    return allowedPattern.test(tags);
  }

  /**
   * Rejects specificArgs containing shell metacharacters.
   * Issue #17: Prevent shell injection via unescaped specificArgs.
   */
  private validateSpecificArgs(args: string): boolean {
    if (!args || args.trim() === '') return true; // Empty is OK
    // Reject anything containing shell metacharacters: ; & | ` $ > < ' " \ ! and newlines
    const forbiddenPattern = /[;&|`$><'"\\!\n\r]/;
    return !forbiddenPattern.test(args);
  }

  /**
   * Executes Cucumber Appium tests with tag and platform filtering.
   * If a live session is active and tests fail, auto-captures screenshot + XML for healing.
   * 
   * Issue #17 FIX:
   * - Validates tags against allowlist: only @, word chars, spaces, brackets, logical operators
   * - Rejects specificArgs containing shell metacharacters (; & | ` $ > < ' " \ !)
   * - Uses execFile with args array instead of execAsync(string) to eliminate shell interpolation
   * 
   * Timeout FIX:
   * - Supports configurable timeout with resolution order:
   *   1. Explicit timeoutMs parameter
   *   2. mcp-config.json execution.timeoutMs
   *   3. Detected from wdio.conf.ts (cucumberOpts.timeout or waitforTimeout)
   *   4. Default: 30 minutes (1800000 ms)
   */
  public async runTest(
    projectRoot: string,
    options?: {
      tags?: string;
      platform?: 'android' | 'ios';
      specificArgs?: string;
      overrideCommand?: string;
      timeoutMs?: number;
    }
  ): Promise<ExecutionResult> {
    // Issue #17: Validate tag expression and specific args upfront (fast-fail, before timeout resolution)
    if (options?.tags && !this.validateTagExpression(options.tags)) {
      return {
        success: false,
        output: '',
        error: `Invalid tag expression: "${options.tags}". Tags must only contain alphanumeric characters, @, spaces, parentheses, and logical operators (!, &, |, comma).`
      };
    }

    if (options?.specificArgs && !this.validateSpecificArgs(options.specificArgs)) {
      return {
        success: false,
        output: '',
        error: `Invalid specificArgs: "${options.specificArgs}". Arguments must not contain shell metacharacters (;, &, |, backtick, $, >, <, quotes, backslash, !).`
      };
    }

    // Resolve config + timeout BEFORE the execution try-catch so that:
    //   1. Invalid timeoutMs throws and rejects the promise (instead of being swallowed)
    //   2. The resolved timeout is available in the catch block for output logging
    const configService = new McpConfigService();
    let config;
    try {
      config = configService.read(projectRoot);
    } catch {
      config = null;
    }
    // resolveTimeout throws for invalid values → propagates to caller
    const timeout = await this.resolveTimeout(projectRoot, options?.timeoutMs, config);

    try {
      const fs = await import('fs');
      let command = '';
      if (options?.overrideCommand) {
        // Issue #17: Validate overrideCommand doesn't contain obvious injection attempts
        if (/[;&|`$]/.test(options.overrideCommand)) {
          return {
            success: false,
            output: '',
            error: `Invalid overrideCommand: contains shell metacharacters. Use executionCommand in mcp-config.json instead.`
          };
        }
        command = options.overrideCommand;
      } else if (config?.project?.executionCommand) {
        command = config.project.executionCommand;
      } else {
        const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
          ? 'wdio.conf.ts' : 'wdio.conf.js';
        command = `npx wdio run ${defaultConf}`;
        console.warn(`[AppForge] ⚠️ No executionCommand in mcp-config.json — using default: ${command}`);
      }
      
      // We only append specific arguments if we're dealing with a wdio execution command natively
      // Otherwise we just run the custom execution command as-is
      if (!command) throw new Error("Missing execution command.");
      
      // Issue #17 FIX: Parse command into executable + args, then build args array
      const parts: string[] = command.split(/\s+/).filter(p => p.length > 0);
      const exe = parts.shift(); // Get first part (e.g., 'npx')
      if (!exe) throw new Error("Invalid execution command.");
      
      // Additional safety: validate executable name doesn't contain path traversal
      if (exe.includes('..') || exe.includes('/') && !exe.startsWith('/')) {
        throw new Error("Invalid executable: must be a binary name or absolute path.");
      }
      
      const args: string[] = parts;
      
      let configName = 'wdio.conf.ts';
      const isWdio = command.includes('wdio');

      if (isWdio && options?.platform) {
        const specificConfig = `wdio.${options.platform}.conf.ts`;
        if (fs.existsSync(path.join(projectRoot, specificConfig))) {
          configName = specificConfig;
          // Replace generic wdio.conf.ts with specific if it exists in args
          const index = args.findIndex(p => p.includes('wdio.conf.ts'));
          if (index !== -1) args[index] = specificConfig;
        }
      }

      // Apply tag filtering via wdio cucumberOpts
      let tagExpression = options?.tags || '';

      if (isWdio) {
        // If we fall back to generic monolithic config but user wants a specific platform,
        // we still need to filter via @android or @ios tags for the generic run to work correctly.
        if (options?.platform && configName === 'wdio.conf.ts') {
          const platformTag = `@${options.platform}`;
          if (tagExpression) {
            tagExpression = `(${tagExpression}) and ${platformTag}`;
          } else {
            tagExpression = platformTag;
          }
        }

        if (tagExpression) {
          // Issue #17 FIX: Pass as separate arg (no shell quoting needed with execFile)
          args.push(`--cucumberOpts.tagExpression=${tagExpression}`);
        }

        // Additional args (already validated)
        if (options?.specificArgs) {
          // Split on spaces if multiple args were provided, filter empty strings
          const additionalArgs = options.specificArgs.split(/\s+/).filter(arg => arg.length > 0);
          args.push(...additionalArgs);
        }
      }
      
      // Issue #17 FIX: Use execFile with args array instead of shell string
      // Timeout FIX: Use resolved timeout
      const { stdout, stderr } = await execFileAsync(exe, args, {
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '0' },
        timeout: timeout.value
      });

      // Try to parse the JSON report for structured stats
      // wdio requires @wdio/cucumberjs-json-reporter to output this file.
      // If it doesn't exist, we gracefully fail and return 0s.
      let stats;
      try {
        stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
      } catch {
        stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }

      return {
        success: true,
        output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${stdout + stderr}`,
        reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
        stats
      };
    } catch (error: any) {
      // Cucumber exits non-zero on test failures
      let stats;
      try {
        stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
      } catch {
        stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
      }

      // Auto-capture failure context from live session if available
      let failureContext: ExecutionResult['failureContext'];
      if (this.sessionService?.isSessionActive()) {
        try {
          const screenshot = await this.sessionService.takeScreenshot();
          const storage = new ScreenshotStorage(projectRoot);
          const stored = storage.store(screenshot, 'failure');
          
          failureContext = {
            screenshotPath: stored.relativePath,
            screenshotSize: stored.size,
            pageSource: await this.sessionService.getPageSource(),
            timestamp: new Date().toISOString()
          };
        } catch {
          // Session might have died during test — ignore
        }
      }

      return {
        success: false,
        // Include timeout prefix in failure output so callers can always see resolution source
        output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${error.stdout || ''}`,
        error: error.stderr || error.message,
        stats,
        failureContext
      };
    }
  }

  /**
   * Captures UI Hierarchy (XML) and Screenshot (Base64) for Vision Healing.
   * If no xmlDump is provided and a live session exists, auto-fetches from the device.
   * 
   * Issue #15 FIX: Now generates valid locatorStrategies for each element.
   * SCREENSHOT STORAGE FIX: Requires projectRoot to store screenshots correctly in MCP context.
   */
  public async inspectHierarchy(
    projectRoot: string,
    xmlDump?: string,
    screenshotBase64?: string,
    stepHints?: string[]
  ): Promise<{
    snapshot: string;
    elementCount: { total: number; interactive: number };
    screenshotPath?: string;
    screenshotSize?: number;
    timestamp: string;
    source: 'provided' | 'live_session';
    xml?: string;  // only populated in full mode (for healer tools)
  }> {
    let xml = xmlDump ?? '';
    let screenshot = screenshotBase64 ?? '';
    let source: 'provided' | 'live_session' = 'provided';

    // FAST PATH: If stepHints provided, try native on-device query first
    if (stepHints && stepHints.length > 0 && !xmlDump) {
      const keywords = this.extractStepKeywords(stepHints);
      const platform = this.sessionService?.getPlatform() ?? 'android';
      const nativeElements = await this.findElementsByKeywords(keywords, platform as any);

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
          source: 'live_session'
        };
      }
      // If native query returned 0 results, fall through to full XML snapshot below
    }

    // Auto-fetch from live session if no XML provided
    if (!xml && this.sessionService?.isSessionActive()) {
      xml = await this.sessionService.getPageSource();
      // Cache the XML for self-heal recovery (chicken-and-egg fix)
      this.sessionService.cacheXml(xml);
      screenshot = await this.sessionService.takeScreenshot();
      source = 'live_session';
    }

    if (!xml) {
      throw new Error(
        'No XML hierarchy provided and no active Appium session. ' +
        'Either provide xmlDump or call start_appium_session first.'
      );
    }

    const elements = this.parseXmlElements(xml);
    const snapshot = this.buildAccessibilitySnapshot(elements, source);

    // Store screenshot locally instead of returning base64 in response
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
      elementCount: { total: elements.length, interactive: elements.filter(e => e.locatorStrategies.length > 0).length },
      screenshotPath,
      screenshotSize,
      timestamp: new Date().toISOString(),
      source,
      // Raw XML only for healer tools that explicitly need it
      xml: xmlDump ? xml : undefined
    };
  }

  /**
   * Extracts interactive elements from Appium XML page source.
   * 
   * Issue #15 FIX: Generates valid WebdriverIO/Appium locator strategies.
   * Previously generated invalid `*[text()="..."]` selectors.
   * Now returns proper XPath, accessibility-id, and resource-id selectors.
   */
  private parseXmlElements(xml: string): ParsedElement[] {
    const elements: ParsedElement[] = [];
    // Simple regex-based extraction from XML (no external XML parser needed)
    // Matches: <TagName attrs... /> or <TagName attrs...>
    const nodeRegex = /<(\w+(?:\.\w+)*)\s+([^>]*?)\/?>/g;
    let match;

    while ((match = nodeRegex.exec(xml)) !== null) {
      const tag = match[1];
      const attrs = match[2];

      // Extract all relevant attributes
      const resourceIdMatch = attrs.match(/resource-id="([^"]*)"/);
      const contentDescMatch = attrs.match(/content-desc="([^"]*)"/);
      const accessibilityIdMatch = attrs.match(/accessibility-id="([^"]*)"/);
      const nameMatch = attrs.match(/name="([^"]*)"/);
      const textMatch = attrs.match(/(?:text|value)="([^"]*)"/);
      const boundsMatch = attrs.match(/bounds="([^"]*)"/);
      const clickableMatch = attrs.match(/clickable="true"/);
      const enabledMatch = attrs.match(/enabled="true"/);
      const classMatch = attrs.match(/class="([^"]*)"/);

      let boundsStr = boundsMatch?.[1] ?? '';
      if (!boundsStr) {
        const x = attrs.match(/x="([^"]*)"/)?.[1];
        const y = attrs.match(/y="([^"]*)"/)?.[1];
        const w = attrs.match(/width="([^"]*)"/)?.[1];
        const h = attrs.match(/height="([^"]*)"/)?.[1];
        if (x && y && w && h) {
          boundsStr = `x=${x},y=${y},w=${w},h=${h}`;
        }
      }

      // Extract attribute values
      const resourceId = resourceIdMatch?.[1] ?? '';
      const contentDesc = contentDescMatch?.[1] ?? '';
      const accessibilityId = accessibilityIdMatch?.[1] ?? '';
      const name = nameMatch?.[1] ?? '';
      const text = textMatch?.[1] ?? '';
      const className = classMatch?.[1] ?? '';

      // Only include interactable or identifiable elements
      if (resourceId || contentDesc || accessibilityId || name || text || clickableMatch || boundsStr) {
        
        // Issue #15 FIX: Generate valid locator strategies in priority order
        const locatorStrategies: string[] = [];

        // Priority 1: Accessibility ID (most stable)
        if (contentDesc) {
          locatorStrategies.push(`~${contentDesc}`);
        }
        if (accessibilityId) {
          locatorStrategies.push(`~${accessibilityId}`);
        }
        if (name && !contentDesc && !accessibilityId) {
          // iOS uses 'name' for accessibility
          locatorStrategies.push(`~${name}`);
        }

        // Priority 2: Resource ID (stable on Android)
        if (resourceId) {
          locatorStrategies.push(`id=${resourceId}`);
        }

        // Priority 3: XPath with text (less stable, but sometimes necessary)
        // Issue #15 FIX: Use valid XPath syntax instead of invalid *[text()="..."]
        if (text && text.trim().length > 0 && text.trim().length < 50) {
          // Escape double quotes in text for XPath
          const escapedText = text.replace(/"/g, '&quot;');
          locatorStrategies.push(`//*[@text="${escapedText}"]`);
        }

        // Priority 4: XPath with content-desc
        if (contentDesc && contentDesc.trim().length > 0) {
          const escapedDesc = contentDesc.replace(/"/g, '&quot;');
          locatorStrategies.push(`//*[@content-desc="${escapedDesc}"]`);
        }

        // Priority 5: XPath with resource-id
        if (resourceId) {
          locatorStrategies.push(`//*[@resource-id="${resourceId}"]`);
        }

        // Priority 6: Class-based selector (least stable, last resort)
        if (className && locatorStrategies.length === 0) {
          locatorStrategies.push(`//${className}`);
        }

        elements.push({
          tag,
          id: resourceId || accessibilityId || contentDesc || name || '',
          text: text || '',
          bounds: boundsStr,
          className,
          contentDesc,
          resourceId,
          locatorStrategies
        });
      }
    }

    return elements;
  }

  /**
   * Builds a compact Mobile Accessibility Snapshot from parsed elements.
   * Modeled on Playwright MCP's ARIA snapshot — returns only interactive elements
   * in a human-readable format the LLM can process in ~150 tokens.
   *
   * Format per element:
   *   #ref  role  "visible label"   best_locator   [states]
   */
  private buildAccessibilitySnapshot(elements: ParsedElement[], source: string): string {
    const interactive = elements.filter(el =>
      el.locatorStrategies.length > 0 &&
      (el.text || el.contentDesc || el.resourceId)
    );

    if (interactive.length === 0) {
      return `[Screen: ${source} | No interactive elements found — screen may still be loading]`;
    }

    const roleMap: Record<string, string> = {
      'android.widget.Button': 'button',
      'android.widget.EditText': 'input',
      'android.widget.TextView': 'text',
      'android.widget.ImageButton': 'button',
      'android.widget.CheckBox': 'checkbox',
      'android.widget.Switch': 'toggle',
      'android.widget.RadioButton': 'radio',
      'android.widget.ImageView': 'image',
      'XCUIElementTypeButton': 'button',
      'XCUIElementTypeTextField': 'input',
      'XCUIElementTypeSecureTextField': 'input',
      'XCUIElementTypeStaticText': 'text',
      'XCUIElementTypeSwitch': 'toggle',
    };

    const lines: string[] = [
      `[Screen: ${source} | timestamp: ${new Date().toLocaleTimeString()}]`,
      `Interactive elements: ${interactive.length} of ${elements.length} total`,
      ''
    ];

    interactive.forEach((el, i) => {
      const ref = `#${i + 1}`;
      const role = roleMap[el.tag] ?? el.tag.split('.').pop() ?? 'element';
      const label = el.text || el.contentDesc || el.id || '(no label)';
      const bestLocator = el.locatorStrategies[0] ?? 'no-locator';
      const states: string[] = [];
      if (el.tag.includes('EditText') || el.tag.includes('TextField')) states.push('editable');
      if (el.tag.includes('SecureTextField') || el.contentDesc?.toLowerCase().includes('password')) states.push('secure');

      const stateStr = states.length > 0 ? `[${states.join(', ')}]` : '[clickable]';
      lines.push(`${ref.padEnd(4)} ${role.padEnd(10)} "${label.substring(0, 40).padEnd(40)}"   ${bestLocator.padEnd(35)} ${stateStr}`);
    });

    lines.push('');
    lines.push('LOCATOR PRIORITY: Use accessibility-id (~) → resource-id (id=) → xpath as last resort.');
    lines.push('USE #ref number to reference elements in your Page Object locators.');

    return lines.join('\n');
  }

  /**
   * Extracts actionable keywords from natural-language step descriptions.
   * Input:  ["Tap the Login button", "Enter username in the field"]
   * Output: ["login", "username"]
   *
   * Strategy: remove Gherkin keywords, common verbs, articles, prepositions.
   * Keep nouns/adjectives — these are the element labels on screen.
   */
  private extractStepKeywords(steps: string[]): string[] {
    const STOP_WORDS = new Set([
      'given','when','then','and','but','i','the','a','an','to','on','in',
      'at','by','for','with','from','into','tap','click','press','enter',
      'type','input','verify','check','see','confirm','navigate','go',
      'open','close','select','choose','scroll','swipe','should','is',
      'am','are','be','been','have','has','had','do','does','did','will',
      'would','could','should','may','might','must','shall','can','need',
      'field','button','screen','page','view','bar','icon','text','label',
      'this','that','these','those','my','your','its','their','our'
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
  private async findElementsByKeywords(
    keywords: string[],
    platform: 'android' | 'ios' | 'both'
  ): Promise<{ locator: string; text: string; tag: string }[]> {
    const session = this.sessionService;
    if (!session?.isSessionActive()) return [];

    const driver = session.getDriver();
    if (!driver) return [];

    const results: { locator: string; text: string; tag: string }[] = [];

    for (const kw of keywords) {
      try {
        if (platform === 'ios') {
          // iOS NSPredicate: partial match, case-insensitive
          const predicate = `label CONTAINS[cd] "${kw}" OR name CONTAINS[cd] "${kw}" OR value CONTAINS[cd] "${kw}"`;
          const els = await driver.$$(
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
              const els = await driver.$$(`android=${sel}`);
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

    // Deduplicate by locator
    return [...new Map(results.map(r => [r.locator, r])).values()];
  }

  /**
   * Resolves the timeout value for test execution.
   * Priority: explicit param > mcp-config > detect from project > default (30 min)
   */
  private async resolveTimeout(
    projectRoot: string,
    explicitTimeoutMs?: number,
    config?: any
  ): Promise<{ value: number; source: string }> {
    // 1. Explicit parameter
    if (explicitTimeoutMs !== undefined && explicitTimeoutMs !== null) {
      if (typeof explicitTimeoutMs !== 'number' || explicitTimeoutMs <= 0) {
        throw new Error(`Invalid timeoutMs: must be a positive number, got ${explicitTimeoutMs}`);
      }
      // Cap at 2 hours for safety
      const cappedTimeout = Math.min(explicitTimeoutMs, 7200000);
      if (cappedTimeout !== explicitTimeoutMs) {
        console.warn(`[AppForge] ⚠️ Timeout capped at 2 hours (7200000ms). Requested: ${explicitTimeoutMs}ms`);
      }
      return { value: cappedTimeout, source: 'explicit' };
    }

    // 2. mcp-config.json
    if (config?.execution?.timeoutMs) {
      const configTimeout = config.execution.timeoutMs;
      if (typeof configTimeout === 'number' && configTimeout > 0) {
        const cappedTimeout = Math.min(configTimeout, 7200000);
        return { value: cappedTimeout, source: 'mcp-config' };
      }
    }

    // 3. Detect from project (wdio.conf.ts/js)
    const detectedTimeout = await this.detectProjectTimeout(projectRoot);
    if (detectedTimeout) {
      return { value: detectedTimeout, source: 'detected(wdio.conf)' };
    }

    // 4. Default: 30 minutes
    return { value: 1800000, source: 'default' };
  }

  /**
   * Attempts to detect timeout from wdio.conf.ts/js.
   * Looks for cucumberOpts.timeout (per-step timeout) or waitforTimeout (element wait timeout).
   * Best-effort detection using regex patterns.
   */
  private async detectProjectTimeout(projectRoot: string): Promise<number | null> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Check for wdio.conf.ts or wdio.conf.js
      const configFiles = ['wdio.conf.ts', 'wdio.conf.js'];
      
      for (const configFile of configFiles) {
        const configPath = path.default.join(projectRoot, configFile);
        if (!fs.default.existsSync(configPath)) continue;

        const content = fs.default.readFileSync(configPath, 'utf8');

        // Priority 1: cucumberOpts.timeout — per-step Cucumber timeout
        const cucumberTimeoutMatch = content.match(/cucumberOpts[\s\S]{0,200}?timeout\s*:\s*(\d+)/);
        if (cucumberTimeoutMatch) {
          const timeout = parseInt(cucumberTimeoutMatch[1], 10);
          if (timeout > 0) {
            console.log(`[AppForge] ℹ️ Detected cucumberOpts.timeout from ${configFile}: ${timeout}ms`);
            return timeout;
          }
        }

        // Priority 2: waitforTimeout — global element wait timeout
        const waitforTimeoutMatch = content.match(/waitforTimeout\s*:\s*(\d+)/);
        if (waitforTimeoutMatch) {
          const timeout = parseInt(waitforTimeoutMatch[1], 10);
          if (timeout > 0) {
            console.log(`[AppForge] ℹ️ Detected waitforTimeout from ${configFile}: ${timeout}ms`);
            return timeout;
          }
        }
      }

      return null;
    } catch (error) {
      // Fail silently and fall back to default
      return null;
    }
  }

  /**
   * Parses Cucumber JSON report for structured test stats.
   */
  private async parseReport(reportPath: string): Promise<{ total: number; passed: number; failed: number; skipped: number } | undefined> {
    try {
      const { readFile } = await import('fs/promises');
      const raw = await readFile(reportPath, 'utf8');
      const features: any[] = JSON.parse(raw);
      let total = 0, passed = 0, failed = 0, skipped = 0;

      for (const feature of features) {
        for (const scenario of (feature.elements ?? [])) {
          if (scenario.type !== 'scenario') continue;
          total++;
          const steps = scenario.steps ?? [];
          if (steps.some((s: any) => s.result?.status === 'failed')) {
            failed++;
          } else if (steps.some((s: any) => s.result?.status === 'skipped' || s.result?.status === 'undefined')) {
            skipped++;
          } else {
            passed++;
          }
        }
      }

      return { total, passed, failed, skipped };
    } catch {
      return undefined;
    }
  }
}