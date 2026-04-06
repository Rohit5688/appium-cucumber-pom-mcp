import { ErrorFactory, AppForgeError } from "./ErrorFactory.js";

const GLOBAL_DEFAULT_TIMEOUT_MS = 60000;

export async function safeExecute<T>(
  executionFn: () => Promise<T>,
  timeoutMs: number = GLOBAL_DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(ErrorFactory.timeout(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      executionFn(),
      timeoutPromise
    ]);
    return result;
  } catch (err: unknown) {
    let appError: AppForgeError;
    
    if (err instanceof AppForgeError) {
      appError = err;
    } else {
      appError = ErrorFactory.internal(
        err instanceof Error ? err.message : String(err),
        err instanceof Error && err.stack ? { stack: err.stack } : undefined
      );
    }
    
    // Log exception via stderr preserving stack-trace
    const stackSnippet = err instanceof Error && err.stack ? `\nStack: ${err.stack}` : '';
    console.error(`[AppForge] Uncaught Exception intercepted by safeExecute: ${appError.message}${stackSnippet}`);

    throw appError;
  } finally {
    clearTimeout(timeoutId!);
  }
}
