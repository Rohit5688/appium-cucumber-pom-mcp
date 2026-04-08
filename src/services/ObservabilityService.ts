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
