/**
 * Test generation domain types — feature files, page objects, step definitions.
 */

// ─── Gherkin ─────────────────────────────────────────────────────────────────

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
}

export interface GherkinScenario {
  title: string;
  steps: GherkinStep[];
  tags?: string[];
}

export interface FeatureFile {
  screenName: string;
  feature: string;         // Feature title
  scenarios: GherkinScenario[];
  background?: GherkinStep[];
}

// ─── Page Object Model ────────────────────────────────────────────────────────

export interface SelectorEntry {
  name: string;
  strategy: string;
  value: string;
  comment?: string;
}

export interface PageObject {
  className: string;       // e.g. "LoginPage"
  screenName: string;
  platform: 'android' | 'ios' | 'cross-platform';
  selectors: SelectorEntry[];
  methods: string[];       // Method names generated
  filePath: string;
}

export interface StepDefinition {
  featureName: string;
  stepCount: number;
  filePath: string;
}

// ─── Generation Request/Response ─────────────────────────────────────────────

export interface GenerationRequest {
  screenName: string;
  uiHierarchy: string;     // XML or action map JSON
  testScenario: string;    // Gherkin text
  platform?: 'android' | 'ios';
  outputDir?: string;
}

export interface GenerationResult {
  success: boolean;
  pageObject?: PageObject;
  stepDefinition?: StepDefinition;
  featureFile?: FeatureFile;
  filesCreated: string[];
  warnings: string[];
  error?: string;
}
