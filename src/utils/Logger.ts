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
