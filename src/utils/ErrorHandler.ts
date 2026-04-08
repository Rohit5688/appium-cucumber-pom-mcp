/**
 * ErrorHandler — safeExecute wrapper for tool handlers.
 *
 * NOTE: ErrorFactory (AppForgeError) is kept for backward compatibility with
 * existing tool-level catch blocks.  New code should import McpErrors from
 * '../types/ErrorSystem.js' directly.
 *
 * safeExecute wraps any async tool fn with a global timeout and normalises
 * caught errors.  It now surfaces McpError (from ErrorSystem) for timeout
 * events so GS-06 RetryEngine can use isRetryableError() on them.
 */

import { McpError, McpErrorCode } from '../types/ErrorSystem.js';

const GLOBAL_DEFAULT_TIMEOUT_MS = 60000;

export async function safeExecute<T>(
  executionFn: () => Promise<T>,
  timeoutMs: number = GLOBAL_DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new McpError(
        `Execution timed out after ${timeoutMs}ms`,
        McpErrorCode.NETWORK_TIMEOUT,
        { retryable: true }
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      executionFn(),
      timeoutPromise
    ]);
    return result;
  } catch (err: unknown) {
    // Log exception via stderr preserving stack-trace
    const stackSnippet = err instanceof Error && err.stack ? `\nStack: ${err.stack}` : '';
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[AppForge] Uncaught Exception intercepted by safeExecute: ${msg}${stackSnippet}`);
    throw err;
  } finally {
    clearTimeout(timeoutId!);
  }
}
