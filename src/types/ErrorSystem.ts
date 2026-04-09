/**
 * Unified error taxonomy for AppForge MCP server.
 * Replaces ErrorFactory.ts, ErrorHandler.ts, and Errors.ts.
 *
 * JSON-RPC 2.0 error code ranges:
 *  -32700 to -32600: Parse/invalid request errors (reserved)
 *  -32099 to -32000: Server-defined errors (our range)
 */

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const McpErrorCode = {
  // Session errors (-32001 to -32010)
  SESSION_NOT_FOUND:      -32001,
  SESSION_TIMEOUT:        -32002,
  SESSION_START_FAILED:   -32003,

  // File system errors (-32011 to -32020)
  FILE_NOT_FOUND:         -32011,
  PERMISSION_DENIED:      -32012,
  FILE_TOO_LARGE:         -32013,
  BINARY_FILE_REJECTED:   -32014,
  FILE_MODIFIED_EXTERNAL: -32015,

  // Validation errors (-32021 to -32030)
  SCHEMA_VALIDATION_FAILED: -32021,
  INVALID_PARAMETER:        -32022,
  MISSING_CONFIG:           -32023,

  // External service errors (-32031 to -32040)
  APPIUM_NOT_REACHABLE:   -32031,
  APPIUM_COMMAND_FAILED:  -32032,
  DEVICE_NOT_CONNECTED:   -32033,

  // Network errors (-32041 to -32050)
  NETWORK_TIMEOUT:        -32041,
  NETWORK_ERROR:          -32042,

  // Build/execution errors (-32051 to -32060)
  BUILD_FAILED:           -32051,
  TEST_EXECUTION_FAILED:  -32052,
  SHELL_INJECTION_DETECTED: -32053,

  // Agent limits (-32061 to -32070)
  MAX_HEALING_ATTEMPTS:   -32061,
  TOKEN_BUDGET_EXCEEDED:  -32062,

  // Additional application-specific errors (-32071 to -32080)
  CONFIG_VALIDATION_FAILED: -32071,
  INVALID_TIMEOUT:          -32072,
  INVALID_EXECUTABLE:       -32073,
  INVALID_CREDENTIAL:       -32074,
  SANDBOX_API_FAILED:       -32075,
  PROJECT_VALIDATION_FAILED:-32076,
  STRING_NOT_FOUND:         -32077,
} as const;

export type McpErrorCode = typeof McpErrorCode[keyof typeof McpErrorCode];

// ─── Retryable error codes ────────────────────────────────────────────────────

const RETRYABLE_CODES = new Set<McpErrorCode>([
  McpErrorCode.SESSION_TIMEOUT,
  McpErrorCode.SESSION_START_FAILED,
  McpErrorCode.APPIUM_NOT_REACHABLE,
  McpErrorCode.APPIUM_COMMAND_FAILED,
  McpErrorCode.NETWORK_TIMEOUT,
  McpErrorCode.NETWORK_ERROR,
]);

// ─── McpError class ───────────────────────────────────────────────────────────

export class McpError extends Error {
  public readonly code: McpErrorCode;
  public readonly retryable: boolean;
  public readonly toolName: string | undefined;
  public readonly cause: Error | undefined;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: McpErrorCode,
    options?: {
      toolName?: string;
      cause?: Error;
      retryable?: boolean; // Override default retryability
    }
  ) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.retryable = options?.retryable ?? RETRYABLE_CODES.has(code);
    this.toolName = options?.toolName;
    this.cause = options?.cause;
    this.timestamp = new Date().toISOString();
  }

  /** Serialize to MCP-compatible JSON-RPC error object */
  toMcpResponse(): { isError: true; content: Array<{ type: 'text'; text: string }> } {
    const detail = [
      `[${this.code}] ${this.message}`,
      this.toolName ? `Tool: ${this.toolName}` : null,
      this.retryable ? 'Retryable: yes' : 'Retryable: no',
      this.cause ? `Caused by: ${this.cause.message}` : null,
    ].filter(Boolean).join('\n');

    return {
      isError: true,
      content: [{ type: 'text', text: detail }]
    };
  }

  toString(): string {
    return `McpError(${this.code}): ${this.message}${this.cause ? ' | Caused by: ' + this.cause.message : ''}`;
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

export const McpErrors = {
  sessionNotFound: (sessionId: string, toolName?: string) =>
    new McpError(`No active session found: ${sessionId}. Start a session first.`, McpErrorCode.SESSION_NOT_FOUND, { toolName }),

  sessionTimeout: (toolName?: string) =>
    new McpError('Appium session timed out. Restart the session.', McpErrorCode.SESSION_TIMEOUT, { toolName }),

  fileNotFound: (filePath: string, toolName?: string) =>
    new McpError(`File not found: ${filePath}`, McpErrorCode.FILE_NOT_FOUND, { toolName }),

  permissionDenied: (filePath: string, toolName?: string) =>
    new McpError(`Permission denied: ${filePath}`, McpErrorCode.PERMISSION_DENIED, { toolName }),

  binaryFileRejected: (filePath: string, reason: string, toolName?: string) =>
    new McpError(`Cannot read binary file '${filePath}': ${reason}`, McpErrorCode.BINARY_FILE_REJECTED, { toolName }),

  fileModifiedExternally: (filePath: string, toolName?: string) =>
    new McpError(`File was modified externally since last read: ${filePath}. Re-read the file before writing.`, McpErrorCode.FILE_MODIFIED_EXTERNAL, { toolName }),

  schemaValidationFailed: (details: string, toolName?: string) =>
    new McpError(`Schema validation failed: ${details}`, McpErrorCode.SCHEMA_VALIDATION_FAILED, { toolName }),

  invalidParameter: (param: string, reason: string, toolName?: string) =>
    new McpError(`Invalid parameter '${param}': ${reason}`, McpErrorCode.INVALID_PARAMETER, { toolName }),

  missingConfig: (configKey: string, toolName?: string) =>
    new McpError(`Missing required config: ${configKey}. Ensure mcp-config.json is configured.`, McpErrorCode.MISSING_CONFIG, { toolName }),

  appiumNotReachable: (url: string, toolName?: string) =>
    new McpError(`Appium server not reachable at ${url}. Ensure Appium is running.`, McpErrorCode.APPIUM_NOT_REACHABLE, { toolName }),

  appiumCommandFailed: (command: string, cause?: Error, toolName?: string) =>
    new McpError(`Appium command failed: ${command}`, McpErrorCode.APPIUM_COMMAND_FAILED, { cause, toolName }),

  deviceNotConnected: (deviceName: string, toolName?: string) =>
    new McpError(`Device not connected: ${deviceName}. Check ADB/device connection.`, McpErrorCode.DEVICE_NOT_CONNECTED, { toolName }),

  maxHealingAttempts: (testPath: string, attempts: number, toolName?: string) =>
    new McpError(`Max healing attempts (${attempts}) reached for ${testPath}. Manual review required.`, McpErrorCode.MAX_HEALING_ATTEMPTS, { toolName }),

  shellInjectionDetected: (pattern: string, toolName?: string) =>
    new McpError(`Shell injection pattern detected: '${pattern}'. Command blocked.`, McpErrorCode.SHELL_INJECTION_DETECTED, { toolName }),

  // New error factories
  configValidationFailed: (details: string, toolName?: string) =>
    new McpError(`Configuration validation failed: ${details}`, McpErrorCode.CONFIG_VALIDATION_FAILED, { toolName }),

  invalidTimeout: (value: any, toolName?: string) =>
    new McpError(`Invalid timeout value: ${value}`, McpErrorCode.INVALID_TIMEOUT, { toolName }),

  invalidExecutable: (exe: string, toolName?: string) =>
    new McpError(`Invalid executable: ${exe}`, McpErrorCode.INVALID_EXECUTABLE, { toolName }),

  invalidCredential: (reason: string, toolName?: string) =>
    new McpError(`Invalid credential: ${reason}`, McpErrorCode.INVALID_CREDENTIAL, { toolName }),

  sandboxApiFailed: (details: string, cause?: Error, toolName?: string) =>
    new McpError(`Sandbox API failed: ${details}`, McpErrorCode.SANDBOX_API_FAILED, { cause, toolName }),

  projectValidationFailed: (details: string, toolName?: string) =>
    new McpError(`Project validation failed: ${details}`, McpErrorCode.PROJECT_VALIDATION_FAILED, { toolName }),

  stringNotFound: (snippet: string, toolName?: string) =>
    new McpError(`String not found: ${snippet}`, McpErrorCode.STRING_NOT_FOUND, { toolName }),
};

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isMcpError(err: unknown): err is McpError {
  return err instanceof McpError;
}

export function isRetryableError(err: unknown): boolean {
  if (isMcpError(err)) return err.retryable;
  // Check native node errors that are transient
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED';
  }
  return false;
}

/** Convert any error to a safe MCP response */
export function toMcpErrorResponse(err: unknown, toolName?: string): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  if (isMcpError(err)) {
    return err.toMcpResponse();
  }
  const message = err instanceof Error ? err.message : String(err);
  const wrappedError = new McpError(message, -32000 as McpErrorCode, { toolName });
  return wrappedError.toMcpResponse();
}
