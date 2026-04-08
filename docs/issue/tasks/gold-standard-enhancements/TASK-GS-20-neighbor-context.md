# TASK-GS-20 — Neighbor Context (Structural Fingerprinting for Healing)

**Status**: TODO (Conditional — implement if healing failure rate > 20% and locator IDs change frequently)  
**Effort**: Medium (~90 min)  
**Depends on**: GS-19 (Local Healer Cache), GS-09 (Sparse Action Map)  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

> ⚠️ **Decision Point**: Only implement this task if simple accessibility-id/resource-id healing fails >20% of the time due to element ID instability.

When an app is updated, element IDs may change entirely (e.g., `resource-id` changes from `login_btn` to `loginButton`). Standard locator healing fails because the old ID is nowhere in the new XML.

**Solution**: Store "neighbor context" — the surrounding elements (siblings and parent) — as a structural fingerprint. When an ID-based locator fails, use the fingerprint to locate the element by its structural position.

**Example**:
```
Original: id=login_btn  (now broken — ID changed to loginButton)

Neighbor fingerprint stored:
  parent: LinearLayout (contains: username_input, password_input, login_btn)
  siblings: [EditText "Username", EditText "Password"]
  position: 3rd child of login_form_container

Healed using fingerprint: 
  Find LinearLayout containing EditText "Username" AND EditText "Password"
  → Take its 3rd child → That's the login button
```

---

## What to Create

### File: `src/services/NeighborContextService.ts` (NEW)

```typescript
import * as fs from 'fs';
import * as path from 'path';

/**
 * Structural fingerprint of a UI element's neighborhood.
 */
export interface ElementFingerprint {
  // Identity
  targetLocator: string;    // Original locator this fingerprint describes
  platform: 'android' | 'ios';
  screenName?: string;

  // The element itself
  element: {
    role: string;           // button, input, etc.
    label: string;          // Best accessible label
    text?: string;          // Visible text (may change)
  };

  // Structural context (stable even when IDs change)
  parent: {
    className: string;
    childCount: number;
    resourceId?: string;
  };

  siblings: Array<{
    role: string;
    label: string;
    position: number;       // Index among siblings
  }>;

  targetPosition: number;   // Index of target element among siblings

  // Healing query (generated from fingerprint)
  healingXPath: string;     // XPath query that uses structure, not IDs

  createdAt: string;
  lastUsedAt: string;
}

/**
 * NeighborContextService — stores structural fingerprints for robust healing.
 *
 * When ID-based locators fail, fingerprints let us find the element
 * by its structural position relative to stable sibling elements.
 */
export class NeighborContextService {
  private static instance: NeighborContextService;

  private readonly STORE_FILE: string;
  private fingerprints: Map<string, ElementFingerprint> = new Map();
  private isDirty: boolean = false;

  private constructor() {
    this.STORE_FILE = path.join(process.cwd(), '.AppForge', 'neighbor-contexts.json');
    this.loadFromDisk();
  }

  public static getInstance(): NeighborContextService {
    if (!NeighborContextService.instance) {
      NeighborContextService.instance = new NeighborContextService();
    }
    return NeighborContextService.instance;
  }

  /**
   * Stores a structural fingerprint for a locator.
   * Call this when an element is first successfully located.
   */
  public store(fingerprint: Omit<ElementFingerprint, 'createdAt' | 'lastUsedAt'>): void {
    const key = this.makeKey(fingerprint.targetLocator, fingerprint.platform);
    const now = new Date().toISOString();

    this.fingerprints.set(key, {
      ...fingerprint,
      createdAt: now,
      lastUsedAt: now,
    });

    this.isDirty = true;
    this.saveToDisk(); // Persist synchronously for reliability
  }

  /**
   * Looks up a fingerprint for a given locator.
   */
  public lookup(locator: string, platform: 'android' | 'ios'): ElementFingerprint | null {
    const key = this.makeKey(locator, platform);
    const fp = this.fingerprints.get(key);
    if (!fp) return null;

    // Update last used time
    fp.lastUsedAt = new Date().toISOString();
    this.isDirty = true;

    return fp;
  }

  /**
   * Generates a structural healing XPath from ActionMap XML.
   * Used when the original ID-based locator fails.
   *
   * @param xml          Full Appium XML
   * @param fingerprint  The stored fingerprint to search with
   * @returns            An XPath that navigates by structure, or null if no match
   */
  public generateStructuralLocator(
    xml: string,
    fingerprint: ElementFingerprint
  ): string | null {
    // Build XPath using sibling labels (most stable anchor)
    const stableSiblings = fingerprint.siblings
      .filter(s => s.label && s.label.length > 2) // Skip empty labels
      .slice(0, 2); // Use first 2 siblings as anchors

    if (stableSiblings.length === 0) return null;

    // Android approach: find parent containing known siblings, get nth child
    if (fingerprint.platform === 'android') {
      const siblingConditions = stableSiblings
        .map(s => `.//*[@text="${s.label}" or @content-desc="${s.label}"]`)
        .join(' and ');

      return (
        `//${fingerprint.parent.className}[${siblingConditions}]` +
        `/*[${fingerprint.targetPosition + 1}]`
      );
    }

    // iOS approach: similar but using label
    const siblingConditions = stableSiblings
      .map(s => `.//*[@label="${s.label}" or @name="${s.label}"]`)
      .join(' and ');

    return (
      `//${fingerprint.parent.className}[${siblingConditions}]` +
      `/*[${fingerprint.targetPosition + 1}]`
    );
  }

  /**
   * Extracts a fingerprint from ActionMap elements (for a given element ref).
   * Call this after successful locate to pre-emptively store context.
   *
   * @param targetRef   e.g. "#3" — the element ref in the action map
   * @param actionMap   The current action map
   * @param xml         Full Appium XML (for parent/sibling parsing)
   */
  public extractFromActionMap(
    targetRef: string,
    locator: string,
    platform: 'android' | 'ios',
    actionMapElements: Array<{ ref: string; label: string; role: string }>,
    screenName?: string
  ): void {
    const targetIndex = actionMapElements.findIndex(e => e.ref === targetRef);
    if (targetIndex === -1) return;

    const target = actionMapElements[targetIndex];
    const siblings = actionMapElements
      .filter((_, i) => Math.abs(i - targetIndex) <= 3 && i !== targetIndex)
      .map((e, i) => ({ role: e.role, label: e.label, position: i }));

    const healingXPath = platform === 'android'
      ? `//android.view.ViewGroup[.//*[@text="${target.label}"]]`
      : `//*[@label="${target.label}"]`;

    this.store({
      targetLocator: locator,
      platform,
      screenName,
      element: { role: target.role, label: target.label },
      parent: { className: 'ViewGroup', childCount: actionMapElements.length },
      siblings,
      targetPosition: targetIndex,
      healingXPath,
    });
  }

  // ─── Private persistence ──────────────────────────────────────────────────

  private makeKey(locator: string, platform: string): string {
    return `${platform}::${locator}`;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.STORE_FILE)) {
        const data = JSON.parse(fs.readFileSync(this.STORE_FILE, 'utf-8'));
        if (Array.isArray(data)) {
          for (const fp of data) {
            this.fingerprints.set(this.makeKey(fp.targetLocator, fp.platform), fp);
          }
        }
      }
    } catch { /* non-fatal */ }
  }

  private saveToDisk(): void {
    if (!this.isDirty) return;
    try {
      const appForgeDir = path.dirname(this.STORE_FILE);
      if (!fs.existsSync(appForgeDir)) {
        fs.mkdirSync(appForgeDir, { recursive: true });
      }
      const data = [...this.fingerprints.values()];
      fs.writeFileSync(this.STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
      this.isDirty = false;
    } catch { /* non-fatal */ }
  }
}
```

---

## What to Update

### File: `src/services/SelfHealingService.ts`

After basic cache lookup (GS-19) fails, try structural healing:

```typescript
import { NeighborContextService } from './NeighborContextService';

// In healTest(), after GS-19 cache miss:
const neighborService = NeighborContextService.getInstance();
const fingerprint = neighborService.lookup(failedLocator, platform);

if (fingerprint && rawXml) {
  const structuralLocator = neighborService.generateStructuralLocator(rawXml, fingerprint);
  if (structuralLocator) {
    const works = await this.verifyLocator(structuralLocator, platform);
    if (works) {
      return {
        success: true,
        originalLocator: failedLocator,
        healedLocator: structuralLocator,
        attempts: 1,
        fromStructuralFingerprint: true,
        message: `Healed using structural fingerprint (neighbor context healing)`,
      };
    }
  }
}

// Fall through to LLM healing...
```

---

## Verification

1. Run `npm run build` — must pass

2. Verify `neighbor-contexts.json` is created after successful element location

3. Test structural locator generation:
   ```typescript
   import { NeighborContextService } from './src/services/NeighborContextService';

   const service = NeighborContextService.getInstance();
   service.store({
     targetLocator: '~login_btn',
     platform: 'android',
     element: { role: 'button', label: 'Login' },
     parent: { className: 'android.widget.LinearLayout', childCount: 3 },
     siblings: [
       { role: 'input', label: 'Username', position: 0 },
       { role: 'input', label: 'Password', position: 1 },
     ],
     targetPosition: 2,
     healingXPath: '//android.widget.LinearLayout[.//EditText[@text="Username"]]/*[3]',
   });

   const fp = service.lookup('~login_btn', 'android');
   console.assert(fp !== null, 'Fingerprint should be stored');
   console.log('NeighborContext test passed');
   ```

---

## Done Criteria

- [ ] `NeighborContextService.ts` created with `store()`, `lookup()`, `generateStructuralLocator()`
- [ ] Fingerprints persisted to `.AppForge/neighbor-contexts.json`
- [ ] Structural locator generation uses sibling labels as XPath anchors
- [ ] Integrated into `SelfHealingService` as fallback before LLM healing
- [ ] `npm run build` passes with zero errors
- [ ] Test confirms fingerprint roundtrip (store → lookup)
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Implement after GS-19** — this is a complementary approach; both are conditional
- **JSON storage** (vs. SQLite) for simplicity — fingerprint count is typically small (<1000 entries)
- **Structural locator quality** depends on element label stability — works well when visible text is static
- **Only store fingerprints for successfully located elements** — don't store fingerprints for failed locates
