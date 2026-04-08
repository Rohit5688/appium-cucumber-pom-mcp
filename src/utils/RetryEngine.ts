import { isRetryableError } from '../types/ErrorSystem.js';

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
