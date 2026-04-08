# TASK-44 — Structured Logging + Request Tracing + Performance Metrics

**Status**: DONE
**Effort**: Medium (~2 hours)
**Depends on**: TASK-40 must be DONE (error contracts needed for logger integration)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

AppForge currently uses raw `console.log` and `console.error` throughout all services.
This makes debugging Appium session issues in enterprise environments nearly impossible —
logs have no timestamps, no severity, no request correlation, and no secret redaction.
This task adds three utility classes without changing any service logic.

---

## Step 1 — Create `src/utils/Logger.ts`

```typescript
/**
 * AppForge Structured Logger
 * Outputs JSON-formatted log lines to stderr (MCP protocol uses stdout).
 * Automatically redacts secrets from log output.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const SECRET_PATTERNS = [
  /password['":\s]+['"]?([^'"\s,}]+)/gi,
  /token['":\s]+['"]?([^'"\s,}]+)/gi,
  /apiKey['":\s]+['"]?([^'"\s,}]+)/gi,
  /secret['":\s]+['"]?([^'"\s,}]+)/gi,
  /BROWSERSTACK_KEY[=:]\s*(\S+)/gi,
];

function redact(message: string): string {
  let result = message;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, secret) =>
      match.replace(secret, '[REDACTED]')
    );
  }
  return result;
}

export class Logger {
  private static minLevel: LogLevel = 'INFO';

  static setLevel(level: LogLevel) {
    Logger.minLevel = level;
  }

  private static shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    return order.indexOf(level) >= order.indexOf(Logger.minLevel);
  }

  private static write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!Logger.shouldLog(level)) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: redact(message),
      ...(context ? { context } : {})
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  static debug(message: string, context?: Record<string, unknown>): void {
    Logger.write('DEBUG', message, context);
  }

  static info(message: string, context?: Record<string, unknown>): void {
    Logger.write('INFO', message, context);
  }

  static warn(message: string, context?: Record<string, unknown>): void {
    Logger.write('WARN', message, context);
  }

  static error(message: string, context?: Record<string, unknown>): void {
    Logger.write('ERROR', message, context);
  }
}
```

---

## Step 2 — Create `src/utils/RequestTracer.ts`

```typescript
/**
 * AppForge Request Tracer
 * Assigns a unique ID to each incoming MCP tool call.
 * Used to correlate tool calls with Appium session events.
 */
import { randomUUID } from 'crypto';

export class RequestTracer {
  private static currentRequestId: string = '';

  static startRequest(): string {
    RequestTracer.currentRequestId = randomUUID().slice(0, 8);
    return RequestTracer.currentRequestId;
  }

  static getCurrentId(): string {
    return RequestTracer.currentRequestId || 'no-request';
  }

  static tag(message: string): string {
    return `[${RequestTracer.getCurrentId()}] ${message}`;
  }
}
```

---

## Step 3 — Create `src/utils/Metrics.ts`

```typescript
/**
 * AppForge Performance Metrics
 * Tracks tool invocation counts, success/failure rates, and timing.
 * Dumps summary on process exit.
 */

interface ToolMetric {
  invocations: number;
  failures: number;
  totalDurationMs: number;
  lastInvokedAt: string;
}

export class Metrics {
  private static tools: Record<string, ToolMetric> = {};

  static recordStart(toolName: string): () => void {
    const start = Date.now();
    if (!Metrics.tools[toolName]) {
      Metrics.tools[toolName] = { invocations: 0, failures: 0, totalDurationMs: 0, lastInvokedAt: '' };
    }
    Metrics.tools[toolName].invocations++;
    Metrics.tools[toolName].lastInvokedAt = new Date().toISOString();

    return () => {
      const duration = Date.now() - start;
      Metrics.tools[toolName].totalDurationMs += duration;
    };
  }

  static recordFailure(toolName: string): void {
    if (Metrics.tools[toolName]) {
      Metrics.tools[toolName].failures++;
    }
  }

  static getSummary(): Record<string, ToolMetric & { avgDurationMs: number; successRate: string }> {
    const summary: any = {};
    for (const [tool, m] of Object.entries(Metrics.tools)) {
      summary[tool] = {
        ...m,
        avgDurationMs: m.invocations > 0 ? Math.round(m.totalDurationMs / m.invocations) : 0,
        successRate: m.invocations > 0
          ? `${(((m.invocations - m.failures) / m.invocations) * 100).toFixed(1)}%`
          : 'N/A'
      };
    }
    return summary;
  }

  static registerShutdownHook(): void {
    const dump = () => {
      const summary = Metrics.getSummary();
      if (Object.keys(summary).length > 0) {
        process.stderr.write('\n[AppForge Metrics]\n' + JSON.stringify(summary, null, 2) + '\n');
      }
    };
    process.on('exit', dump);
    process.on('SIGINT', () => { dump(); process.exit(0); });
    process.on('SIGTERM', () => { dump(); process.exit(0); });
  }
}
```

---

## Step 4 — Wire into `index.ts`

In the `AppForgeServer` constructor, add:
```typescript
import { Logger } from "./utils/Logger.js";
import { Metrics } from "./utils/Metrics.js";

// In constructor:
Metrics.registerShutdownHook();

// Replace existing console.error in onerror:
this.server.onerror = (error) => Logger.error("[MCP Error]", { error: String(error) });
```

In the `run()` method, replace the startup `console.error`:
```typescript
// BEFORE:
console.error("Appium MCP Server running on stdio");

// AFTER:
Logger.info("AppForge MCP Server started", { transport: "stdio", version: "1.0.0" });
```

---

## Step 5 — Replace key `console.warn` calls in services

In `AppiumSessionService.ts`, find:
```typescript
console.error(`[AppForge] ⚠️ Initial page fetch slow...`);
```
Replace with:
```typescript
import { Logger } from "../utils/Logger.js";
Logger.warn("Initial page fetch slow — session still valid", { error: String(fetchError) });
```

Do the same for any `console.error('[AppForge]` patterns in `ExecutionService.ts`
and `McpConfigService.ts`. Do NOT replace all console calls everywhere —
just the `[AppForge]` prefixed ones in services.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. `src/utils/Logger.ts`, `RequestTracer.ts`, `Metrics.ts` all exist.
3. Server startup emits a JSON log line to stderr (not a plain string).
4. Search for `console.error('[AppForge]` in services — should be reduced.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `Logger.ts` created with `debug`, `info`, `warn`, `error` methods + secret redaction
- [x] `RequestTracer.ts` created with `startRequest()`, `getCurrentId()`, `tag()`
- [x] `Metrics.ts` created with `recordStart()`, `recordFailure()`, `getSummary()`, `registerShutdownHook()`
- [x] `Metrics.registerShutdownHook()` called in `AppForgeServer` constructor
- [x] Server startup log uses `Logger.info()` not `console.error`
- [x] Change `Status` above to `DONE`
