# All Gold Standard Enhancement Tasks - Summary Outlines

This document provides structured outlines for all 24 tasks. Detailed specifications exist for GS-01, GS-02, and GS-03. Use these outlines to create full specs as needed.

---

## ✅ TIER 0: Foundation (Release Blockers)

### TASK-GS-01: Tool Description Audit ✓ DETAILED SPEC EXISTS
**File**: `TASK-GS-01-tool-description-audit.md`

### TASK-GS-02: File State Tracker ✓ DETAILED SPEC EXISTS
**File**: `TASK-GS-02-file-state-tracker.md`

### TASK-GS-03: Fuzzy String Matcher ✓ DETAILED SPEC EXISTS
**File**: `TASK-GS-03-fuzzy-string-matcher.md`

### TASK-GS-04: Binary File Guard
**Purpose**: Prevent reading binary files (.png, .ipa, .apk) as text  
**Creates**: `src/utils/FileGuard.ts`  
**Updates**: `src/services/ExecutionService.ts`, file reading tools  
**Key Logic**:
- Read first 64KB buffer before full file read
- Check for binary signatures (magic numbers)
- Detect common binary patterns (null bytes, high-bit characters)
- If file fits in 64KB buffer, reuse buffer (optimization)
- Return error for binary files instead of wasting tokens

**Implementation**:
```typescript
class FileGuard {
  static readonly SNIFF_BUFFER_SIZE = 64 * 1024; // 64KB
  
  static isBinary(filePath: string): { binary: boolean; reason?: string }
  static readTextFileSafely(filePath: string): string | Error
}
```

**Verification**: Test with .png, .ipa, .txt files

---

### TASK-GS-05: Error Taxonomy
**Purpose**: Consolidate 3 error files into unified system with semantic codes  
**Deletes**: `ErrorFactory.ts`, `ErrorHandler.ts`, `Errors.ts`  
**Creates**: `src/types/ErrorSystem.ts`  
**Key Features**:
- `McpErrorCode` enum (SESSION_TIMEOUT, FILE_NOT_FOUND, SCHEMA_VALIDATION_FAILED, etc.)
- `McpError extends Error` with code, retryable boolean, toolName, httpStatus
- `isRetryableError()` helper
- `toMcpResponse()` serializer
- JSON-RPC compliant error codes

**Error Codes to Define**:
- SESSION_TIMEOUT (-32001)
- FILE_NOT_FOUND (ENOENT)
- PERMISSION_DENIED (EACCES)
- SCHEMA_VALIDATION_FAILED
- EXTERNAL_SERVICE_ERROR (Appium)
- NETWORK_ERROR

**Updates**: All services throw McpError instead of generic Error

---

### TASK-GS-06: Retry Engine
**Purpose**: Exponential backoff retry for transient failures  
**Creates**: `src/utils/RetryEngine.ts`  
**Key Features**:
```typescript
interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  retryOn: (error: Error) => boolean;
}

function withRetry<T>(
  fn: () => Promise<T>, 
  policy: RetryPolicy
): Promise<T>
```

**Default Policies**:
- Appium session start: 3 attempts, 1s base delay
- File operations: 2 attempts, 500ms base delay
- Network calls: 5 attempts, 2s base delay

**Updates**: Wrap `AppiumSessionService.startSession()`, file writes, network calls

---

### TASK-GS-07: Type System Expansion
**Purpose**: Expand from single Response.ts to full domain model  
**Creates**:
- `src/types/AppiumTypes.ts` - SessionConfig, DeviceCapabilities, InspectionResult, HealCandidate
- `src/types/TestGenerationTypes.ts` - FeatureFile, PageObject, StepDefinition, GenerationRequest
- `src/types/McpToolResult.ts` - Unified `{ success, data, error, metadata }` envelope
- `src/types/PermissionResult.ts` - `allow | ask | block | passthrough`

**Migration**: Replace all `any` types with proper domain types

---

### TASK-GS-08: Minimal Echoes
**Purpose**: Update tool prompts to prevent redundant LLM responses  
**Updates**: `src/index.ts` - all tool descriptions  
**Add to each tool description**:
```
OUTPUT INSTRUCTIONS:
- Do NOT repeat the file path or parameters already shown above
- Do NOT summarize what you just did
- Briefly acknowledge completion, then proceed to next step
- Keep response under 100 words unless explaining an error
```

**Examples**:
- Before: "I have successfully updated the file at /path/to/file.ts. The file now contains..."
- After: "Updated. Ready for next step."

---

## 🟡 TIER 1: Token Optimization

### TASK-GS-09: Sparse Action Map
**Purpose**: Create MobileSmartTreeService for 60% token reduction on XML  
**Creates**: `src/services/MobileSmartTreeService.ts`  
**Updates**: `src/services/ExecutionService.ts`  

**Key Logic**:
```typescript
class MobileSmartTreeService {
  buildSparseMap(xml: string): ActionMap
  // Extracts ONLY clickable elements + their labels
  // Returns: { id, role, label, bestLocator, states }[]
  // 50KB XML → 5KB JSON (40x reduction)
}

interface ActionElement {
  ref: string; // #1, #2, #3
  role: string; // button, input, text
  label: string; // visible text or contentDesc
  locator: string; // best selector (accessibility-id > resource-id > xpath)
  states: string[]; // clickable, editable, secure
  bounds?: { x, y, width, height };
}
```

**Dehydrated Format**:
```
#1   button      "Login"          ~login_btn                    [clickable]
#2   input       "Username"       id=username_field             [editable]
#3   input       "Password"       id=password_field             [editable, secure]
```

**Delta Refresh**: Cache previous scan, only re-process if XML hash changes >10%

---

### TASK-GS-10: JIT OS-Specific Skills
**Purpose**: Load android.md/ios.md only when platform files touched  
**Creates**:
- `src/skills/android.md` - Android-specific selectors (resource-id, UIAutomator)
- `src/skills/ios.md` - iOS-specific selectors (accessibility-id, XCUITest)

**android.md Content**:
```markdown
# Android Mobile Testing Skills

## Selector Priority
1. accessibility-id (~) - Most stable
2. resource-id (id=) - Good if consistent
3. xpath - Last resort

## Android-Specific
- Use UIAutomator2 syntax
- resource-id format: "packageName:id/elementId"
- Avoid text selectors (localization issues)

## Common Mistakes
- ❌ Using XCUIElement* classes (iOS only)
- ❌ Using testID (React Native, not native Android)
```

**Updates**: `src/index.ts` - Conditionally inject skill based on file extension/path

---

### TASK-GS-11: Compact Boundaries
**Purpose**: Auto-collapse previous XML scans into semantic summaries  
**Creates**: `src/services/ContextManager.ts`

**Key Logic**:
```typescript
class ContextManager {
  private scanHistory: Map<number, ScanSummary>;
  
  compactOldScans(currentTurn: number): string
  // Turns 2000-line XML from turn N-2 into:
  // "[Turn 5] LoginScreen: 45 elements, key: #12 username, #13 password, #14 submit"
}
```

**When to Compact**: After 3 turns with UI scans, collapse all but last 2

---

### TASK-GS-12: Max Turns Guard
**Purpose**: Cap self-healing loops at 3 attempts  
**Updates**: `src/services/SelfHealingService.ts`

**Implementation**:
```typescript
class SelfHealingService {
  private attemptCount: Map<string, number>; // testPath -> count
  
  async healTest(testPath: string): Promise<HealResult> {
    const attempts = (this.attemptCount.get(testPath) || 0) + 1;
    
    if (attempts > 3) {
      return {
        success: false,
        reason: 'MAX_ATTEMPTS_REACHED',
        suggestion: 'Request user clarification - automated healing exhausted'
      };
    }
    
    this.attemptCount.set(testPath, attempts);
    // ... healing logic
  }
}
```

---

### TASK-GS-13: Token Budget Tracker
**Purpose**: Track and warn on token consumption per session  
**Creates**: `src/services/TokenBudgetService.ts`

**Key Features**:
```typescript
class TokenBudgetService {
  private sessionTokens: number = 0;
  private readonly WARNING_THRESHOLD = 50000;
  
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough estimate
  }
  
  trackToolCall(toolName: string, input: string, output: string): void {
    const tokens = this.estimateTokens(input) + this.estimateTokens(output);
    this.sessionTokens += tokens;
    
    if (this.sessionTokens > this.WARNING_THRESHOLD) {
      console.warn(`⚠️ Token budget warning: ${this.sessionTokens} tokens used`);
    }
  }
}
```

**Updates**: `src/index.ts` - Wrap tool executions with token tracking

---

## 🟠 TIER 2: Intelligence & Observability

### TASK-GS-14: Observability Service
**Purpose**: Structured JSONL logging with toolStart/toolEnd traces  
**Creates**: `src/services/ObservabilityService.ts`

**Key Features**:
```typescript
class ObservabilityService {
  toolStart(toolName: string, inputSummary: any): string // Returns traceId
  toolEnd(traceId: string, success: boolean, outputSummary: any, durationMs: number): void
  logToolError(traceId: string, error: Error): void
}
```

**Log Format** (JSONL to `/Users/rsakhawalkar/forge/AppForge/mcp-logs/YYYY-MM-DD.jsonl`):
```json
{"type":"tool_start","traceId":"abc123","tool":"generate_cucumber_pom","timestamp":"2026-01-01T10:00:00Z","input":{"screenName":"Login"}}
{"type":"tool_end","traceId":"abc123","success":true,"duration":1234,"output":{"filesCreated":2}}
```

---

### TASK-GS-15: Structural Brain
**Purpose**: Lightweight JSON map of god nodes for pre-flight warnings  
**Creates**: `src/services/StructuralBrainService.ts`

**Key Features**:
```typescript
interface GodNode {
  file: string;
  connections: number;
  cohesion: number;
  warning: string;
}

class StructuralBrainService {
  scanProject(): GodNode[]
  getWarning(filePath: string): string | null
  // Returns: "⚠️ Warning: NavigationGraphService is a god node (48 connections, low cohesion)"
}
```

**Storage**: `.AppForge/structural-brain.json`  
**Updates**: Inject warnings into tool responses when modifying god nodes

---

### TASK-GS-16: Multi-Choice Questions
**Purpose**: Structured clarification with option tables  
**Updates**: `src/tools/request_user_clarification.ts`

**New Format**:
```typescript
{
  question: "Which login button?",
  options: [
    { id: 1, label: "Main form login (recommended)", locator: "~login_btn" },
    { id: 2, label: "Footer login", locator: "~footer_login" },
    { id: 3, label: "Social login", locator: "~social_login" }
  ],
  context: "Found 3 buttons with 'login' text"
}
```

---

### TASK-GS-17: Pre-Flight Checks
**Purpose**: Verify Appium readiness before tool execution  
**Creates**: `src/services/PreFlightService.ts`

**Checks**:
- Appium server running
- Device/emulator connected
- App installed
- Session not stale

**Integration**: Run before `inspect_ui_hierarchy`, `verify_selector`, etc.

---

### TASK-GS-18: Similar File Suggestions
**Purpose**: "Did you mean?" for ENOENT errors  
**Creates**: `src/utils/FileSuggester.ts`

**Logic**:
```typescript
class FileSuggester {
  suggest(requestedPath: string): string[] {
    // Find files with same name but different extension
    // LoginPage.js → suggest LoginPage.ts if exists
  }
}
```

**Integration**: Enhance error messages with suggestions

---

## 🟢 TIER 3: Conditional Enhancements

### TASK-GS-19: Local Healer Cache
**Purpose**: SQLite cache for repeated locator fixes  
**Creates**: `src/services/HealerCacheService.ts`  
**Database**: `.AppForge/heal-cache.db`

**Schema**:
```sql
CREATE TABLE heals (
  original_locator TEXT,
  fixed_locator TEXT,
  confidence REAL,
  last_verified TIMESTAMP
);
```

---

### TASK-GS-20: Neighbor Context
**Purpose**: Store neighbor elements for healing  
**Creates**: `src/services/NeighborContextService.ts`

**Storage**: Element + siblings/parent for fingerprinting

---

### TASK-GS-21: Observer Fork
**Purpose**: Background status updates  
**Creates**: `src/services/ObserverService.ts`

**Feature**: "Currently analyzing LoginScreen XML..." updates

---

## 🔵 TIER 4: Advanced Optimization

### TASK-GS-22: Shell Security Core
**Purpose**: Port core bash security validators  
**Creates**: `src/utils/ShellSecurityEngine.ts`

**Validators**:
- Command substitution detection
- Quote desync detection
- Basic injection patterns

---

### TASK-GS-23: Agent Routing
**Purpose**: Multi-model routing by task complexity  
**Creates**: `src/services/AgentRoutingService.ts`

**Config**: Route simple tasks to Haiku, complex to Opus

---

### TASK-GS-24: Scratchpad Memory
**Purpose**: Shared `.agent_scratchpad` directory  
**Creates**: `.agent_scratchpad/` directory structure

**Usage**: Cross-worker knowledge sharing

---

## 📋 Implementation Guidelines

For each task:
1. Copy structure from GS-01/02/03 detailed specs
2. Include: Context, What to Create, What to Update, Verification, Done Criteria
3. Provide code examples
4. List specific files/line numbers when possible
5. Include test procedures

**Estimated Total Effort**:
- TIER 0: 8 tasks × 60 min avg = 8 hours
- TIER 1: 5 tasks × 90 min avg = 7.5 hours
- TIER 2: 5 tasks × 75 min avg = 6.25 hours
- TIER 3: 3 tasks × 90 min avg = 4.5 hours
- TIER 4: 3 tasks × 60 min avg = 3 hours
**Total**: ~29 hours of implementation time

---

*For detailed specs, see individual TASK-GS-*.md files. This summary provides enough detail to create full specifications when needed.*