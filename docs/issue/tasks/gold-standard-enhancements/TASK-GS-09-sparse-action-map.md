# TASK-GS-09 — Sparse Action Map (MobileSmartTreeService)

**Status**: DONE  
**Effort**: Large (~3 hours)  
**Depends on**: GS-07 (Type System Expansion) — uses `UiElement`, `InspectionResult` types  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Appium's `getPageSource()` returns 50-200KB of XML for a typical mobile screen. Passing this raw XML to an LLM wastes massive tokens:

- A login screen XML: ~50KB → ~12,500 tokens
- A product list screen XML: ~200KB → ~50,000 tokens
- These tokens buy nothing — 90% of the XML is structural noise irrelevant to test generation

**Goal**: Create `MobileSmartTreeService` that reduces XML to a compact, dehydrated action map containing only interactive elements and their best locators.

**Expected result**: 50KB XML → ~2KB action map (96% reduction)

---

## What to Create

### File: `src/services/MobileSmartTreeService.ts` (NEW)

```typescript
import * as crypto from 'crypto';
import { UiElement, Platform, LocatorStrategy } from '../types/AppiumTypes';

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
    const totalElements = (xml.match(/<[A-Z]/g) || []).length; // Rough count

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
    // Priority: accessibility-id > resource-id > xpath
    const contentDesc = attrs['content-desc'] || attrs['accessibilityLabel'];
    if (contentDesc) return { locator: `~${contentDesc}`, strategy: 'accessibility id' };

    const resourceId = attrs['resource-id'];
    if (resourceId) return { locator: `id=${resourceId}`, strategy: 'id' };

    // Fallback: text-based xpath
    if (label && label !== attrs['resource-id']?.split('/').pop()) {
      const xpath = platform === 'android'
        ? `//*[@text="${label}"]`
        : `//*[@label="${label}"]`;
      return { locator: xpath, strategy: 'xpath' };
    }

    return { locator: `//[${label}]`, strategy: 'xpath' };
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
```

---

## What to Update

### File: `src/services/ExecutionService.ts`

Find the `inspect_ui_hierarchy` tool handler or wherever `getPageSource()` is called. Update to return dehydrated map:

```typescript
import { MobileSmartTreeService } from './MobileSmartTreeService';

// After getting rawXml from Appium:
const rawXml = await driver.getPageSource();
const platform = session.platform; // 'android' | 'ios'

const smartTree = MobileSmartTreeService.getInstance();
const actionMap = smartTree.buildSparseMap(rawXml, platform, args.screenName);

// Return the dehydrated text instead of raw XML
return {
  success: true,
  screenSummary: actionMap.screenSummary,
  actionMap: actionMap.dehydratedText,
  elementCount: actionMap.interactiveCount,
  // Include raw XML ONLY if explicitly requested:
  rawXml: args.includeRawXml ? rawXml : undefined,
};
```

---

## Verification

1. Run: `npm run build` — must pass

2. Test with a sample XML payload:

```typescript
import { MobileSmartTreeService } from './src/services/MobileSmartTreeService';

const sampleXml = `
<hierarchy>
  <android.widget.EditText resource-id="com.app:id/username" text="" content-desc="Username field" clickable="true" enabled="true" bounds="[0,0][1080,180]"/>
  <android.widget.EditText resource-id="com.app:id/password" text="" content-desc="Password field" clickable="true" enabled="true" password="true" bounds="[0,200][1080,380]"/>
  <android.widget.Button resource-id="com.app:id/login_btn" text="Login" content-desc="Login" clickable="true" enabled="true" bounds="[0,400][1080,540]"/>
</hierarchy>
`;

const service = MobileSmartTreeService.getInstance();
const map = service.buildSparseMap(sampleXml, 'android', 'LoginScreen');

console.assert(map.interactiveCount === 3, 'Should find 3 interactive elements');
console.assert(map.elements[0].states.includes('editable'), 'Username should be editable');
console.assert(map.elements[1].states.includes('secure'), 'Password should be secure');
console.assert(map.elements[2].role === 'button', 'Login should be button');

console.log('Action Map Output:');
console.log(map.dehydratedText);
console.log('Compression ratio:', (sampleXml.length / map.dehydratedText.length).toFixed(1) + 'x');
```

3. Expected dehydrated output:
```
UI Action Map — LoginScreen: 3 interactive elements (3 total in XML)
────────────────────────────────────────────────────────────────────────────────
Ref   Role        Label                       Locator                     States
────────────────────────────────────────────────────────────────────────────────
#1    input       Username field              ~Username field             [clickable, editable]
#2    input       Password field              ~Password field             [clickable, editable, secure]
#3    button      Login                       ~Login                      [clickable]
```

---

## Done Criteria

- [ ] `MobileSmartTreeService.ts` created with `buildSparseMap()`, `ActionMap`, `ActionElement`
- [ ] Selector priority: accessibility-id > resource-id > xpath
- [ ] Dehydrated text table generated with correct columns
- [ ] Delta caching prevents re-processing unchanged XML
- [ ] `ExecutionService.ts` uses sparse map instead of raw XML for `inspect_ui_hierarchy`
- [ ] Test confirms 40x+ compression on sample XML
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **This is the single biggest token saver** — implement this early in Tier 1
- **Regex-based parser** is used instead of heavy XML libraries to keep dependencies minimal
- **Cache TTL is 30 seconds** — covers back-to-back tool calls on same screen
- **Raw XML still accessible** via `includeRawXml` flag for debugging
- **Locator output** matches WD/WebdriverIO format for direct use in generated tests
