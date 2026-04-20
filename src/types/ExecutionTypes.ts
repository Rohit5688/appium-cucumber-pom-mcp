export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  reportPath?: string;
  stats?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  failureContext?: {
    screenshotPath: string;
    screenshotSize: number;
    pageSource: string;
    timestamp: string;
  };
}

export type TestJobStatus = 'running' | 'completed' | 'failed';

export interface TestJob {
  jobId: string;
  status: TestJobStatus;
  startedAt: string;
  completedAt?: string;
  result?: ExecutionResult;
  progress?: {
    elapsedSeconds: number;
    estimatedTotal: number;
    lastActivity: string;
  };
}

export interface ParsedElement {
  tag: string;
  id: string;
  text: string;
  bounds: string;
  className?: string;
  contentDesc?: string;
  resourceId?: string;
  locatorStrategies: string[];
}
