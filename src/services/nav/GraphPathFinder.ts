import type { NavigationNode, NavigationPath, NavigationStep } from '../../types/NavigationTypes.js';
import { McpConfigService } from '../config/McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';


export class GraphPathFinder {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) { }

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }

  public findShortestPath(fromScreen: string, toScreen: string): NavigationNode[] | null {
    if (fromScreen === toScreen) return [];
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const unvisited = new Set<string>();
    for (const [screenName] of this.graph.nodes) {
      distances.set(screenName, Infinity);
      unvisited.add(screenName);
    }

    distances.set(fromScreen, 0);
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let current: string | null = null;
      let minDistance = Infinity;

      for (const node of unvisited) {
        const dist = distances.get(node) || Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          current = node;
        }
      }

      if (!current || minDistance === Infinity) break;

      unvisited.delete(current);

      if (current === toScreen) {
        // Build path
        const path: NavigationNode[] = [];
        let step = toScreen;

        while (previous.has(step)) {
          const node = this.graph.nodes.get(step);
          if (node) path.unshift(node);
          step = previous.get(step)!;
        }

        return path;
      }

      // Check neighbors
      const currentNode = this.graph.nodes.get(current);
      if (currentNode) {
        for (const edge of currentNode.connections) {
          const neighbor = edge.targetScreen;
          if (unvisited.has(neighbor)) {
            const weight = 1 / edge.confidence; // Lower confidence = higher weight
            const alt = (distances.get(current) || 0) + weight;

            if (alt < (distances.get(neighbor) || Infinity)) {
              distances.set(neighbor, alt);
              previous.set(neighbor, current);
            }
          }
        }
      }
    }

    return null;
  }

  public convertPathToSteps(path: NavigationNode[]): NavigationStep[] {
    const steps: NavigationStep[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = path[i];
      const toNode = path[i + 1];

      const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
      if (edge) {
        steps.push({
          fromScreen: fromNode.screen,
          toScreen: toNode.screen,
          action: edge,
          stepDefinition: edge.stepCode
        });
      }
    }

    return steps;
  }

  public calculatePathConfidence(path: NavigationNode[]): number {
    if (path.length <= 1) return 1.0;
    let totalConfidence = 0;
    let edgeCount = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = path[i];
      const toNode = path[i + 1];

      const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
      if (edge) {
        totalConfidence += edge.confidence;
        edgeCount++;
      }
    }

    return edgeCount > 0 ? totalConfidence / edgeCount : 0;
  }

  public estimatePathDuration(path: NavigationNode[]): number {
    const baseStepTime = 2000;
    const actionMultipliers = {
      tap: 1.0,
      swipe: 1.5,
      type: 3.0,
      back: 0.5,
      navigate: 1.0
    };
    let totalTime = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = path[i];
      const toNode = path[i + 1];

      const edge = fromNode.connections.find(e => e.targetScreen === toNode.screen);
      if (edge) {
        const multiplier = actionMultipliers[edge.action] || 1.0;
        totalTime += baseStepTime * multiplier;
      }
    }

    return totalTime;
  }

  /**
   * Calculate multi-factor path quality metrics
   */
  public calculatePathQuality(steps: NavigationStep[]): {
    completenessScore: number;
    reliabilityScore: number;
    maintenanceScore: number;
    crossPlatformScore: number;
  } {
    if (steps.length === 0) {
      return {
        completenessScore: 1.0,
        reliabilityScore: 1.0,
        maintenanceScore: 1.0,
        crossPlatformScore: 1.0
      };
    }

    const stepsWithDefinitions = steps.filter(s => s.stepDefinition).length;
    const completenessScore = stepsWithDefinitions / steps.length;
    let totalReliability = 0;
    for (const step of steps) {
      totalReliability += step.action.confidence;
    }

    const reliabilityScore = totalReliability / steps.length;
    let maintenancePoints = 0;
    for (const step of steps) {
      if (step.action.triggerElement) {
        const el = step.action.triggerElement;
        if (el.accessibilityId) {
          maintenancePoints += 1.0;  // Best: accessibility ID
        } else if (el.id || el.resourceId) {
          maintenancePoints += 0.7;  // Good: resource ID
        } else if (el.xpath) {
          maintenancePoints += 0.3;  // Poor: XPath
        } else {
          maintenancePoints += 0.5;  // Medium: other
        }
      } else {
        maintenancePoints += 0.8;  // No element reference (likely a high-level action)
      }
    }

    const maintenanceScore = steps.length > 0 ? maintenancePoints / steps.length : 1.0;
    let crossPlatformPoints = 0;
    for (const step of steps) {
      if (step.action.triggerElement?.accessibilityId) {
        crossPlatformPoints += 1.0;  // Accessibility ID works on both platforms
      } else if (step.action.triggerElement?.xpath) {
        crossPlatformPoints += 0.5;  // XPath might need platform-specific tweaks
      } else {
        crossPlatformPoints += 0.7;  // Other selectors
      }
    }

    const crossPlatformScore = steps.length > 0 ? crossPlatformPoints / steps.length : 1.0;
    return {
      completenessScore,
      reliabilityScore,
      maintenanceScore,
      crossPlatformScore
    };
  }

  /**
   * Identify risk factors in a navigation path
   */
  public identifyRiskFactors(steps: NavigationStep[]): string[] {
    const risks: string[] = [];
    let xpathCount = 0;
    let missingStepDefCount = 0;
    let complexActionsCount = 0;
    for (const step of steps) {
      // Check for XPath usage
      if (step.action.triggerElement?.xpath) {
        xpathCount++;
      }

      // Check for missing step definitions
      if (!step.stepDefinition) {
        missingStepDefCount++;
      }

      // Check for complex actions (swipe, type)
      if (step.action.action === 'swipe' || step.action.action === 'type') {
        complexActionsCount++;
      }
    }

    if (xpathCount > 0) {
      risks.push(`Contains ${xpathCount} brittle XPath locator(s) - consider using accessibility IDs`);
    }

    if (missingStepDefCount > 0) {
      risks.push(`${missingStepDefCount} step(s) need to be created from scratch`);
    }

    if (complexActionsCount > steps.length / 2) {
      risks.push('Path contains many complex gestures - may be flaky on slower devices');
    }

    if (steps.length > 5) {
      risks.push('Long navigation path - consider creating a direct navigation helper');
    }

    return risks;
  }

  public async suggestNavigationSteps(fromScreen: string, toScreen: string): Promise<NavigationPath | null> {
    console.error(`[NavigationGraph] Finding path from '${fromScreen}' to '${toScreen}'`);
    const path = this.findShortestPath(fromScreen, toScreen);
    if (!path) return null;

    const navigationSteps = this.convertPathToSteps(path);
    const totalConfidence = this.calculatePathConfidence(path);
    const estimatedDuration = this.estimatePathDuration(path);
    const pathQuality = this.calculatePathQuality(navigationSteps);
    const riskFactors = this.identifyRiskFactors(navigationSteps);

    return {
      steps: navigationSteps,
      confidence: totalConfidence,
      estimatedDuration,
      pathQuality,
      riskFactors
    };
  }

  /**
   * Generate navigation context for LLM test generation
   */
  public async generateNavigationContext(targetScreen: string): Promise<string> {
    const entryPoints = this.facade.staticAnalyzer.getEntryPoints();
    const contextParts: string[] = [];
    contextParts.push(`## Available Navigation Paths to "${targetScreen}"`);
    contextParts.push('');
    for (const entryPoint of entryPoints) {
      const path = await this.suggestNavigationSteps(entryPoint, targetScreen);
      if (path) {
        contextParts.push(`### From ${entryPoint}:`);
        contextParts.push(`**Confidence**: ${Math.round(path.confidence * 100)}%`);
        contextParts.push(`**Estimated time**: ${Math.round(path.estimatedDuration / 1000)}s`);
        contextParts.push('');

        for (let i = 0; i < path.steps.length; i++) {
          const step = path.steps[i];
          const stepNum = i + 1;

          if (step.stepDefinition) {
            contextParts.push(`${stepNum}. **Reuse existing step**: \`${step.stepDefinition}\``);
          } else {
            contextParts.push(`${stepNum}. **${step.action.action}** ${step.action.description}`);
            if (step.action.triggerElement) {
              const el = step.action.triggerElement;
              const selector = el.accessibilityId || el.id || el.text || 'element';
              contextParts.push(`   - Target: ${selector}`);
            }
          }
        }
        contextParts.push('');
      }
    }

    if (contextParts.length <= 3) {
      contextParts.push('*No navigation paths found. You may need to create navigation steps from scratch.*');
    }

    return contextParts.join('\n');
  }

  /**
   * Get all screens that can be reached from a given starting point
   */
  public getReachableScreens(fromScreen: string, maxDepth: number = 3): string[] {
    const visited = new Set<string>();
    const reachable: string[] = [];
    const dfs = (screen: string, depth: number) => {
      if (depth > maxDepth || visited.has(screen)) return;

      visited.add(screen);
      reachable.push(screen);

      const node = this.graph.nodes.get(screen);
      if (node) {
        for (const edge of node.connections) {
          dfs(edge.targetScreen, depth + 1);
        }
      }
    };
    dfs(fromScreen, 0);
    return reachable.slice(1);
  }
}