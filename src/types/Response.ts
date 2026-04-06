export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  NOT_FOUND = "NOT_FOUND",
  TIMEOUT = "TIMEOUT",
  BAD_REQUEST = "BAD_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED"
}

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode | string;
    message: string;
    details?: any;
  };
}
