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
