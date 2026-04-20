import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../../types/NavigationTypes.js';
import { McpConfigService } from '../config/McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';


export class GraphPersistence {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) { }

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }

  public loadGraph(): NavigationGraph {
    if (fs.existsSync(this.graphPath)) {
      try {
        const data = fs.readFileSync(this.graphPath, 'utf-8');
        const parsed = JSON.parse(data);

        // Rebuild Map<string, NavigationNode> and restore Date objects
        const nodes = new Map<string, NavigationNode>();
        const rawNodes = parsed.nodes || {};
        for (const [key, rawNode] of Object.entries(rawNodes)) {
          const rn: any = rawNode;
          // Ensure arrays exist
          const node: NavigationNode = {
            screen: rn.screen,
            elements: (rn.elements || []) as ElementInfo[],
            connections: (rn.connections || []) as NavigationEdge[],
            visitCount: rn.visitCount || 0,
            lastVisited: rn.lastVisited ? new Date(rn.lastVisited) : new Date(),
            screenSignature: rn.screenSignature || ''
          };
          nodes.set(key, node);
        }

        this.fileToSignatures = parsed.fileToSignatures || {};
        return {
          nodes,
          entryPoints: parsed.entryPoints || [],
          lastUpdated: parsed.lastUpdated ? new Date(parsed.lastUpdated) : new Date()
        };
      } catch (error) {
        console.error('[NavigationGraph] Error loading graph, starting fresh:', error);
      }
    }

    return {
      nodes: new Map(),
      entryPoints: [],
      lastUpdated: new Date()
    };
  }

  public async saveGraph(): Promise<void> {
    try {
      const dir = path.dirname(this.graphPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Serialize Map to plain object and convert Dates to ISO strings
      const nodesObj: Record<string, any> = {};
      for (const [key, node] of this.graph.nodes) {
        nodesObj[key] = {
          ...node,
          // Serialize nested Date
          lastVisited: node.lastVisited ? node.lastVisited.toISOString() : new Date().toISOString()
        };
      }

      const serializable = {
        nodes: nodesObj,
        entryPoints: this.graph.entryPoints,
        lastUpdated: new Date().toISOString(), // Update timestamp
        fileToSignatures: this.fileToSignatures
      };

      fs.writeFileSync(this.graphPath, JSON.stringify(serializable, null, 2));

      // P2 IMPROVEMENT 2: Save file hashes for change detection
      await this.saveFileHashes(path.dirname(this.graphPath));
    } catch (error) {
      console.error('[NavigationGraph] Error saving graph:', error);
    }
  }

  /**
   * Check if the cached graph is still fresh (no source file changes)
   */
  public async isGraphFresh(projectRoot: string): Promise<boolean> {
    if (this.graph.nodes.size === 0) return false;
    const hashFile = path.join(path.dirname(this.graphPath), 'file-hashes.json');
    if (!fs.existsSync(hashFile) || !fs.existsSync(this.graphPath)) {
      return false;
    }

    try {
      const savedHashes = JSON.parse(fs.readFileSync(hashFile, 'utf-8'));
      const currentHashes = await this.computeFileHashes(projectRoot);

      // Compare hashes
      const savedKeys = Object.keys(savedHashes);
      const currentKeys = Object.keys(currentHashes);

      if (savedKeys.length !== currentKeys.length) return false;

      for (const file of savedKeys) {
        if (savedHashes[file] !== currentHashes[file]) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[NavigationGraph] Error checking freshness:', error);
      return false;
    }
  }

  /**
   * Detect which files have changed since last graph build
   */
  public async detectChangedFiles(projectRoot: string): Promise<string[]> {
    const hashFile = path.join(path.dirname(this.graphPath), 'file-hashes.json');
    if (!fs.existsSync(hashFile)) {
      // No previous hashes, consider all files changed
      const allFiles = [
        ...this.facade.staticAnalyzer.findStepDefinitionFiles(projectRoot),
        ...this.facade.staticAnalyzer.findPageObjectFiles(projectRoot)
      ];
      return allFiles;
    }

    try {
      const savedHashes = JSON.parse(fs.readFileSync(hashFile, 'utf-8'));
      const currentHashes = await this.computeFileHashes(projectRoot);
      const changedFiles: string[] = [];

      // Check for new or modified files
      for (const [file, hash] of Object.entries(currentHashes)) {
        if (savedHashes[file] !== hash) {
          changedFiles.push(file);
        }
      }

      // Check for deleted files
      for (const file of Object.keys(savedHashes)) {
        if (!(file in currentHashes)) {
          changedFiles.push(file);
        }
      }

      return changedFiles;
    } catch (error) {
      console.error('[NavigationGraph] Error detecting changes:', error);
      return [];
    }
  }

  /**
   * Compute file hashes for change detection
   */
  public async computeFileHashes(projectRoot: string): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const allFiles = [
      ...this.facade.staticAnalyzer.findStepDefinitionFiles(projectRoot),
      ...this.facade.staticAnalyzer.findPageObjectFiles(projectRoot)
    ];
    const hashes: Record<string, string> = {};
    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        hashes[file] = hash;
      } catch (error) {
        console.error(`[NavigationGraph] Error hashing ${file}:`, error);
      }
    }

    return hashes;
  }

  /**
   * Save file hashes for future change detection
   */
  public async saveFileHashes(dir: string): Promise<void> {
    try {
      const projectRoot = path.dirname(dir);
      const hashes = await this.computeFileHashes(projectRoot);
      const hashFile = path.join(dir, 'file-hashes.json');
      fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 2));
    } catch (error) {
      console.error('[NavigationGraph] Error saving file hashes:', error);
    }
  }

  /**
   * Update graph incrementally for a small number of changed files
   */
  public async updateGraphIncremental(projectRoot: string, changedFiles: string[]): Promise<void> {
    const signaturesByFile: Record<string, string[]> = {};
    for (const file of changedFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        let filePatterns: any[] = [];
        if (file.includes('step-definition') || file.includes('steps')) {
          filePatterns = this.facade.staticAnalyzer.extractNavigationPatterns(content, file);
        } else {
          // Treat as page object by default if not clearly a step file
          filePatterns = this.facade.staticAnalyzer.extractPageObjectNavigationMethods(content, file);
        }

        // Collect signatures (use stepText or methodName as the signature)
        const sigs = filePatterns.map(p => (p.stepText || p.methodName || p.methodName || '').toString()).filter(Boolean);
        signaturesByFile[file] = sigs;

      } catch (error) {
        console.error(`[NavigationGraph] Error analyzing ${file}:`, error);
        signaturesByFile[file] = [];
      }
    }

    for (const [, node] of this.graph.nodes) {
      node.connections = node.connections.filter((edge: NavigationEdge) => {
        if (!edge.stepCode) return true; // keep edges without provenance
        // If any changed file produced a signature that matches this edge, remove it
        for (const file of Object.keys(signaturesByFile)) {
          const sigs = signaturesByFile[file] || [];
          if (sigs.includes(edge.stepCode)) {
            return false; // drop this edge
          }
        }
        return true;
      });
    }

    for (const file of Object.keys(signaturesByFile)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        let filePatterns: any[] = [];
        if (file.includes('step-definition') || file.includes('steps')) {
          filePatterns = this.facade.staticAnalyzer.extractNavigationPatterns(content, file);
        } else {
          filePatterns = this.facade.staticAnalyzer.extractPageObjectNavigationMethods(content, file);
        }

        for (const pattern of filePatterns) {
          const screenInfo = this.facade.staticAnalyzer.inferScreenConnection(pattern);
          if (screenInfo) {
            this.facade.mermaidExporter.addGraphNode(screenInfo.fromScreen, screenInfo.toScreen, screenInfo.action);
          }
        }

        // Update mapping for this file to the latest signatures
        this.fileToSignatures[file] = (filePatterns.map(p => (p.stepText || p.methodName || '').toString()).filter(Boolean));
      } catch (error) {
        console.error(`[NavigationGraph] Error re-processing ${file}:`, error);
      }
    }

    this.facade.staticAnalyzer.identifyEntryPoints();
  }

  /**
   * Rebuild the entire graph from scratch
   */
  public async rebuildGraphFull(projectRoot: string): Promise<void> {
    const stepDefinitions = await this.facade.staticAnalyzer.analyzeStepDefinitions(projectRoot);
    const pageObjects = await this.facade.staticAnalyzer.analyzePageObjects(projectRoot);
    this.graph.nodes.clear();
    this.graph.entryPoints = [];
    await this.facade.staticAnalyzer.buildNavigationGraph(stepDefinitions, pageObjects);
    if (this.graph.nodes.size === 0) {
      await this.buildSeedMapFromConfig(projectRoot);
      this.mapSource = 'seed';
    } else {
      this.mapSource = 'static';
    }
  }

  /**
   * Builds a conceptual "seed" navigation graph for brand-new projects that have no
   * PageObjects or step definitions yet.
   *
   * Reads mcp-config.json for the app name, then scaffolds a minimal 3-node graph:
   *   AppEntry → Login/Welcome → Home/Dashboard
   *
   * This gives the LLM a concrete framework to attach the first test scenario to,
   * instead of returning an empty Mermaid diagram with no context.
   */
  public async buildSeedMapFromConfig(projectRoot: string): Promise<void> {
    let appName = 'App';
    try {
      const configPath = path.join(projectRoot, 'mcp-config.json');
      if (fs.existsSync(configPath)) {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        appName = cfg?.project?.appName || cfg?.appName || 'App';
      }
    } catch {
      // Silently fall back to generic name
    }

    const seedEdge = (target: string, desc: string): NavigationEdge => ({
      action: 'tap',
      targetScreen: target,
      confidence: 0.3,
      description: desc
    });
    const now = new Date();
    const seedNodes: Array<[string, NavigationNode]> = [
      [`${appName} Entry`, {
        screen: `${appName} Entry`,
        elements: [],
        connections: [seedEdge('Login', 'App launches to Login or Welcome screen')],
        visitCount: 0,
        lastVisited: now,
        screenSignature: 'seed-entry'
      }],
      ['Login', {
        screen: 'Login',
        elements: [],
        connections: [seedEdge('Home', 'Tap Login button with valid credentials')],
        visitCount: 0,
        lastVisited: now,
        screenSignature: 'seed-login'
      }],
      ['Home', {
        screen: 'Home',
        elements: [],
        connections: [],
        visitCount: 0,
        lastVisited: now,
        screenSignature: 'seed-home'
      }]
    ];
    for (const [key, node] of seedNodes) {
      this.graph.nodes.set(key, node);
    }

    this.graph.entryPoints = [`${appName} Entry`];
    console.error(`[NavigationGraph] No static artifacts found — seeded graph with ${appName} conceptual navigation scaffold`);
  }

  public getTotalConnections(): number {
    let total = 0;
    for (const [, node] of this.graph.nodes) {
      total += node.connections.length;
    }

    return total;
  }

  /**
   * Extract navigation map from project's existing step definitions and page objects
   *
   * P2 IMPROVEMENT 2: Implements incremental updates with caching strategy
   * to avoid rebuilding the entire graph on every call.
   */
  public async extractNavigationMap(projectRoot: string, forceRebuild = false): Promise<NavigationGraph> {
    console.error('[NavigationGraph] Analyzing project navigation patterns...');
    if (!forceRebuild && await this.isGraphFresh(projectRoot)) {
      console.error('[NavigationGraph] Using cached graph (fresh)');
      return this.graph;
    }

    const changedFiles = await this.detectChangedFiles(projectRoot);
    if (changedFiles.length === 0 && !forceRebuild && this.graph.nodes.size > 0) {
      console.error('[NavigationGraph] Using cached graph (no changes detected)');
      return this.graph;
    }

    if (changedFiles.length > 0 && changedFiles.length < 10 && !forceRebuild) {
      console.error(`[NavigationGraph] Performing incremental update for ${changedFiles.length} changed files`);
      await this.updateGraphIncremental(projectRoot, changedFiles);
    } else {
      // Full rebuild for major changes or force rebuild
      console.error('[NavigationGraph] Performing full graph rebuild');
      await this.rebuildGraphFull(projectRoot);
    }

    await this.saveGraph();
    console.error(`[NavigationGraph] Extracted ${this.graph.nodes.size} screens with ${this.getTotalConnections()} navigation paths`);
    return this.graph;
  }

  /**
   * Update navigation graph based on live session activity
   */
  public async updateGraphFromSession(screenXml: string, previousScreen?: string, action?: string): Promise<void> {
    const screenSignature = this.facade.xmlParser.generateScreenSignature(screenXml);
    const elements = this.facade.xmlParser.extractElementsFromXml(screenXml);
    const screenName = this.facade.xmlParser.inferScreenName(elements, screenSignature);
    const existingNode = this.graph.nodes.get(screenName);
    if (existingNode) {
      existingNode.visitCount++;
      existingNode.lastVisited = new Date();
      // Merge new elements (in case screen has dynamic content)
      existingNode.elements = this.facade.xmlParser.mergeElements(existingNode.elements, elements);
    } else {
      const newNode: NavigationNode = {
        screen: screenName,
        elements,
        connections: [],
        visitCount: 1,
        lastVisited: new Date(),
        screenSignature
      };
      this.graph.nodes.set(screenName, newNode);
    }

    if (previousScreen && action) {
      this.facade.staticAnalyzer.addNavigationEdge(previousScreen, screenName, action, 0.8); // Medium confidence from live session
      this.mapSource = 'live'; // Mark as enriched by live session
    }

    await this.saveGraph();
  }
}