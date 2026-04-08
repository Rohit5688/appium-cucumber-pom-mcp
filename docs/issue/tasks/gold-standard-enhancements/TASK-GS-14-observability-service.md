# TASK-GS-14 — Observability Service (Structured JSONL Logging)

**Status**: DONE  
**Effort**: Medium (~75 min)  
**Depends on**: Nothing — standalone service; do this early in Tier 2 to aid debugging  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

AppForge currently logs to console with `console.log/warn/error`. This provides:
- No structured data for log analysis
- No correlation between related tool calls
- No trace IDs to follow a single operation across multiple services
- No persistent log file for post-session analysis

**Solution**: Create `ObservabilityService` with structured JSONL logging via trace IDs. Every tool call produces `tool_start` + `tool_end` events correlated by `traceId`.

---

## What to Create

### File: `src/services/ObservabilityService.ts` (NEW)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

// ─── Log Event Types ──────────────────────────────────────────────────────────

export type LogEventType =
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'session_start'
  | 'session_end'
  | 'healing_attempt'
  | 'healing_result'
  | 'warning';

export interface BaseLogEvent {
  type: LogEventType;
  traceId: string;
  timestamp: string;   // ISO 8601
  sessionId?: string;
}

export interface ToolStartEvent extends BaseLogEvent {
  type: 'tool_start';
  tool: string;
  inputSummary: Record<string, any>;
}

export interface ToolEndEvent extends BaseLogEvent {
  type: 'tool_end';
  tool: string;
  success: boolean;
  durationMs: number;
  outputSummary: Record<string, any>;
}

export interface ToolErrorEvent extends BaseLogEvent {
  type: 'tool_error';
  tool: string;
  errorCode?: number;
  errorMessage: string;
  stack?: string;
  durationMs: number;
}

export interface WarningEvent extends BaseLogEvent {
  type: 'warning';
  message: string;
  context?: Record<string, any>;
}

export type LogEvent = ToolStartEvent | ToolEndEvent | ToolErrorEvent | WarningEvent;

// ─── ObservabilityService ─────────────────────────────────────────────────────

/**
 * Structured JSONL observability logging for AppForge tool calls.
 *
 * Log files are written to: <cwd>/mcp-logs/YYYY-MM-DD.jsonl
 * Each line is a complete, parseable JSON object.
 *
 * USAGE:
 *   const obs = ObservabilityService.getInstance();
 *   const traceId = obs.toolStart('generate_cucumber_pom', { screenName: 'Login' });
 *   try {
 *     // ... tool work
 *     obs.toolEnd(traceId, true, { filesCreated: 2 }, startTime);
 *   } catch (err) {
 *     obs.toolError(traceId, 'generate_cucumber_pom', err, startTime);
 *   }
 */
export class ObservabilityService {
  private static instance: ObservabilityService;

  private logDir: string;
  private logFilePath: string;
  private stream: fs.WriteStream | null = null;
  private activeSession: string | null = null;
  private isEnabled: boolean = true;

  private constructor() {
    this.logDir = path.join(process.cwd(), 'mcp-logs');
    this.logFilePath = this.buildLogFilePath();
    this.ensureLogDirectory();
    this.openStream();
  }

  public static getInstance(): ObservabilityService {
    if (!ObservabilityService.instance) {
      ObservabilityService.instance = new ObservabilityService();
    }
    return ObservabilityService.instance;
  }

  /**
   * Records the start of a tool call.
   * @returns traceId — pass to toolEnd() to correlate events
   */
  public toolStart(toolName: string, inputSummary: Record<string, any>, sessionId?: string): string {
    const traceId = this.generateTraceId();

    this.emit({
      type: 'tool_start',
      traceId,
      timestamp: new Date().toISOString(),
      sessionId: sessionId ?? this.activeSession ?? undefined,
      tool: toolName,
      inputSummary: this.sanitize(inputSummary),
    });

    return traceId;
  }

  /**
   * Records successful completion of a tool call.
   */
  public toolEnd(
    traceId: string,
    toolName: string,
    success: boolean,
    outputSummary: Record<string, any>,
    startTimeMs: number
  ): void {
    this.emit({
      type: 'tool_end',
      traceId,
      timestamp: new Date().toISOString(),
      sessionId: this.activeSession ?? undefined,
      tool: toolName,
      success,
      durationMs: Date.now() - startTimeMs,
      outputSummary: this.sanitize(outputSummary),
    });
  }

  /**
   * Records a tool error.
   */
  public toolError(
    traceId: string,
    toolName: string,
    error: Error | unknown,
    startTimeMs: number
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));

    this.emit({
      type: 'tool_error',
      traceId,
      timestamp: new Date().toISOString(),
      sessionId: this.activeSession ?? undefined,
      tool: toolName,
      errorCode: (err as any).code,
      errorMessage: err.message,
      stack: err.stack?.split('\n').slice(0, 5).join('\n'), // First 5 lines only
      durationMs: Date.now() - startTimeMs,
    });
  }

  /**
   * Records a warning event (no trace ID required).
   */
  public warn(message: string, context?: Record<string, any>): void {
    this.emit({
      type: 'warning',
      traceId: this.generateTraceId(),
      timestamp: new Date().toISOString(),
      sessionId: this.activeSession ?? undefined,
      message,
      context: context ? this.sanitize(context) : undefined,
    });
  }

  /**
   * Sets the active session ID for correlation.
   */
  public setActiveSession(sessionId: string | null): void {
    this.activeSession = sessionId;
  }

  /**
   * Disables logging (e.g., in tests).
   */
  public disable(): void {
    this.isEnabled = false;
  }

  /** Rotate the log file (e.g., on new day) */
  public rotateIfNeeded(): void {
    const newPath = this.buildLogFilePath();
    if (newPath !== this.logFilePath) {
      this.stream?.end();
      this.logFilePath = newPath;
      this.openStream();
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private emit(event: LogEvent): void {
    if (!this.isEnabled || !this.stream) return;

    try {
      const line = JSON.stringify(event) + '\n';
      this.stream.write(line);
    } catch {
      // Never throw from observability code
    }
  }

  private sanitize(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 500) {
        sanitized[key] = value.substring(0, 500) + `...[truncated, ${value.length} total]`;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private generateTraceId(): string {
    return crypto.randomBytes(6).toString('hex');
  }

  private buildLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `${date}.jsonl`);
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {
      // Non-fatal — disable logging if directory can't be created
      this.isEnabled = false;
    }
  }

  private openStream(): void {
    try {
      this.stream = fs.createWriteStream(this.logFilePath, { flags: 'a', encoding: 'utf-8' });
      this.stream.on('error', () => {
        this.isEnabled = false; // Disable silently on I/O error
      });
    } catch {
      this.isEnabled = false;
    }
  }
}
```

---

## What to Update

### File: `src/index.ts`

Wrap the main tool dispatch logic:

```typescript
import { ObservabilityService } from './services/ObservabilityService';

const obs = ObservabilityService.getInstance();

// Inside the tool dispatch handler:
const startTime = Date.now();
const traceId = obs.toolStart(toolName, args ?? {}, currentSessionId);

try {
  const result = await dispatchTool(toolName, args);
  obs.toolEnd(traceId, toolName, true, summarize(result), startTime);
  return result;
} catch (err) {
  obs.toolError(traceId, toolName, err, startTime);
  throw err; // Re-throw — observability never swallows errors
}

/** Extract a safe summary (non-PII, size-limited) for logging */
function summarize(result: any): Record<string, any> {
  if (!result) return {};
  return {
    isError: result.isError ?? false,
    contentLength: JSON.stringify(result).length,
    hasContent: Array.isArray(result.content) && result.content.length > 0,
  };
}
```

### File: `.gitignore`

Add log directory:
```
mcp-logs/
```

---

## Verification

1. Run `npm run build` — must pass

2. Run a tool call and check log output:
   ```bash
   cat mcp-logs/$(date +%Y-%m-%d).jsonl | head -4
   ```
   Expected:
   ```json
   {"type":"tool_start","traceId":"abc123","timestamp":"2026-01-01T10:00:00Z","tool":"inspect_ui_hierarchy","inputSummary":{"screenName":"LoginScreen"}}
   {"type":"tool_end","traceId":"abc123","timestamp":"2026-01-01T10:00:01Z","tool":"inspect_ui_hierarchy","success":true,"durationMs":1234,"outputSummary":{"isError":false,"contentLength":2048}}
   ```

3. Verify passwords/secrets are redacted:
   - Call a tool with `password` in args
   - Check log: `password` field should show `[REDACTED]`

---

## Done Criteria

- [x] `ObservabilityService.ts` created with `toolStart()`, `toolEnd()`, `toolError()`, `warn()`
- [x] JSONL output format with ISO timestamps and traceId correlation
- [x] Logs written to `mcp-logs/YYYY-MM-DD.jsonl`
- [x] Sensitive fields (password, secret) redacted automatically
- [x] Long strings truncated to 500 chars in logs
- [x] `src/index.ts` wraps tool dispatch with observability
- [x] `mcp-logs/` added to `.gitignore`
- [x] `npm run build` passes with zero errors
- [x] Change `Status` above to `DONE`

---

## Notes

- **Never throws** — all observability code is wrapped in try/catch; a logging failure must never break tool execution
- **File rotation** — `rotateIfNeeded()` handles the midnight rollover automatically
- **JSONL format** — one JSON object per line, making it easy to stream-parse with `jq`
- **`mcp-logs/` should be gitignored** — logs contain operational data, not source code; don't commit them

