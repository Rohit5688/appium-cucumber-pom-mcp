/**
 * Appium domain types — sessions, devices, elements, inspection results.
 */

// ─── Device & Session ─────────────────────────────────────────────────────────

export type Platform = 'android' | 'ios';
export type AutomationName = 'UIAutomator2' | 'XCUITest' | 'Espresso';

export interface DeviceCapabilities {
  platformName: Platform;
  automationName: AutomationName;
  deviceName: string;
  app?: string;
  appPackage?: string;         // Android
  appActivity?: string;        // Android
  bundleId?: string;           // iOS
  udid?: string;
  noReset?: boolean;
  fullReset?: boolean;
  newCommandTimeout?: number;
  wdaLocalPort?: number;       // iOS only
}

export interface SessionConfig {
  appiumServerUrl: string;
  capabilities: DeviceCapabilities;
  sessionTimeoutMs?: number;
  screenshotOnFailure?: boolean;
}

export interface ActiveSession {
  sessionId: string;
  startedAt: string; // ISO timestamp
  platform: Platform;
  deviceName: string;
  serverUrl: string;
  lastActivityAt: string;
}

// ─── UI Element & Inspection ─────────────────────────────────────────────────

export type LocatorStrategy =
  | 'accessibility id'
  | 'id'
  | 'xpath'
  | 'class name'
  | '-android uiautomator'
  | '-ios predicate string'
  | '-ios class chain';

export interface UiElement {
  index: number;
  text: string;
  resourceId?: string;     // Android: resource-id
  accessibilityId?: string; // contentDesc / accessibilityIdentifier
  className: string;
  bounds: { x: number; y: number; width: number; height: number };
  enabled: boolean;
  clickable: boolean;
  editable: boolean;
  secure: boolean;         // Password fields
  children?: UiElement[];
}

export interface InspectionResult {
  sessionId: string;
  screenName: string;
  platform: Platform;
  timestamp: string;
  elementCount: number;
  xmlHash: string;
  elements: UiElement[];
  rawXml?: string;           // Only included when explicitly requested
}

// ─── Healing ─────────────────────────────────────────────────────────────────

export interface HealCandidate {
  strategy: LocatorStrategy;
  value: string;
  confidence: number;     // 0.0 to 1.0
  reason: string;         // Why this was chosen
}

export interface HealResult {
  success: boolean;
  originalLocator: string;
  healedLocator?: string;
  candidate?: HealCandidate;
  attempts: number;
  reason?: string;  // On failure: MAX_ATTEMPTS_REACHED, ELEMENT_GONE, etc.
}

// ─── Raw capabilities (Appium server response) ────────────────────────────────

/** Loose bag-of-properties returned by driver.capabilities after session creation. */
export interface AppiumCapabilitiesMap {
  platformName?: string;
  deviceName?: string;
  'appium:deviceName'?: string;
  'appium:appPackage'?: string;
  appPackage?: string;
  'appium:appActivity'?: string;
  appActivity?: string;
  'appium:bundleId'?: string;
  bundleId?: string;
  [key: string]: unknown;
}
