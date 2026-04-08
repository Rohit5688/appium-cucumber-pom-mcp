/**
 * Permission and safety check result types.
 * Used by pre-flight checks and security validators.
 */

export type PermissionAction = 'allow' | 'ask' | 'block' | 'passthrough';

export interface PermissionResult {
  action: PermissionAction;
  reason?: string;
  suggestedAlternative?: string;
}

export interface PreFlightCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface PreFlightReport {
  allPassed: boolean;
  checks: PreFlightCheck[];
  blockers: PreFlightCheck[]; // severity === 'error'
  warnings: PreFlightCheck[]; // severity === 'warning'
}
