import * as path from 'path';
import { McpConfigService } from '../config/McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';
import { XmlElementParser } from './XmlElementParser.js';
import { GraphPathFinder } from './GraphPathFinder.js';
import { StaticRouteAnalyzer } from './StaticRouteAnalyzer.js';
import { GraphPersistence } from './GraphPersistence.js';
import { MermaidExporter } from '../../utils/MermaidExporter.js';
import type { NavigationGraph, NavigationPath, ElementInfo, NavigationEdge, NavigationNode, NavigationStep } from '../../types/NavigationTypes.js';
export type { NavigationGraph, NavigationPath, ElementInfo, NavigationEdge, NavigationNode, NavigationStep };

export class NavigationGraphService {
  private readonly state: SharedNavState;
  private readonly mcpConfigService: McpConfigService;
  
  // Delegates
  public readonly xmlParser: XmlElementParser;
  public readonly pathFinder: GraphPathFinder;
  public readonly staticAnalyzer: StaticRouteAnalyzer;
  public readonly persistence: GraphPersistence;
  public readonly mermaidExporter: MermaidExporter;

  constructor(projectRoot: string) {
    this.mcpConfigService = new McpConfigService();
    this.state = new SharedNavState();
    this.state.graphPath = path.join(projectRoot, '.AppForge', 'navigation-graph.json');
    
    // Instantiate delegates
    this.xmlParser = new XmlElementParser(this.state, this.mcpConfigService, this);
    this.pathFinder = new GraphPathFinder(this.state, this.mcpConfigService, this);
    this.staticAnalyzer = new StaticRouteAnalyzer(this.state, this.mcpConfigService, this);
    this.persistence = new GraphPersistence(this.state, this.mcpConfigService, this);
    this.mermaidExporter = new MermaidExporter(this.state, this.mcpConfigService, this);
    
    // Load initial graph
    this.state.graph = this.persistence.loadGraph();
  }

  // Public API delegation
  public async extractNavigationMap(projectRoot: string, forceRebuild = false): Promise<NavigationGraph> {
    return this.persistence.extractNavigationMap(projectRoot, forceRebuild);
  }

  public async updateGraphFromSession(screenXml: string, previousScreen?: string, action?: string): Promise<void> {
    return this.persistence.updateGraphFromSession(screenXml, previousScreen, action);
  }

  public async suggestNavigationSteps(fromScreen: string, toScreen: string): Promise<NavigationPath | null> {
    return this.pathFinder.suggestNavigationSteps(fromScreen, toScreen);
  }

  public getReachableScreens(fromScreen: string, maxDepth: number = 3): string[] {
    return this.pathFinder.getReachableScreens(fromScreen, maxDepth);
  }

  public getEntryPoints(): string[] {
    return this.staticAnalyzer.getEntryPoints();
  }

  public getNavigationStepDefinitions(fromScreen: string, toScreen: string): string[] {
    return this.staticAnalyzer.getNavigationStepDefinitions(fromScreen, toScreen);
  }

  public async generateNavigationContext(targetScreen: string): Promise<string> {
    return this.pathFinder.generateNavigationContext(targetScreen);
  }

  public exportMermaidDiagram(projectRoot: string): string {
    return this.mermaidExporter.exportMermaidDiagram(projectRoot);
  }

  public getKnownScreens(projectRoot: string): string[] {
    return Array.from(this.state.graph.nodes.keys());
  }

  public getMapSource(): 'static' | 'live' | 'seed' {
    return this.state.mapSource;
  }

  public getTotalConnections(): number {
    return this.persistence.getTotalConnections();
  }
}
