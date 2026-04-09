import { ErrorCode as McpErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode, ErrorResponse } from "../types/Response.js";

export class AppForgeError extends Error {
  public mcpErrorCode: number;
  public details?: any;

  constructor(
    public readonly code: ErrorCode | string,
    message: string,
    mcpCodeOrRemediation: number | any[] = McpErrorCode.InternalError,
    details?: any
  ) {
    super(message);
    this.name = 'AppForgeError';
    if (Array.isArray(mcpCodeOrRemediation)) {
      this.mcpErrorCode = McpErrorCode.InternalError;
      this.details = mcpCodeOrRemediation;
    } else {
      this.mcpErrorCode = mcpCodeOrRemediation as number;
      this.details = details;
    }
  }
}

export class ErrorFactory {
  static badRequest(message: string, details?: any): AppForgeError {
    return new AppForgeError(ErrorCode.BAD_REQUEST, message, McpErrorCode.InvalidParams, details);
  }

  static internal(message: string, details?: any): AppForgeError {
    return new AppForgeError(ErrorCode.INTERNAL_ERROR, message, McpErrorCode.InternalError, details);
  }

  static notFound(message: string, details?: any): AppForgeError {
    return new AppForgeError(ErrorCode.NOT_FOUND, message, McpErrorCode.InvalidRequest, details);
  }

  static timeout(message: string, details?: any): AppForgeError {
    return new AppForgeError(ErrorCode.TIMEOUT, message, McpErrorCode.RequestTimeout, details);
  }

  static validation(message: string, details?: any): AppForgeError {
    return new AppForgeError(ErrorCode.VALIDATION_ERROR, message, McpErrorCode.InvalidParams, details);
  }

  static createResponse(error: unknown): ErrorResponse {
    if (error instanceof AppForgeError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        }
      };
    }
    
    const isError = error instanceof Error;
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: isError ? error.message : String(error),
        details: isError && error.stack ? { stack: error.stack } : undefined,
      }
    };
  }
}
