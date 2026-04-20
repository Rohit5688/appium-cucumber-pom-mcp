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

      const { locator, strategy } = this.getBestLocator(attrs, label, platform);
      const role = this.inferRole(tagName, attrs);
      const states = this.getStates(attrs, editable);

      elements.push({
        ref: `#${ref++}`,
        role,
        label,
        locator,
        strategy,
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
    const header = `UI Action Map — ${summary}\n${'─'.repeat(80)}\n`;
    const colHeader = `${'Ref'.padEnd(6)}${'Role'.padEnd(12)}${'Label'.padEnd(28)}${'Locator'.padEnd(28)}States\n`;
    const divider = `${'─'.repeat(80)}\n`;

    const rows = elements.map(el => {
      const label = el.label.length > 26 ? el.label.substring(0, 24) + '..' : el.label;
      const locator = el.locator.length > 26 ? el.locator.substring(0, 24) + '..' : el.locator;
      return `${el.ref.padEnd(6)}${el.role.padEnd(12)}${label.padEnd(28)}${locator.padEnd(28)}[${el.states.join(', ')}]`;
    });

    return header + colHeader + divider + rows.join('\n');
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
  ): { locator: string; strategy: LocatorStrategy } {
    // Priority 1 (both): accessibility-id / content-desc — most stable, cross-platform
    const contentDesc = attrs['content-desc'] || attrs['accessibilityLabel'];
    if (contentDesc) {
      return { locator: `~${contentDesc}`, strategy: 'accessibility id' };
    }

    // Priority 2 (Android): resource-id — stable if app doesn't obfuscate IDs
    if (platform === 'android') {
      const resourceId = attrs['resource-id'];
      if (resourceId) {
        return { locator: `id=${resourceId}`, strategy: 'id' };
      }
    }

    // Priority 3 (iOS): name attribute with no content-desc → maps to accessibility-id
    // iOS UIAutomation uses `name` attr; Appium exposes it as ~name via accessibility-id
    if (platform === 'ios') {
      const iosName = attrs['name'];
      if (iosName && iosName !== label) {
        return { locator: `~${iosName}`, strategy: 'accessibility id' };
      }
    }

    // Priority 4 (Android): visible text via UIAutomator — more reliable than XPath
    if (platform === 'android' && label && label !== attrs['resource-id']?.split('/').pop()) {
      return {
        locator: `-android uiautomator:new UiSelector().text("${label.replace(/"/g, '\\"')}")`,
        strategy: '-android uiautomator',
      };
    }

    // Priority 5 (iOS): predicate string — label or value text match, namespace-safe
    if (platform === 'ios') {
      const iosLabel = attrs['label'] || label;
      if (iosLabel) {
        // Try label= first (matches accessibility label), then value= for inputs
        const field = attrs['value'] ? 'value' : 'label';
        return {
          locator: `-ios predicate string:${field} == "${iosLabel.replace(/"/g, '\\"')}"`,
          strategy: '-ios predicate string',
        };
      }
    }

    // Priority 6: coordinate fallback — last resort, no stable selector available
    // Bounds are emitted as-is; caller must handle [ coordinate-fallback ] hint
    return { locator: `[coordinate-fallback: ${attrs['bounds'] ?? 'unknown'}]`, strategy: 'coordinate-fallback' as LocatorStrategy };
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
}
