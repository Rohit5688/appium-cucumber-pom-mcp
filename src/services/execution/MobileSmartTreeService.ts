import * as crypto from 'crypto';
import { UiElement, Platform, LocatorStrategy } from '../../types/AppiumTypes.js';

/**
 * Represents a single interactive element in the dehydrated action map.
 */
export interface ActionElement {
  ref: string;              // #1, #2, #3 — short reference for the LLM to use
  role: 'button' | 'input' | 'text' | 'switch' | 'checkbox' | 'image' | 'other';
  label: string;            // Best human-readable label (text > contentDesc > resourceId)
  locator: string;          // Best locator in WD format: ~label, id=resourceId, //xpath
  strategy: LocatorStrategy;
  locatorQuality: '✅ stable' | '⚠️ fragile' | '❌ brittle'; // NEW: ranked for LLM
  states: string[];         // ['clickable', 'editable', 'secure', 'disabled']
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * The complete action map returned for an inspected screen.
 */
export interface ActionMap {
  screenSummary: string;    // e.g. "LoginScreen: 8 interactive elements"
  platform: Platform;
  xmlHash: string;
  elements: ActionElement[];
  dehydratedText: string;   // Pre-formatted table for direct LLM injection
  totalElements: number;    // Total elements in XML (for context)
  interactiveCount: number; // Count of elements in this map
}

// ── Compact Tree Types & Schemas ─────────────────────────────────────────────

export interface CompactNode {
  b?: string;        // bounds
  txt?: string;      // text / label
  rid?: string;      // resource-id (package prefix stripped)
  a11y?: string;     // content-desc / accessibilityLabel
  hint?: string;     // hintText
  val?: string;      // value (iOS slider, text-field current value)
  cls?: string;      // class / type (short name only)
  clickable?: true;  // omitted when false (default)
  enabled?: false;   // omitted when true (default)
  checked?: true;    // omitted when false
  focused?: true;    // omitted when false
  selected?: true;   // omitted when false
  scroll?: true;     // omitted when false
  c?: CompactNode[]; // children
}

interface RawXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: RawXmlNode[];
}

const ANDROID_COMPACT_SCHEMA = {
  platform: 'android',
  abbreviations: {
    b: 'bounds', txt: 'text', rid: 'resource-id (pkg prefix stripped)',
    a11y: 'content-desc', hint: 'hintText', cls: 'class (short)',
    scroll: 'scrollable', c: 'children',
  },
  defaults: {
    enabled: true, clickable: false, focused: false,
    selected: false, checked: false, scrollable: false,
  },
} as const;

const IOS_COMPACT_SCHEMA = {
  platform: 'ios',
  abbreviations: {
    b: 'bounds', txt: 'label/text', rid: 'name / identifier',
    a11y: 'accessibilityLabel', val: 'value', hint: 'hintText',
    cls: 'type (short)', scroll: 'scrollable', c: 'children',
  },
  defaults: {
    enabled: true, focused: false, selected: false,
    checked: false, scrollable: false,
  },
} as const;

type CompactSchema = typeof ANDROID_COMPACT_SCHEMA | typeof IOS_COMPACT_SCHEMA;

/**
 * MobileSmartTreeService — reduces raw Appium XML to minimal action maps.
 *
 * TOKEN SAVINGS: 50-200KB XML → 1-5KB dehydrated table (40-100x reduction)
 */
export class MobileSmartTreeService {
  private static instance: MobileSmartTreeService;
  private scanCache: Map<string, { map: ActionMap; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  public static getInstance(): MobileSmartTreeService {
    if (!MobileSmartTreeService.instance) {
      MobileSmartTreeService.instance = new MobileSmartTreeService();
    }
    return MobileSmartTreeService.instance;
  }

  /**
   * Builds a sparse action map from raw Appium XML.
   * Returns cached result if XML hash unchanged within TTL.
   */
  public buildSparseMap(xml: string, platform: Platform, screenName?: string): ActionMap {
    const xmlHash = this.hashXml(xml);

    // Return cached result if XML is unchanged
    const cached = this.scanCache.get(xmlHash);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.map;
    }

    const elements = this.extractInteractiveElements(xml, platform);
    const interactiveCount = elements.length;
    const totalElements = (xml.match(/<[a-zA-Z]/g) || []).length; // Rough count

    const screenSummary = `${screenName ?? 'Screen'}: ${interactiveCount} interactive elements (${totalElements} total in XML)`;

    const actionMap: ActionMap = {
      screenSummary,
      platform,
      xmlHash,
      elements,
      dehydratedText: this.buildDehydratedText(elements, screenSummary),
      totalElements,
      interactiveCount,
    };

    this.scanCache.set(xmlHash, { map: actionMap, timestamp: Date.now() });
    return actionMap;
  }

  /**
   * Extracts interactive elements from Appium XML.
   * Only includes: buttons, inputs, checkboxes, switches, and labeled clickables.
   */
  private extractInteractiveElements(xml: string, platform: Platform): ActionElement[] {
    const elements: ActionElement[] = [];
    let ref = 1;

    // Parse XML attributes using regex (avoids heavy XML parser dependency)
    const elementPattern = /<([A-Za-z.]+)\s([^>]*?)\/>/g;
    let match: RegExpExecArray | null;

    while ((match = elementPattern.exec(xml)) !== null) {
      const tagName = match[1];
      const attrs = this.parseAttributes(match[2]);

      const clickable = attrs['clickable'] === 'true';
      const enabled = attrs['enabled'] !== 'false';
      const editable = this.isEditable(tagName, attrs);
      const isInteractive = clickable || editable;

      if (!isInteractive || !enabled) continue;

      const label = this.getBestLabel(attrs, tagName);
      if (!label || label.length < 1) continue; // Skip unlabeled interactive elements

      const { locator, strategy, locatorQuality } = this.getBestLocator(attrs, label, platform);
      const role = this.inferRole(tagName, attrs);
      const states = this.getStates(attrs, editable);

      elements.push({
        ref: `#${ref++}`,
        role,
        label,
        locator,
        strategy,
        locatorQuality,
        states,
        bounds: this.parseBounds(attrs['bounds']),
      });
    }

    return elements;
  }

  /**
   * Builds the dehydrated text table for LLM injection.
   * Format: #ref   role        label                  locator                 [states]
   */
  private buildDehydratedText(elements: ActionElement[], summary: string): string {
    const header = `UI Action Map — ${summary}\n${'─'.repeat(90)}\n`;
    const colHeader = `${'Ref'.padEnd(6)}${'Role'.padEnd(12)}${'Label'.padEnd(28)}${'Locator'.padEnd(28)}${'Quality'.padEnd(12)}States\n`;
    const divider = `${'─'.repeat(90)}\n`;

    const rows = elements.map(el => {
      const label = el.label.length > 26 ? el.label.substring(0, 24) + '..' : el.label;
      const locator = el.locator.length > 26 ? el.locator.substring(0, 24) + '..' : el.locator;
      let row = `${el.ref.padEnd(6)}${el.role.padEnd(12)}${label.padEnd(28)}${locator.padEnd(28)}${el.locatorQuality.padEnd(12)}[${el.states.join(', ')}]`;
      // P4: Spatial hint for brittle elements — LLM alternative when no stable locator exists
      if (el.locatorQuality === '\u274c brittle' && el.bounds) {
        const { x, y, width, height } = el.bounds;
        row += `\n      \u26a0\ufe0f  No stable locator. Bounds: [${x},${y}][${x + width},${y + height}] — use coordinate tap or $('~ParentContainer').getChildByIndex(n).`;
      }
      return row;
    });

    // Quality summary block for LLM
    const stable = elements.filter(e => e.locatorQuality === '✅ stable').length;
    const fragile = elements.filter(e => e.locatorQuality === '⚠️ fragile').length;
    const brittle = elements.filter(e => e.locatorQuality === '❌ brittle').length;
    const qualitySummary =
      `\n[LOCATOR QUALITY SUMMARY] stable: ${stable} | fragile: ${fragile} | brittle: ${brittle}\n` +
      (brittle > 0 ? `⚠️ ${brittle} element(s) have coordinate-fallback locators — inspect XML manually or use tap(x,y) with bounds.\n` : '') +
      (fragile > 0 ? `⚠️ ${fragile} element(s) use UIAutomator/predicate — retest after UI refactor.\n` : '');

    return header + colHeader + divider + rows.join('\n') + qualitySummary;
  }

  /** Convert attributes string to key-value map */
  private parseAttributes(attrsStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrPattern = /(\w[\w-]*)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = attrPattern.exec(attrsStr)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  private isEditable(tagName: string, attrs: Record<string, string>): boolean {
    const editableClasses = ['EditText', 'TextInput', 'TextField', 'SecureTextField'];
    return editableClasses.some(c => tagName.includes(c)) || attrs['focusable'] === 'true';
  }

  private getBestLabel(attrs: Record<string, string>, tagName: string): string {
    return attrs['text'] || attrs['content-desc'] || attrs['accessibilityLabel'] ||
           attrs['label'] || attrs['resource-id']?.split('/').pop() || tagName;
  }

  private getBestLocator(
    attrs: Record<string, string>,
    label: string,
    platform: Platform
  ): { locator: string; strategy: LocatorStrategy; locatorQuality: ActionElement['locatorQuality'] } {
    // Priority 1 (both): accessibility-id / content-desc — most stable, cross-platform
    const contentDesc = attrs['content-desc'] || attrs['accessibilityLabel'];
    if (contentDesc) {
      return { locator: `~${contentDesc}`, strategy: 'accessibility id', locatorQuality: '✅ stable' };
    }

    // Priority 2 (Android): resource-id — stable if app doesn't obfuscate IDs
    if (platform === 'android') {
      const resourceId = attrs['resource-id'];
      if (resourceId) {
        return { locator: `id=${resourceId}`, strategy: 'id', locatorQuality: '✅ stable' };
      }
    }

    // Priority 3 (iOS): name attribute with no content-desc → maps to accessibility-id
    if (platform === 'ios') {
      const iosName = attrs['name'];
      if (iosName && iosName !== label) {
        return { locator: `~${iosName}`, strategy: 'accessibility id', locatorQuality: '✅ stable' };
      }
    }

    // Priority 4 (Android): visible text via UIAutomator — fragile if text changes
    if (platform === 'android' && label && label !== attrs['resource-id']?.split('/').pop()) {
      return {
        locator: `-android uiautomator:new UiSelector().text("${label.replace(/"/g, '\\"')}")`,
        strategy: '-android uiautomator',
        locatorQuality: '⚠️ fragile',
      };
    }

    // Priority 5 (iOS): predicate string — fragile if text or label changes
    if (platform === 'ios') {
      const iosLabel = attrs['label'] || label;
      if (iosLabel) {
        const field = attrs['value'] ? 'value' : 'label';
        return {
          locator: `-ios predicate string:${field} == "${iosLabel.replace(/"/g, '\\"')}"`,
          strategy: '-ios predicate string',
          locatorQuality: '⚠️ fragile',
        };
      }
    }

    // Priority 6: coordinate fallback — brittle, breaks on any layout change
    return { locator: `[coordinate-fallback: ${attrs['bounds'] ?? 'unknown'}]`, strategy: 'coordinate-fallback' as LocatorStrategy, locatorQuality: '❌ brittle' };
  }

  private inferRole(tagName: string, attrs: Record<string, string>): ActionElement['role'] {
    if (tagName.includes('Button') || tagName.includes('ImageButton')) return 'button';
    if (tagName.includes('EditText') || tagName.includes('TextField') || tagName.includes('TextInput')) return 'input';
    if (tagName.includes('Switch') || tagName.includes('Toggle')) return 'switch';
    if (tagName.includes('CheckBox')) return 'checkbox';
    if (tagName.includes('ImageView') || tagName.includes('Image')) return 'image';
    if (attrs['clickable'] === 'true') return 'button';
    return 'other';
  }

  private getStates(attrs: Record<string, string>, editable: boolean): string[] {
    const states: string[] = [];
    if (attrs['clickable'] === 'true') states.push('clickable');
    if (editable) states.push('editable');
    if (attrs['password'] === 'true' || attrs['secure'] === 'true') states.push('secure');
    if (attrs['enabled'] === 'false') states.push('disabled');
    if (attrs['checked'] === 'true') states.push('checked');
    if (attrs['selected'] === 'true') states.push('selected');
    return states;
  }

  private parseBounds(boundsStr?: string): ActionElement['bounds'] | undefined {
    if (!boundsStr) return undefined;
    const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!m) return undefined;
    return {
      x: parseInt(m[1]),
      y: parseInt(m[2]),
      width: parseInt(m[3]) - parseInt(m[1]),
      height: parseInt(m[4]) - parseInt(m[2]),
    };
  }

  private hashXml(xml: string): string {
    return crypto.createHash('md5').update(xml).digest('hex').substring(0, 16);
  }

  /** Clear the scan cache (e.g., on screen navigation) */
  public clearCache(): void {
    this.scanCache.clear();
  }

  // ── Compact Tree API (Maestro-style) ─────────────────────────────────────────

  /**
   * Builds a Maestro-style compact tree from raw Appium XML.
   * Preserves parent-child structure while pruning zero-size nodes and empty containers.
   * Aliases long attribute names to single-letter keys and injects a ui_schema
   * so the LLM can decode them. Typically 60-80% fewer tokens than the flat table.
   *
   * Fixes the existing regex bug: the flat-table extractor only matches self-closing
   * tags (<Tag />). This parser also handles container tags (<Tag>...</Tag>),
   * which are common in Android hierarchy XML.
   */
  public buildCompactTree(
    xml: string,
    platform: Platform,
  ): { ui_schema: CompactSchema; elements: CompactNode[] } {
    const cacheKey = `compact:${this.hashXml(xml)}`;
    const cached = this.scanCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      return cached.map as unknown as { ui_schema: CompactSchema; elements: CompactNode[] };
    }
    const roots = this.parseXmlToTree(xml);
    const elements = this.buildCompactFromRaw(roots, platform);
    const schema: CompactSchema = platform === 'ios' ? IOS_COMPACT_SCHEMA : ANDROID_COMPACT_SCHEMA;
    const result = { ui_schema: schema, elements };
    // Reuse existing scanCache with TTL
    this.scanCache.set(cacheKey, { map: result as unknown as ActionMap, timestamp: Date.now() });
    return result;
  }

  /**
   * Stack-based XML parser. Handles both self-closing (<Tag />) and
   * container (<Tag>...</Tag>) elements — fixing the gap in the regex-only approach.
   */
  private parseXmlToTree(xml: string): RawXmlNode[] {
    const roots: RawXmlNode[] = [];
    const stack: RawXmlNode[] = [];
    const tagRe = /<(\/?)([ A-Za-z][A-Za-z0-9._-]*)(\s[^>]*)?(\/?)?>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(xml)) !== null) {
      const [, isClosing, tag, rawAttrs, selfClose] = m;
      if (isClosing === '/') {
        if (stack.length > 0) stack.pop();
        continue;
      }
      const node: RawXmlNode = { tag, attrs: this.parseAttributes(rawAttrs ?? ''), children: [] };
      if (stack.length > 0) stack[stack.length - 1].children.push(node);
      else roots.push(node);
      if (selfClose !== '/') stack.push(node);
    }
    return roots;
  }

  /** Recursively convert raw XML nodes to compact aliased nodes, pruning noise. */
  private buildCompactFromRaw(nodes: RawXmlNode[], platform: Platform): CompactNode[] {
    const results: CompactNode[] = [];
    for (const node of nodes) {
      if (this.compactHasZeroSize(node.attrs)) {
        results.push(...this.buildCompactFromRaw(node.children, platform));
        continue;
      }
      if (!this.compactHasContent(node.attrs, platform)) {
        results.push(...this.buildCompactFromRaw(node.children, platform));
        continue;
      }
      const compact = this.rawAttrsToCompact(node.attrs, platform);
      const children = this.buildCompactFromRaw(node.children, platform);
      if (children.length > 0) compact.c = children;
      results.push(compact);
    }
    return results;
  }

  private compactHasZeroSize(attrs: Record<string, string>): boolean {
    const bounds = attrs['bounds'];
    if (!bounds) return false;
    const m = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!m) return false;
    return (parseInt(m[3]) - parseInt(m[1]) === 0) || (parseInt(m[4]) - parseInt(m[2]) === 0);
  }

  /**
   * P3 — Schema-driven content check (Maestro pattern).
   * Compares boolean attrs against platform schema defaults instead of hardcoded checks.
   * A node is meaningful if ANY attribute value deviates from its platform default.
   */
  private compactHasContent(attrs: Record<string, string>, platform: Platform): boolean {
    const meaningful = ['text', 'content-desc', 'accessibilityLabel', 'label',
                        'resource-id', 'name', 'value', 'hintText', 'class', 'type'];
    if (meaningful.some(k => (attrs[k] ?? '').trim().length > 0)) return true;

    // Schema-driven boolean default check — adding a new attr to the schema covers it automatically
    const schema = platform === 'ios' ? IOS_COMPACT_SCHEMA : ANDROID_COMPACT_SCHEMA;
    const defaults = schema.defaults as Record<string, boolean>;
    for (const [key, defaultVal] of Object.entries(defaults)) {
      const raw = attrs[key];
      if (!raw) continue;
      if ((raw === 'true') !== defaultVal) return true;
    }
    return false;
  }


  /** Map raw attributes to compact aliased node (non-default values only). */
  private rawAttrsToCompact(attrs: Record<string, string>, platform: Platform): CompactNode {
    const n: CompactNode = {};
    if (attrs['bounds']) n.b = attrs['bounds'];
    const txt = attrs['text'] || (platform === 'ios' ? attrs['label'] : '');
    if (txt?.trim()) n.txt = txt;
    const rid = attrs['resource-id'] || (platform === 'ios' ? attrs['name'] : '');
    if (rid?.trim()) n.rid = rid.includes('/') ? rid.split('/').pop()! : rid;
    const a11y = attrs['content-desc'] || attrs['accessibilityLabel'];
    if (a11y?.trim()) n.a11y = a11y;
    const hint = attrs['hintText'];
    if (hint?.trim()) n.hint = hint;
    const val = attrs['value'];
    if (val?.trim()) n.val = val;
    const cls = attrs['class'] || attrs['type'];
    if (cls?.trim()) n.cls = cls.includes('.') ? cls.split('.').pop()! : cls;
    if (attrs['clickable'] === 'true') n.clickable = true;
    if (attrs['enabled'] === 'false') n.enabled = false;
    if (attrs['checked'] === 'true') n.checked = true;
    if (attrs['focused'] === 'true') n.focused = true;
    if (attrs['selected'] === 'true') n.selected = true;
    if (attrs['scrollable'] === 'true') n.scroll = true;
    return n;
  }

  // ── P5: YAML output (smaller than JSON for deeply nested trees ~30%) ─────────

  /**
   * Builds a Maestro-style compact tree serialized as YAML.
   * ~30% smaller than compact JSON for deeply nested screens.
   * Reuses buildCompactTree cache (same TTL).
   */
  public buildCompactYaml(xml: string, platform: Platform): string {
    const { ui_schema, elements } = this.buildCompactTree(xml, platform);
    const lines: string[] = ['---'];

    // Schema block
    lines.push('ui_schema:');
    lines.push(`  platform: ${ui_schema.platform}`);
    lines.push('  abbreviations:');
    for (const [k, v] of Object.entries(ui_schema.abbreviations)) {
      lines.push(`    ${k}: ${v}`);
    }
    lines.push('  defaults:');
    for (const [k, v] of Object.entries(ui_schema.defaults)) {
      lines.push(`    ${k}: ${v}`);
    }

    // Elements block
    lines.push('elements:');
    for (const node of elements) {
      lines.push(...this.compactNodeToYamlLines(node, 1));
    }
    return lines.join('\n');
  }

  // ── P7: CSV output with parent_id for tabular analysis ──────────────────

  /**
   * Builds a flat CSV with parent_id column from the compact tree.
   * Useful for tabular analysis: "find all clickable elements at depth 2" etc.
   * Reuses buildCompactTree cache (same TTL).
   */
  public buildCompactCsv(xml: string, platform: Platform): string {
    const { elements } = this.buildCompactTree(xml, platform);
    const header = 'id,parent_id,depth,b,txt,rid,a11y,hint,val,cls,clickable,enabled,checked,focused,selected,scroll';
    const rows: string[] = [header];
    let nextId = 0;

    const traverse = (nodes: CompactNode[], parentId: number | null, depth: number): void => {
      for (const node of nodes) {
        const currentId = nextId++;
        const q = (v: string | undefined) => v ? `"${v.replace(/"/g, '""')}"` : '';
        rows.push([
          currentId,
          parentId ?? '',
          depth,
          node.b ? `"${node.b}"` : '',
          q(node.txt),
          node.rid ?? '',
          q(node.a11y),
          node.hint ?? '',
          node.val ?? '',
          node.cls ?? '',
          node.clickable ? 'true' : '',
          node.enabled === false ? 'false' : '',
          node.checked ? 'true' : '',
          node.focused ? 'true' : '',
          node.selected ? 'true' : '',
          node.scroll ? 'true' : '',
        ].join(','));
        if (node.c) traverse(node.c, currentId, depth + 1);
      }
    };

    traverse(elements, null, 0);
    return rows.join('\n');
  }

  /**
   * Serializes a CompactNode to YAML lines at the given list depth.
   * Children use nested YAML sequence syntax.
   */
  private compactNodeToYamlLines(node: CompactNode, listDepth: number): string[] {
    const lines: string[] = [];
    const pad = '  '.repeat(listDepth);
    const listPad = '  '.repeat(listDepth - 1);

    const entries = (Object.entries(node) as [string, unknown][])
      .filter(([k, v]) => k !== 'c' && v !== undefined);

    entries.forEach(([k, v], i) => {
      const indent = i === 0 ? `${listPad}- ` : pad;
      if (typeof v === 'string') {
        // Quote strings that contain YAML-special characters
        const needsQuote = /[:#\[\]{}*!|>'"@`\n]/.test(v);
        const safeV = needsQuote ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v;
        lines.push(`${indent}${k}: ${safeV}`);
      } else {
        lines.push(`${indent}${k}: ${v}`);
      }
    });

    if (entries.length === 0) {
      // Node has only children — emit a bare list marker
      lines.push(`${listPad}-`);
    }

    if (node.c && node.c.length > 0) {
      lines.push(`${pad}c:`);
      for (const child of node.c) {
        lines.push(...this.compactNodeToYamlLines(child, listDepth + 1));
      }
    }
    return lines;
  }
}
