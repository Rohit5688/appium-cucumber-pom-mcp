export interface ElementInfo {
  id?: string;
  text?: string;
  className?: string;
  bounds?: string;
  resourceId?: string;
  accessibilityId?: string;
  xpath?: string;
}

export interface NavigationEdge {
  action: 'tap' | 'swipe' | 'type' | 'back' | 'navigate';
  targetScreen: string;
  triggerElement?: ElementInfo;
  confidence: number;
  description: string;
  stepCode?: string; // Actual step definition code that performs this navigation
}

export interface NavigationNode {
  screen: string;
  elements: ElementInfo[];
  connections: NavigationEdge[];
  visitCount: number;
  lastVisited: Date;
  screenSignature: string; // Unique hash of key elements to identify screen
}

export interface NavigationGraph {
  nodes: Map<string, NavigationNode>;
  entryPoints: string[]; // Common starting screens (splash, main, login)
  lastUpdated: Date;
}

export interface NavigationPath {
  steps: NavigationStep[];
  confidence: number;
  estimatedDuration: number; // in milliseconds
  pathQuality?: {
    completenessScore: number;    // How many steps have existing definitions (0-1)
    reliabilityScore: number;     // Based on test pass rates (0-1)
    maintenanceScore: number;     // Based on how often steps change (0-1)
    crossPlatformScore: number;   // Works on both iOS and Android (0-1)
  };
  riskFactors?: string[];          // e.g., "Contains brittle XPath", "Requires mock data"
}

export interface NavigationStep {
  fromScreen: string;
  toScreen: string;
  action: NavigationEdge;
  stepDefinition?: string; // Reference to existing step definition
}
