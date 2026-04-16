import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { McpConfigService } from './McpConfigService.js';
import { Logger } from '../utils/Logger.js';
import { ScreenshotStorage } from '../utils/ScreenshotStorage.js';
import { AppForgeError } from '../utils/ErrorFactory.js';
import { FileGuard } from '../utils/FileGuard.js';
import { MobileSmartTreeService } from './MobileSmartTreeService.js';
import { ContextManager } from './ContextManager.js';
import { ShellSecurityEngine } from '../utils/ShellSecurityEngine.js';
import { McpErrors } from '../types/ErrorSystem.js';
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
export class ExecutionService {
    sessionManager;
    // Concern 4, Fix 1: constructor injection replaces nullable set* pattern
    constructor(sessionManager) {
        this.sessionManager = sessionManager;
    }
    /** @deprecated — Use constructor injection via ServiceContainer. Retained as no-op shim for legacy call-sites. */
    setSessionManager(_manager) {
        // no-op: sessionManager is now injected via constructor
    }
    /**
     * In-memory job queue for async test execution.
     * Key: jobId (UUID-like string). Value: TestJob.
     * Jobs are held in memory for the life of the MCP server process.
     * If the server restarts, jobs are lost — callers should treat jobIds as ephemeral.
     */
    jobs = new Map();
    /** Generate a unique job ID. */
    newJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    /**
     * Validates Cucumber tag expression against an allowlist.
     * Issue #17: Prevent shell injection via unsanitised tags parameter.
     * Valid characters: @, alphanumeric, spaces, parentheses, logical operators (!, &, |, comma)
     */
    validateTagExpression(tags) {
        if (!tags || tags.trim() === '')
            return true; // Empty is OK
        // Allowlist: @ (tag prefix), word chars, spaces, brackets, and logical operators
        const allowedPattern = /^[@\w\s()!&|,]+$/;
        return allowedPattern.test(tags);
    }
    /**
     * Builds the command that would be executed for a test run.
     * Used by preview mode to show users what will be run without executing.
     */
    async buildCommand(projectRoot, tags, platform) {
        const fs = await import('fs');
        const configService = new McpConfigService();
        let config;
        try {
            config = configService.read(projectRoot);
        }
        catch {
            config = null;
        }
        let command = '';
        if (config?.project?.executionCommand) {
            command = config.project.executionCommand;
        }
        else {
            const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
                ? 'wdio.conf.ts'
                : fs.existsSync(path.join(projectRoot, 'wdio.conf.js'))
                    ? 'wdio.conf.js'
                    : null;
            if (defaultConf) {
                command = `npx wdio run ${defaultConf}`;
            }
            else {
                throw new AppForgeError("E008_PRECONDITION_FAIL", 'No test execution command found.', ['Add "project": { "executionCommand": "npx wdio run wdio.conf.ts" } to mcp-config.json']);
            }
        }
        const isWdio = command.includes('wdio');
        let configName = 'wdio.conf.ts';
        if (isWdio && platform) {
            const specificConfig = `wdio.${platform}.conf.ts`;
            if (fs.existsSync(path.join(projectRoot, specificConfig))) {
                configName = specificConfig;
                command = command.replace(/wdio\.conf\.(ts|js)/, specificConfig);
            }
        }
        let tagExpression = tags || '';
        if (isWdio) {
            if (platform && configName === 'wdio.conf.ts') {
                const platformTag = `@${platform}`;
                if (tagExpression) {
                    tagExpression = `(${tagExpression}) and ${platformTag}`;
                }
                else {
                    tagExpression = platformTag;
                }
            }
            if (tagExpression) {
                command += ` --cucumberOpts.tags=${tagExpression}`;
            }
        }
        return command;
    }
    /**
     * Counts the number of scenarios that match the given tag expression.
     * Used by preview mode to estimate test duration.
     */
    async countScenarios(projectRoot, tags) {
        const fs = await import('fs');
        const glob = await import('glob');
        // Find all .feature files
        const featuresPath = path.join(projectRoot, 'src', 'features');
        if (!fs.existsSync(featuresPath)) {
            return 0;
        }
        const featureFiles = glob.sync(path.join(featuresPath, '**', '*.feature'));
        let totalScenarios = 0;
        for (const file of featureFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
                    // Check if tags match (simplified matching - looks for tags in preceding lines)
                    if (!tags) {
                        totalScenarios++;
                    }
                    else {
                        // Look backwards for tags
                        let tagLine = '';
                        for (let j = i - 1; j >= 0; j--) {
                            const prevLine = lines[j].trim();
                            if (prevLine.startsWith('@')) {
                                tagLine = prevLine + ' ' + tagLine;
                            }
                            else if (prevLine === '') {
                                continue;
                            }
                            else {
                                break;
                            }
                        }
                        // Simple tag matching (doesn't handle complex expressions perfectly)
                        if (this.matchesTags(tagLine, tags)) {
                            totalScenarios++;
                        }
                    }
                }
            }
        }
        return totalScenarios;
    }
    /**
     * Simple tag matching logic for preview mode.
     * Note: This is a simplified implementation and may not handle all complex tag expressions.
     */
    matchesTags(scenarioTags, expression) {
        if (!expression)
            return true;
        // Extract tags from scenario (e.g., "@smoke @android" -> ["smoke", "android"])
        const availableTags = scenarioTags
            .split(/\s+/)
            .filter(t => t.startsWith('@'))
            .map(t => t.substring(1));
        // Simple matching: check if expression tags are in available tags
        const requiredTags = expression
            .split(/\s+/)
            .filter(t => t.startsWith('@'))
            .map(t => t.substring(1));
        return requiredTags.every(req => availableTags.includes(req));
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
    async runTest(projectRoot, options) {
        // Issue #17: Validate tag expression and specific args upfront (fast-fail, before timeout resolution)
        if (options?.tags && !this.validateTagExpression(options.tags)) {
            return {
                success: false,
                output: '',
                error: `Invalid tag expression: "${options.tags}". Tags must only contain alphanumeric characters, @, spaces, parentheses, and logical operators (!, &, |, comma).`
            };
        }
        if (options?.specificArgs) {
            const specificArgsArr = options.specificArgs.split(/\s+/).filter(arg => arg.length > 0);
            const argsCheck = ShellSecurityEngine.validateArgs(specificArgsArr, 'run_cucumber_test');
            if (!argsCheck.safe) {
                throw McpErrors.shellInjectionDetected(ShellSecurityEngine.formatViolations(argsCheck), 'run_cucumber_test');
            }
        }
        // Resolve config + timeout BEFORE the execution try-catch so that:
        //   1. Invalid timeoutMs throws and rejects the promise (instead of being swallowed)
        //   2. The resolved timeout is available in the catch block for output logging
        const configService = new McpConfigService();
        let config;
        try {
            config = configService.read(projectRoot);
        }
        catch {
            config = null;
        }
        // resolveTimeout throws for invalid values → propagates to caller
        const timeout = await this.resolveTimeout(projectRoot, options?.timeoutMs, config);
        try {
            const fs = await import('fs');
            let command = '';
            if (options?.overrideCommand) {
                // Validate overrideCommand doesn't contain obvious injection attempts via ShellSecurityEngine
                const overrideArgs = options.overrideCommand.split(/\s+/).filter(a => a.length > 0);
                const argCheck = ShellSecurityEngine.validateArgs(overrideArgs, 'run_cucumber_test');
                if (!argCheck.safe) {
                    throw McpErrors.shellInjectionDetected(ShellSecurityEngine.formatViolations(argCheck), 'run_cucumber_test');
                }
                command = options.overrideCommand;
            }
            else if (config?.project?.executionCommand) {
                command = config.project.executionCommand;
            }
            else {
                const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
                    ? 'wdio.conf.ts'
                    : fs.existsSync(path.join(projectRoot, 'wdio.conf.js'))
                        ? 'wdio.conf.js'
                        : null;
                if (defaultConf) {
                    command = `npx wdio run ${defaultConf}`;
                    Logger.info(`No executionCommand configured — using detected: ${command}`);
                }
                else {
                    throw new AppForgeError("E008_PRECONDITION_FAIL", 'No test execution command found.', ['Add "project": { "executionCommand": "npx wdio run wdio.conf.ts" } to mcp-config.json',
                        'Or pass overrideCommand to run_cucumber_test']);
                }
            }
            // We only append specific arguments if we're dealing with a wdio execution command natively
            // Otherwise we just run the custom execution command as-is
            if (!command)
                throw McpErrors.configValidationFailed('No test execution command found. Set project.executionCommand or provide overrideCommand.', 'run_cucumber_test');
            // Issue #17 FIX: Parse command into executable + args, then build args array
            const parts = command.split(/\s+/).filter(p => p.length > 0);
            const exe = parts.shift(); // Get first part (e.g., 'npx')
            if (!exe)
                throw McpErrors.invalidExecutable(command || '<empty>', 'run_cucumber_test');
            // Additional safety: validate executable name doesn't contain path traversal
            if (exe.includes('..') || exe.includes('/') && !exe.startsWith('/')) {
                throw McpErrors.invalidExecutable(exe, 'run_cucumber_test');
            }
            const args = parts;
            let configName = 'wdio.conf.ts';
            const isWdio = command.includes('wdio');
            if (isWdio && options?.platform) {
                const specificConfig = `wdio.${options.platform}.conf.ts`;
                if (fs.existsSync(path.join(projectRoot, specificConfig))) {
                    configName = specificConfig;
                    // Replace generic wdio.conf.ts with specific if it exists in args
                    const index = args.findIndex(p => p.includes('wdio.conf.ts'));
                    if (index !== -1)
                        args[index] = specificConfig;
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
                    }
                    else {
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
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
            }
            return {
                success: true,
                output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${stdout + stderr}`,
                reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
                stats
            };
        }
        catch (error) {
            // Cucumber exits non-zero on test failures
            let stats;
            try {
                stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
            }
            // Auto-capture failure context from live session if available
            let failureContext;
            if (this.sessionManager?.hasActiveSession(projectRoot)) {
                try {
                    const sessionService = await this.sessionManager.getSession(projectRoot);
                    const screenshot = await sessionService.takeScreenshot();
                    const storage = new ScreenshotStorage(projectRoot);
                    const stored = storage.store(screenshot, 'failure');
                    failureContext = {
                        screenshotPath: stored.relativePath,
                        screenshotSize: stored.size,
                        pageSource: await sessionService.getPageSource(),
                        timestamp: new Date().toISOString()
                    };
                }
                catch {
                    // Session might have died during test — ignore
                }
            }
            // Issue #3 / #12 FIX: Classify well-known wdio failure patterns so callers get
            // structured diagnostics instead of raw stderr walls of text.
            const rawOutput = (error.stdout || '') + (error.stderr || '');
            const diagnosis = ExecutionService.classifyWdioError(rawOutput);
            return {
                success: false,
                // Include timeout prefix in failure output so callers can always see resolution source
                output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${error.stdout || ''}`,
                error: error.stderr || error.message,
                ...(diagnosis && { diagnosis }),
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
    async inspectHierarchy(projectRoot, xmlDump, screenshotBase64, stepHints, includeRawXml) {
        let xml = xmlDump ?? '';
        let screenshot = screenshotBase64 ?? '';
        let source = 'provided';
        // FAST PATH: If stepHints provided, try native on-device query first
        if (stepHints && stepHints.length > 0 && !xmlDump) {
            const keywords = this.extractStepKeywords(stepHints);
            let platform = 'android';
            if (this.sessionManager?.hasActiveSession(projectRoot)) {
                const sessionService = await this.sessionManager.getSession(projectRoot);
                platform = sessionService.getPlatform() ?? 'android';
            }
            const nativeElements = await this.findElementsByKeywords(keywords, platform, projectRoot);
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
        if (!xml && this.sessionManager?.hasActiveSession(projectRoot)) {
            const sessionService = await this.sessionManager.getSession(projectRoot);
            xml = await sessionService.getPageSource();
            // Cache the XML for self-heal recovery (chicken-and-egg fix)
            sessionService.cacheXml(xml);
            screenshot = await sessionService.takeScreenshot();
            source = 'live_session';
        }
        if (!xml) {
            throw new AppForgeError('SESSION_REQUIRED', 'No active Appium session and no XML dump provided.', ['Call start_appium_session first before inspecting UI, or provide xmlDump.']);
        }
        let platformToUse = 'android';
        if (this.sessionManager?.hasActiveSession(projectRoot)) {
            const sessionService = await this.sessionManager.getSession(projectRoot);
            platformToUse = sessionService.getPlatform() ?? 'android';
        }
        const smartTree = MobileSmartTreeService.getInstance();
        const actionMap = smartTree.buildSparseMap(xml, platformToUse === 'both' ? 'android' : platformToUse, source);
        // Add context compression
        const ctxManager = ContextManager.getInstance();
        const screenNameMatch = actionMap.screenSummary.match(/^([^:]+)/);
        const screenName = screenNameMatch ? screenNameMatch[1] : 'UnknownScreen';
        ctxManager.recordScan(undefined, screenName, actionMap);
        const history = ctxManager.getCompactedHistory();
        if (history) {
            Logger.info('[ContextManager] Injecting compacted screen history');
        }
        const snapshot = actionMap.dehydratedText;
        // Store screenshot locally instead of returning base64 in response
        let screenshotPath;
        let screenshotSize;
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
            screenshotSize,
            timestamp: new Date().toISOString(),
            source,
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
    extractStepKeywords(steps) {
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
            ...new Set(steps.flatMap(step => step
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 2 && !STOP_WORDS.has(word))))
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
    async findElementsByKeywords(keywords, platform, projectRoot) {
        if (!this.sessionManager?.hasActiveSession(projectRoot))
            return [];
        const sessionService = await this.sessionManager.getSession(projectRoot);
        const driver = sessionService.getDriver();
        if (!driver)
            return [];
        const results = [];
        for (const kw of keywords) {
            try {
                if (platform === 'ios') {
                    // iOS NSPredicate: partial match, case-insensitive
                    const predicate = `label CONTAINS[cd] "${kw}" OR name CONTAINS[cd] "${kw}" OR value CONTAINS[cd] "${kw}"`;
                    const els = await driver.$$(`-ios predicate string:${predicate}`);
                    let count = 0;
                    for (const el of els) {
                        if (count++ >= 5)
                            break;
                        const label = await el.getAttribute('label') ?? '';
                        const name = await el.getAttribute('name') ?? '';
                        const tag = await el.getAttribute('type') ?? 'XCUIElementTypeOther';
                        const locator = name ? `~${name}` : `label:${label}`;
                        if (label || name)
                            results.push({ locator, text: label || name, tag });
                    }
                }
                else {
                    // Android UiSelector: textContains OR descriptionContains
                    const textSelector = `new UiSelector().textContains("${kw}")`;
                    const descSelector = `new UiSelector().descriptionContains("${kw}")`;
                    for (const sel of [textSelector, descSelector]) {
                        try {
                            const els = await driver.$$(`android=${sel}`);
                            let count = 0;
                            for (const el of els) {
                                if (count++ >= 5)
                                    break;
                                const text = await el.getText() ?? '';
                                const desc = await el.getAttribute('content-desc') ?? '';
                                const resId = await el.getAttribute('resource-id') ?? '';
                                const tag = await el.getAttribute('class') ?? 'android.view.View';
                                const locator = desc ? `~${desc}` : resId ? `id=${resId}` : text ? `text=${text}` : '';
                                if (locator)
                                    results.push({ locator, text: text || desc, tag });
                            }
                        }
                        catch { /* element not found for this selector — continue */ }
                    }
                }
            }
            catch {
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
    async resolveTimeout(projectRoot, explicitTimeoutMs, config) {
        // 1. Explicit parameter
        if (explicitTimeoutMs !== undefined && explicitTimeoutMs !== null) {
            if (typeof explicitTimeoutMs !== 'number' || explicitTimeoutMs <= 0) {
                throw McpErrors.invalidTimeout(explicitTimeoutMs, 'run_cucumber_test');
            }
            // Cap at 4 hours for large test suites (Issue L2 fix)
            const cappedTimeout = Math.min(explicitTimeoutMs, 14400000);
            if (cappedTimeout !== explicitTimeoutMs) {
                Logger.warn(`Timeout capped at 4 hours (14400000ms). Requested: ${explicitTimeoutMs}ms`);
            }
            return { value: cappedTimeout, source: 'explicit' };
        }
        // 2. mcp-config.json
        if (config?.execution?.timeoutMs) {
            const configTimeout = config.execution.timeoutMs;
            if (typeof configTimeout === 'number' && configTimeout > 0) {
                const cappedTimeout = Math.min(configTimeout, 14400000);
                return { value: cappedTimeout, source: 'mcp-config' };
            }
        }
        // 3. Detect from project (wdio.conf.ts/js)
        const detectedTimeout = await this.detectProjectTimeout(projectRoot);
        if (detectedTimeout) {
            return { value: detectedTimeout, source: 'detected(wdio.conf)' };
        }
        // 4. Default: 2 hours (increased for large test suites - Issue L2 fix)
        return { value: 7200000, source: 'default' };
    }
    /**
     * Attempts to detect timeout from wdio.conf.ts/js.
     * Looks for cucumberOpts.timeout (per-step timeout) or waitforTimeout (element wait timeout).
     * Best-effort detection using regex patterns.
     */
    async detectProjectTimeout(projectRoot) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            // Check for wdio.conf.ts or wdio.conf.js
            const configFiles = ['wdio.conf.ts', 'wdio.conf.js'];
            for (const configFile of configFiles) {
                const configPath = path.default.join(projectRoot, configFile);
                if (!fs.default.existsSync(configPath))
                    continue;
                const check = FileGuard.isBinary(configPath);
                if (check.binary) {
                    return null;
                }
                const content = fs.default.readFileSync(configPath, 'utf8');
                // Priority 1: cucumberOpts.timeout — per-step Cucumber timeout
                const cucumberTimeoutMatch = content.match(/cucumberOpts[\s\S]{0,200}?timeout\s*:\s*(\d+)/);
                if (cucumberTimeoutMatch) {
                    const timeout = parseInt(cucumberTimeoutMatch[1], 10);
                    if (timeout > 0) {
                        Logger.info(`Detected cucumberOpts.timeout from ${configFile}: ${timeout}ms`);
                        return timeout;
                    }
                }
                // Priority 2: waitforTimeout — global element wait timeout
                const waitforTimeoutMatch = content.match(/waitforTimeout\s*:\s*(\d+)/);
                if (waitforTimeoutMatch) {
                    const timeout = parseInt(waitforTimeoutMatch[1], 10);
                    if (timeout > 0) {
                        Logger.info(`Detected waitforTimeout from ${configFile}: ${timeout}ms`);
                        return timeout;
                    }
                }
            }
            return null;
        }
        catch (error) {
            // Fail silently and fall back to default
            return null;
        }
    }
    /**
     * Parses Cucumber JSON report for structured test stats.
     */
    async parseReport(reportPath) {
        try {
            const { readFile } = await import('fs/promises');
            const raw = await readFile(reportPath, 'utf8');
            const features = JSON.parse(raw);
            let total = 0, passed = 0, failed = 0, skipped = 0;
            for (const feature of features) {
                for (const scenario of (feature.elements ?? [])) {
                    if (scenario.type !== 'scenario')
                        continue;
                    total++;
                    const steps = scenario.steps ?? [];
                    if (steps.some((s) => s.result?.status === 'failed')) {
                        failed++;
                    }
                    else if (steps.some((s) => s.result?.status === 'skipped' || s.result?.status === 'undefined')) {
                        skipped++;
                    }
                    else {
                        passed++;
                    }
                }
            }
            return { total, passed, failed, skipped };
        }
        catch {
            return undefined;
        }
    }
    /**
     * Parses wdio output for well-known failure modes and returns a structured diagnosis.
     */
    static classifyWdioError(output) {
        if (!output)
            return undefined;
        if (output.includes('Missing capabilities')) {
            return 'WDIO ERROR: Missing capabilities. Your mcp-config.json capabilities do not match what the test runner requires, or you are running an Android test with iOS capabilities.';
        }
        if (output.includes('ECONNREFUSED')) {
            return 'APPIUM ERROR: Connection refused. Appium server is not running or is not reachable at the specified port (4723). Run start_appium_session or manually start Appium.';
        }
        if (output.includes('ETIMEDOUT') || output.includes('timeout')) {
            return 'TIMEOUT ERROR: The test execution exceeded the maximum allowed time. The app might be hanging, or Appium is overloaded.';
        }
        if (output.includes('An unknown server-side error occurred')) {
            return 'APPIUM ERROR: Unknown server-side error. This usually happens when the app crashes, the UI Automator server dies, or invalid locators are used natively.';
        }
        if (output.includes('Could not find a connected Android device') || output.includes('No device connected')) {
            return 'DEVICE ERROR: No connected device or emulator found. Ensure a device is connected via USB with USB debugging enabled, or an emulator is running.';
        }
        return undefined;
    }
    // ---------------------------------------------------------------------------
    // Async Job Queue API
    // ---------------------------------------------------------------------------
    /**
     * Non-blocking variant of runTest.
     *
     * Immediately returns a jobId. The actual test execution runs in the background.
     * Call getTestStatus(jobId) to poll for the result.
     *
     * This pattern was introduced to prevent MCP client RPC timeouts (typically 60s)
     * from killing the connection before a test suite finishes booting (Appium emulator
     * start + W3C negotiation often takes 70-120s for even a single scenario).
     */
    runTestAsync(projectRoot, options) {
        const jobId = this.newJobId();
        const job = {
            jobId,
            status: 'running',
            startedAt: new Date().toISOString()
        };
        this.jobs.set(jobId, job);
        // Fire-and-forget: intentionally NOT awaited so the tool handler returns immediately
        this.runTest(projectRoot, options)
            .then((result) => {
            job.status = result.success ? 'completed' : 'failed';
            job.completedAt = new Date().toISOString();
            job.result = result;
            Logger.info(`[JobQueue] Job ${jobId} finished with status: ${job.status}`);
        })
            .catch((err) => {
            job.status = 'failed';
            job.completedAt = new Date().toISOString();
            job.result = {
                success: false,
                output: '',
                error: err instanceof Error ? err.message : String(err)
            };
            Logger.error(`[JobQueue] Job ${jobId} threw unexpectedly`, { error: String(err) });
        });
        return jobId;
    }
    /**
     * Poll the status of a running/completed job.
     *
     * @param jobId     - ID returned by runTestAsync
     * @param waitMs    - If the job is still running, sleep this many ms before
     *                    returning. Allows the LLM to call "check in 20s" and get
     *                    a single efficient blocking check rather than a rapid poll
     *                    loop. Max 55s to stay safely within the 60s socket timeout.
     */
    async getTestStatus(jobId, waitMs = 0) {
        const job = this.jobs.get(jobId);
        if (!job)
            return { found: false };
        if (job.status === 'running' && waitMs > 0) {
            const safeWait = Math.min(waitMs, 55_000); // never exceed 55s; keep inside 60s socket window
            await new Promise((resolve) => setTimeout(resolve, safeWait));
        }
        // Re-fetch in case the background promise resolved during our sleep
        const updatedJob = this.jobs.get(jobId);
        // Calculate progress for running jobs
        if (updatedJob.status === 'running') {
            const startTime = new Date(updatedJob.startedAt).getTime();
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - startTime) / 1000);
            // Estimate: typical Appium test takes 60-120s for boot + first scenario
            // Conservative estimate: 2 minutes total
            const estimatedTotal = 120;
            updatedJob.progress = {
                elapsedSeconds,
                estimatedTotal,
                lastActivity: new Date().toISOString()
            };
        }
        return { found: true, job: updatedJob };
    }
}
