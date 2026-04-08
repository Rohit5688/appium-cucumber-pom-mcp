/**
 * Unified MCP tool result envelope.
 * All tools should return this shape for consistency.
 */

export interface ToolMetadata {
  toolName: string;
  durationMs: number;
  timestamp: string;
  sessionId?: string;
}

export interface McpToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: number;
  metadata: ToolMetadata;
}

/**
 * Factory for standard success result.
 */
export function toolSuccess<T>(
  toolName: string,
  data: T,
  startTime: number,
  sessionId?: string
): McpToolResult<T> {
  return {
    success: true,
    data,
    metadata: {
      toolName,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      sessionId,
    },
  };
}

/**
 * Factory for standard error result.
 */
export function toolError(
  toolName: string,
  message: string,
  startTime: number,
  errorCode?: number,
  sessionId?: string
): McpToolResult<never> {
  return {
    success: false,
    error: message,
    errorCode,
    metadata: {
      toolName,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      sessionId,
    },
  };
}

/**
 * Convert McpToolResult to MCP SDK response format.
 */
export function toMcpResponse(result: McpToolResult): { isError?: boolean; content: Array<{ type: 'text'; text: string }> } {
  if (!result.success && result.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `[${result.errorCode ?? 'ERROR'}] ${result.error}\n(Tool: ${result.metadata.toolName}, Duration: ${result.metadata.durationMs}ms)` }]
    };
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }]
  };
}
