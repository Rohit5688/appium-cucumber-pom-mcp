# TASK-GS-06 — Retry Engine (Exponential Backoff)

**Status**: DONE  
**Effort**: Medium (~75 min)  
**Depends on**: GS-05 (Error Taxonomy) — needs `isRetryableError()` from ErrorSystem  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Appium operations fail transiently due to:
- Server warm-up delays
- Device USB reconnects
- Network hiccups in CI environments
- Race conditions on session start

Currently, any transient failure causes an immediate hard error. This means the LLM must manually diagnose and retry, wasting tokens.

**Solution**: A composable `withRetry()` function that wraps any async operation with exponential backoff + jitter, automatically retrying on transient failures.

---

## What to Create

### File: `src/utils/RetryEngine.ts` (NEW)

```typescript
import { isRetryableError } from '../types/ErrorSystem';

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts: number;
  /** Base delay in milliseconds for the first retry. Default: 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. Default: 10000 */
  maxDelayMs: number;
  /** Add random jitter to prevent thundering herd. Default: true */
  jitter: boolean;
  /** Custom function to decide if an error should trigger a retry */
  retryOn?: (error: Error, attempt: number) => boolean;
  /** Optional callback invoked on each failed attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/**
 * Preset retry policies for common AppForge operations.
 */
export const RetryPolicies = {
  /** For Appium session start — tolerant of slow device boot */
  appiumSession: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 8000,
    jitter: true,
  } satisfies RetryPolicy,

  /** For transient Appium driver commands */
  appiumCommand: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    jitter: true,
  } satisfies RetryPolicy,

  /** For local file operations (EBUSY, EMFILE) */
  fileOperation: {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 2000,
    jitter: false,
  } satisfies RetryPolicy,

  /** For external network calls */
  networkCall: {
    maxAttempts: 5,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    jitter: true,
  } satisfies RetryPolicy,
} as const;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface RetryResult<T> {
  value: T;
  attempts: number;
  totalDurationMs: number;
}

// ─── Core retry function ──────────────────────────────────────────────────────

/**
 * Executes an async function with retry logic.
 *
 * @example
 * const result = await withRetry(
 *   () => appiumDriver.startSession(caps),
 *   RetryPolicies.appiumSession
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      const value = await fn();
      return {
        value,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));

      const isLastAttempt = attempt === policy.maxAttempts;
      if (isLastAttempt) break;

      // Check if this error type should be retried
      const shouldRetry = policy.retryOn
        ? policy.retryOn(lastError, attempt)
        : isRetryableError(lastError);

      if (!shouldRetry) {
        throw lastError; // Non-retryable — fail immediately
      }

      // Calculate exponential backoff delay
      const exponentialDelay = policy.baseDelayMs * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs);
      const jitterAmount = policy.jitter ? Math.random() * cappedDelay * 0.3 : 0;
      const delayMs = Math.floor(cappedDelay + jitterAmount);

      // Notify caller of retry
      policy.onRetry?.(lastError, attempt, delayMs);

      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Sync-safe sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async function to always retry using a given policy.
 * Useful for creating retry-wrapped versions of service methods.
 *
 * @example
 * const resilientStart = withRetryWrapper(startSession, RetryPolicies.appiumSession);
 * await resilientStart(caps);
 */
export function withRetryWrapper<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  policy: RetryPolicy
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    const result = await withRetry(() => fn(...args), policy);
    return result.value;
  };
}
```

---

## What to Update

### File: `src/services/AppiumSessionService.ts` (or equivalent session service)

Find `startSession()` and wrap with retry:

```typescript
import { withRetry, RetryPolicies } from '../utils/RetryEngine';

// Before:
async startSession(capabilities: any): Promise<string> {
  const driver = await wdio.remote(capabilities);
  // ...
}

// After:
async startSession(capabilities: any): Promise<string> {
  const result = await withRetry(
    async () => {
      const driver = await wdio.remote(capabilities);
      return driver;
    },
    {
      ...RetryPolicies.appiumSession,
      onRetry: (err, attempt, delayMs) => {
        console.warn(`[AppForge] Appium session start failed (attempt ${attempt}): ${err.message}. Retrying in ${delayMs}ms...`);
      }
    }
  );
  // ... use result.value
}
```

### File: `src/services/SelfHealingService.ts`

Wrap Appium command calls with retry:

```typescript
import { withRetry, RetryPolicies } from '../utils/RetryEngine';

// Wrap driver commands that may fail transiently:
const element = await withRetry(
  () => driver.findElement('accessibility id', locator),
  RetryPolicies.appiumCommand
);
```

---

## Verification

1. Create test script at `/tmp/test-retry-engine.ts`:
   ```typescript
   import { withRetry } from './src/utils/RetryEngine';

   let callCount = 0;

   // Test 1: Succeeds on 3rd attempt
   callCount = 0;
   const fakeNetworkCall = async () => {
     callCount++;
     if (callCount < 3) throw Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
     return 'success';
   };

   const result = await withRetry(fakeNetworkCall, {
     maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500, jitter: false
   });
   console.assert(result.value === 'success', 'Test 1 failed');
   console.assert(result.attempts === 3, 'Test 1 failed: wrong attempt count');
   console.log('Test 1 passed: Retried and succeeded on attempt 3');

   // Test 2: Non-retryable error fails immediately
   callCount = 0;
   try {
     await withRetry(async () => { throw new Error('INVALID_PARAMETER'); }, {
       maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500, jitter: false,
       retryOn: () => false
     });
     console.assert(false, 'Test 2 should have thrown');
   } catch (err) {
     console.log('Test 2 passed: Non-retryable error not retried');
   }
   ```

2. Run: `npm run build` — must pass

3. Run test: `npx ts-node /tmp/test-retry-engine.ts`

---

## Done Criteria

- [x] `RetryEngine.ts` created with `withRetry()`, `withRetryWrapper()`, `RetryPolicies`
- [x] Exponential backoff + jitter formula correct
- [x] Non-retryable errors fail immediately (no wasted delay)
- [x] `AppiumSessionService.startSession()` wrapped with retry
- [x] `npm run build` passes with zero errors
- [x] Test confirms retry on transient, immediate fail on permanent
- [x] Change `Status` above to `DONE`

---

## Notes

- **Depends on GS-05** for `isRetryableError()` — if GS-05 not done, inline the check:
  ```typescript
  const retryableCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']);
  const isRetryable = (err: Error) => retryableCodes.has((err as any).code ?? '');
  ```
- **Max delay is critical** — without it, exponential backoff can wait minutes in high-attempt scenarios
- **Jitter prevents thundering herd** — especially important in CI environments running parallel test suites
