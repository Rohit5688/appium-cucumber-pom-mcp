# TASK-GS-07 — Type System Expansion (Domain Model)

**Status**: DONE  
**Effort**: Medium (~90 min)  
**Depends on**: GS-05 (Error Taxonomy) — for McpError types  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

AppForge currently has a single `src/types/Response.ts` file with minimal types. Large swaths of the codebase use `any` types, which:
- Prevents TypeScript from catching schema mismatches at compile time
- Makes it impossible to validate data at service boundaries
- Creates brittle code that silently passes wrong data to Appium drivers

**Goal**: Expand from one file to a domain model split across 4 focused type definition files. All new services should use these types.

---

## What to Create

### File: `src/types/AppiumTypes.ts` (NEW)

```typescript
/**
 * Appium domain types — sessions, devices, elements, inspection results.
 */

// ─── Device & Session ─────────────────────────────────────────────────────────

export type Platform = 'android' | 'ios';
export type AutomationName = 'UIAutomator2' | 'XCUITest' | 'Espresso';

export interface DeviceCapabilities {
  platformName: Platform;
  automationName: AutomationName;
  deviceName: string;
  app?: string;
  appPackage?: string;         // Android
  appActivity?: string;        // Android
  bundleId?: string;           // iOS
  udid?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  wdaLocalPort?: number;       // iOS only
}

export interface SessionConfig {
  appiumServerUrl: string;
  capabilities: DeviceCapabilities;
  sessionTimeoutMs?: number;
  screenshotOnFailure?: boolean;
}

export interface ActiveSession {
  sessionId: string;
  startedAt: string; // ISO timestamp
  platform: Platform;
  deviceName: string;
  serverUrl: string;
  lastActivityAt: string;
}

// ─── UI Element & Inspection ─────────────────────────────────────────────────

export type LocatorStrategy =
  | 'accessibility id'
  | 'id'
  | 'xpath'
  | 'class name'
  | '-android uiautomator'
  | '-ios predicate string'
  | '-ios class chain';

export interface UiElement {
  index: number;
  text: string;
  resourceId?: string;     // Android: resource-id
  accessibilityId?: string; // contentDesc / accessibilityIdentifier
  className: string;
  bounds: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  clickable: boolean;
  editable: boolean;
  secure: boolean;         // Password fields
  children?: UiElement[];
}

export interface InspectionResult {
  sessionId: string;
  screenName: string;
  platform: Platform;
  timestamp: string;
  elementCount: number;
  xmlHash: string;
  elements: UiElement[];
  rawXml?: string;           // Only included when explicitly requested
}

// ─── Healing ─────────────────────────────────────────────────────────────────

export interface HealCandidate {
  strategy: LocatorStrategy;
  value: string;
  confidence: number;     // 0.0 to 1.0
  reason: string;         // Why this was chosen
}

export interface HealResult {
  success: boolean;
  originalLocator: string;
  healedLocator?: string;
  candidate?: HealCandidate;
  attempts: number;
  reason?: string;  // On failure: MAX_ATTEMPTS_REACHED, ELEMENT_GONE, etc.
}
```

---

### File: `src/types/TestGenerationTypes.ts` (NEW)

```typescript
/**
 * Test generation domain types — feature files, page objects, step definitions.
 */

// ─── Gherkin ─────────────────────────────────────────────────────────────────

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
}

export interface GherkinScenario {
  title: string;
  steps: GherkinStep[];
  tags?: string[];
}

export interface FeatureFile {
  screenName: string;
  feature: string;         // Feature title
  scenarios: GherkinScenario[];
  background?: GherkinStep[];
}

// ─── Page Object Model ────────────────────────────────────────────────────────

export interface SelectorEntry {
  name: string;
  strategy: string;
  value: string;
  comment?: string;
}

export interface PageObject {
  className: string;       // e.g. "LoginPage"
  screenName: string;
  platform: 'android' | 'ios' | 'cross-platform';
  selectors: SelectorEntry[];
  methods: string[];       // Method names generated
  filePath: string;
}

export interface StepDefinition {
  featureName: string;
  stepCount: number;
  filePath: string;
}

// ─── Generation Request/Response ─────────────────────────────────────────────

export interface GenerationRequest {
  screenName: string;
  uiHierarchy: string;     // XML or action map JSON
  testScenario: string;    // Gherkin text
  platform?: 'android' | 'ios';
  outputDir?: string;
}

export interface GenerationResult {
  success: boolean;
  pageObject?: PageObject;
  stepDefinition?: StepDefinition;
  featureFile?: FeatureFile;
  filesCreated: string[];
  warnings: string[];
  error?: string;
}
```

---

### File: `src/types/McpToolResult.ts` (NEW)

```typescript
/**
 * Unified MCP tool result envelope.
 * All tools should return this shape for consistency.
 */

export interface ToolMetadata {
  toolName: string;
  durationMs: number;
  timestamp: string;
  sessionId?: string;
}

export interface McpToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: number;
  metadata: ToolMetadata;
}

/**
 * Factory for standard success result.
 */
export function toolSuccess<T>(
  toolName: string,
  data: T,
  startTime: number,
  sessionId?: string
): McpToolResult<T> {
  return {
    success: true,
    data,
    metadata: {
      toolName,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      sessionId,
    },
  };
}

/**
 * Factory for standard error result.
 */
export function toolError(
  toolName: string,
  message: string,
  startTime: number,
  errorCode?: number,
  sessionId?: string
): McpToolResult<never> {
  return {
    success: false,
    error: message,
    errorCode,
    metadata: {
      toolName,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      sessionId,
    },
  };
}

/**
 * Convert McpToolResult to MCP SDK response format.
 */
export function toMcpResponse(result: McpToolResult): { isError?: boolean; content: Array<{ type: 'text'; text: string }> } {
  if (!result.success && result.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `[${result.errorCode ?? 'ERROR'}] ${result.error}\n(Tool: ${result.metadata.toolName}, Duration: ${result.metadata.durationMs}ms)` }]
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
  };
}
```

---

### File: `src/types/PermissionResult.ts` (NEW)

```typescript
/**
 * Permission and safety check result types.
 * Used by pre-flight checks and security validators.
 */

export type PermissionAction = 'allow' | 'ask' | 'block' | 'passthrough';

export interface PermissionResult {
  action: PermissionAction;
  reason?: string;
  suggestedAlternative?: string;
}

export interface PreFlightCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PreFlightReport {
  allPassed: boolean;
  checks: PreFlightCheck[];
  blockers: PreFlightCheck[]; // severity === 'error'
  warnings: PreFlightCheck[]; // severity === 'warning'
}
```

---

### File: `src/types/index.ts` (UPDATE or CREATE)

Export all types from a central barrel:

```typescript
export * from './AppiumTypes';
export * from './TestGenerationTypes';
export * from './McpToolResult';
export * from './PermissionResult';
export * from './ErrorSystem';
export * from './Response'; // Keep existing exports
```

---

## What to Update

Replace `any` casts across services with proper types. Priority files:
- `src/services/AppiumSessionService.ts` — use `SessionConfig`, `ActiveSession`, `DeviceCapabilities`
- `src/services/SelfHealingService.ts` — use `HealResult`, `HealCandidate`
- `src/services/ExecutionService.ts` — use `InspectionResult`, `UiElement`
- `src/tools/generate_cucumber_pom.ts` — use `GenerationRequest`, `GenerationResult`

---

## Verification

1. Run: `npm run build` — must pass with zero TypeScript errors

2. Check `any` type reduction:
   ```bash
   grep -r ": any" src/ --include="*.ts" | wc -l
   # Should be significantly less than before
   ```

3. Verify barrel exports work:
   ```typescript
   import { DeviceCapabilities, HealResult, McpToolResult } from './types';
   ```

---

## Done Criteria

- [ ] `AppiumTypes.ts` created with session, element, and healing types
- [ ] `TestGenerationTypes.ts` created with Gherkin, POM, and generation types
- [ ] `McpToolResult.ts` created with unified envelope and factory functions
- [ ] `PermissionResult.ts` created with permission action and pre-flight types
- [ ] `src/types/index.ts` barrel file created/updated
- [ ] At least 3 services migrated from `any` to specific types
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **This is enabling infrastructure** — GS-09 (Sparse Action Map) and GS-17 (Pre-Flight Checks) depend on types defined here
- **Do not break existing code** — use `export` so existing imports still work
- **Gradual migration** — don't try to eliminate all `any` types in one pass; focus on service boundaries first
