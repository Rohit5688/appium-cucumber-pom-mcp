# TASK-GS-12 — Max Turns Guard (Self-Healing Loop Cap)

**Status**: DONE  
**Effort**: Small (~45 min)  
**Depends on**: GS-05 (Error Taxonomy) — uses `McpErrors.maxHealingAttempts()`  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Without a loop cap, self-healing can enter infinite retry cycles:

```
Turn 1: Agent tries locator ~login_btn → FAIL
Turn 2: Agent heals to id=login_btn → FAIL  
Turn 3: Agent heals to //XCUIElement[@label="Login"] → FAIL
Turn 4: Agent heals to ~login_btn → FAIL (same as Turn 1!)
... infinite loop
```

Each failed attempt costs 500-2000 tokens. An unguarded loop on a broken test can burn 20,000+ tokens before the user notices.

**Solution**: Cap self-healing attempts at 3 per test file per session. After 3 failures, stop and request human intervention.

---

## What to Update

### File: `src/services/SelfHealingService.ts`

Find the main healing method and add attempt tracking.

#### Step 1 — Add attempt counter

At the top of the class, add a private map:

```typescript
export class SelfHealingService {
  // ... existing code ...

  /**
   * Tracks healing attempt counts per test file path.
   * Key: absolute test file path, Value: attempt count (1-based)
   */
  private attemptCount: Map<string, number> = new Map();

  /** Maximum healing attempts per test file per session */
  private readonly MAX_HEALING_ATTEMPTS = 3;
```

#### Step 2 — Guard the main heal method

Find the `healTest` method (or whatever the primary healing entry point is). Add guard at the start:

```typescript
public async healTest(testPath: string, ...otherArgs: any[]): Promise<HealResult> {
  const absolutePath = path.resolve(testPath);
  const attempts = (this.attemptCount.get(absolutePath) ?? 0) + 1;

  if (attempts > this.MAX_HEALING_ATTEMPTS) {
    return {
      success: false,
      originalLocator: '',
      attempts,
      reason: 'MAX_ATTEMPTS_REACHED',
      message: [
        `⛔ Max healing attempts (${this.MAX_HEALING_ATTEMPTS}) reached for: ${path.basename(testPath)}`,
        ``,
        `Automated healing has been exhausted. Manual review required.`,
        ``,
        `Suggested next steps:`,
        `1. Run the test manually to observe the failure`,
        `2. Inspect the current UI with inspect_ui_hierarchy`,
        `3. Check if the screen structure changed fundamentally`,
        `4. Update the test's Page Object selectors manually`,
        `5. Call request_user_clarification if you need more information`,
      ].join('\n'),
    };
  }

  // Track this attempt
  this.attemptCount.set(absolutePath, attempts);

  // ... existing healing logic ...
}
```

#### Step 3 — Add reset method

Add a method to reset counts (called on new session start):

```typescript
/**
 * Resets healing attempt counters.
 * Call this when a new Appium session is started.
 */
public resetAttemptCounts(): void {
  this.attemptCount.clear();
}

/**
 * Returns current attempt count for a test file.
 * Useful for informational messages.
 */
public getAttemptCount(testPath: string): number {
  return this.attemptCount.get(path.resolve(testPath)) ?? 0;
}

/**
 * Returns remaining healing attempts for a test file.
 */
public getRemainingAttempts(testPath: string): number {
  return Math.max(0, this.MAX_HEALING_ATTEMPTS - this.getAttemptCount(testPath));
}
```

#### Step 4 — Include attempt info in successful heal results

When healing succeeds, include attempt context in the result:

```typescript
// At the end of successful healing:
return {
  success: true,
  originalLocator: failedLocator,
  healedLocator: newLocator,
  candidate: bestCandidate,
  attempts,
  remainingAttempts: this.getRemainingAttempts(testPath),
  message: attempts > 1
    ? `Healed on attempt ${attempts}/${this.MAX_HEALING_ATTEMPTS}. ${this.getRemainingAttempts(testPath)} attempts remaining.`
    : `Healed successfully.`,
};
```

---

## What to Update in `src/index.ts`

### Reset on new session:

Find the `start_appium_session` tool handler. After session starts successfully:

```typescript
import { SelfHealingService } from './services/SelfHealingService';

// After successful session start:
SelfHealingService.getInstance().resetAttemptCounts();
```

---

## Verification

1. Run: `npm run build` — must pass

2. Test attempt counting:

```typescript
import { SelfHealingService } from './src/services/SelfHealingService';

const service = SelfHealingService.getInstance();
service.resetAttemptCounts();

const testPath = '/tests/LoginTest.feature';

// Simulate 3 failures
for (let i = 1; i <= 3; i++) {
  const result = await service.healTest(testPath, 'failingLocator');
  console.log(`Attempt ${i}: success=${result.success}, remaining=${service.getRemainingAttempts(testPath)}`);
}

// 4th attempt should be blocked
const blocked = await service.healTest(testPath, 'failingLocator');
console.assert(blocked.success === false, 'Should be blocked');
console.assert(blocked.reason === 'MAX_ATTEMPTS_REACHED', 'Should have correct reason');
console.log('Max turns guard test passed!');
console.log('Blocked message:', blocked.message);
```

3. Confirm the error message includes actionable next steps

---

## Done Criteria

- [x] `SelfHealingService.ts` has `attemptCount` map initialized
- [x] `healTest()` method checks count before attempting
- [x] After `MAX_HEALING_ATTEMPTS` (3), returns structured refusal with next steps
- [x] `resetAttemptCounts()` called on `start_appium_session`
- [x] Successful heals include remaining attempt count in result
- [x] `npm run build` passes with zero errors
- [x] Test confirms 4th attempt is blocked
- [x] Change `Status` above to `DONE`

---

## Notes

- **3 attempts is the right threshold** — based on typical healing scenarios: first try, fallback try, last-resort try
- **Per-file tracking** — each test file has its own counter; a session with 10 tests gets 30 total attempts
- **Reset on new session** is critical — stale counts from previous sessions shouldn't penalize new ones
- **McpErrors can be used here** if GS-05 is done:
  ```typescript
  throw McpErrors.maxHealingAttempts(testPath, attempts, 'self_heal_test');
  ```
- **The blocked message must be actionable** — don't just say "failed"; give the user a path forward
