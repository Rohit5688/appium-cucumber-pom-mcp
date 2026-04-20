import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../../types/NavigationTypes.js';
import { McpConfigService } from '../config/McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';

export class StaticRouteAnalyzer {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) {}

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }
  get paths() { return this.mcpConfigService.getPaths(this.mcpConfigService.read(process.cwd())); }

    public async analyzeStepDefinitions(projectRoot: string): Promise<any[]> {
        const stepFiles = this.findStepDefinitionFiles(projectRoot);
        const patterns: any[] = [];
        for (const filePath of stepFiles) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const filePatterns = this.extractNavigationPatterns(content, filePath);
            patterns.push(...filePatterns);
          } catch (error) {
            console.error(`[NavigationGraph] Error analyzing ${filePath}:`, error);
          }
        }

        return patterns;
    }

    public async analyzePageObjects(projectRoot: string): Promise<any[]> {
        const pageFiles = this.findPageObjectFiles(projectRoot);
        const patterns: any[] = [];
        for (const filePath of pageFiles) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const filePatterns = this.extractPageObjectNavigationMethods(content, filePath);
            patterns.push(...filePatterns);
          } catch (error) {
            console.error(`[NavigationGraph] Error analyzing ${filePath}:`, error);
          }
        }

        return patterns;
    }

    public extractNavigationPatterns(stepCode: string, filePath: string): any[] {
        const patterns: any[] = [];
        const stepRegex = /@(?:Given|When|Then)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        let stepMatch;
        const lines = stepCode.split('\n');
        while ((stepMatch = stepRegex.exec(stepCode)) !== null) {
          const stepText = stepMatch[1];
          if (this.isNavigationStep(stepText)) {
            const lineNumber = this.getLineNumber(stepCode, stepMatch.index);
            const functionBody = this.extractFunctionBody(lines, lineNumber);
            patterns.push({
              stepText,
              filePath,
              lineNumber,
              functionBody,
              type: 'step_definition'
            });
          }
        }
        return patterns;
    }

    public extractPageObjectNavigationMethods(pageCode: string, filePath: string): any[] {
        const patterns: any[] = [];
        const methodRegex = /(goto|navigate|open|goTo|navigateTo)\w*\s*\([^)]*\)\s*{/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(pageCode)) !== null) {
          const methodName = methodMatch[0];
          const lineNumber = this.getLineNumber(pageCode, methodMatch.index);
          const lines = pageCode.split('\n');
          const functionBody = this.extractFunctionBody(lines, lineNumber);
          patterns.push({
            methodName,
            filePath,
            lineNumber,
            functionBody,
            type: 'page_object_method'
          });
        }
        return patterns;
    }

    public isNavigationStep(stepText: string): boolean {
        const navigationKeywords = [
                  'navigate', 'go to', 'open', 'visit', 'click', 'tap', 'press',
                  'swipe', 'scroll', 'back', 'return', 'close', 'menu', 'sidebar'
                ];
        const lowerStepText = stepText.toLowerCase();
        return navigationKeywords.some(keyword => lowerStepText.includes(keyword));
    }

    public async buildNavigationGraph(stepDefinitions: any[], pageObjects: any[]): Promise<void> {
        const allPatterns = [...stepDefinitions, ...pageObjects];
        for (const pattern of allPatterns) {
          const screenInfo = this.inferScreenConnection(pattern);
          if (screenInfo) {
            this.facade.mermaidExporter.addGraphNode(screenInfo.fromScreen, screenInfo.toScreen, screenInfo.action);
          }
        }
        this.identifyEntryPoints();
    }

    public inferScreenConnection(pattern: any): { fromScreen: string; toScreen: string; action: NavigationEdge } | null {
        const code = pattern.functionBody || '';
        const screenMatches = code.match(/(?:screen|page|view)\s*['"]\s*(\w+)\s*['"]|(\w+)(?:Screen|Page|View)/gi);
        if (screenMatches && screenMatches.length >= 2) {
          const fromScreen = this.facade.xmlParser.normalizeScreenName(screenMatches[0]);
          const toScreen = this.facade.xmlParser.normalizeScreenName(screenMatches[1]);
          const action: NavigationEdge = {
            action: this.inferActionType(pattern.stepText || pattern.methodName),
            targetScreen: toScreen,
            confidence: 0.6,
            description: pattern.stepText || pattern.methodName,
            stepCode: pattern.stepText
          };
          return { fromScreen, toScreen, action };
        }
        return null;
    }

    public inferActionType(text: string): NavigationEdge['action'] {
        const lower = text.toLowerCase();
        if (lower.includes('tap') || lower.includes('click') || lower.includes('press')) return 'tap';
        if (lower.includes('swipe')) return 'swipe';
        if (lower.includes('type') || lower.includes('enter')) return 'type';
        if (lower.includes('back')) return 'back';
        return 'navigate';
    }

    public findStepDefinitionFiles(projectRoot: string): string[] {
        const files: string[] = [];
        const stepsRoot = this.paths?.stepsRoot ?? 'src/step-definitions';
        const locatorsRoot = this.paths?.locatorsRoot ?? 'src/locators';
        const candidates = [
                  path.join(projectRoot, stepsRoot),
                  path.join(projectRoot, 'step-definitions'),
                  path.join(projectRoot, 'steps'),
                  path.join(projectRoot, locatorsRoot),
                ];
        for (const dir of candidates) {
          if (fs.existsSync(dir)) {
            const dirFiles = fs.readdirSync(dir)
              .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
              .map(file => path.join(dir, file));
            files.push(...dirFiles);
          }
        }
        return Array.from(new Set(files));
    }

    public findPageObjectFiles(projectRoot: string): string[] {
        const files: string[] = [];
        const pagesRoot = this.paths?.pagesRoot ?? 'src/pages';
        const candidates = [
                  path.join(projectRoot, pagesRoot),
                  path.join(projectRoot, 'pages'),
                  path.join(projectRoot, 'page-objects'),
                ];
        for (const dir of candidates) {
          if (fs.existsSync(dir)) {
            const dirFiles = fs.readdirSync(dir)
              .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
              .map(file => path.join(dir, file));
            files.push(...dirFiles);
          }
        }
        return Array.from(new Set(files));
    }

    public getLineNumber(text: string, index: number): number {
        return text.substring(0, index).split('\n').length - 1;
    }

    public extractFunctionBody(lines: string[], startLine: number): string {
        let braceCount = 0;
        let body = '';
        let inFunction = false;
        for (let i = startLine; i < lines.length && i < startLine + 20; i++) {
          const line = lines[i];
          body += line + '\n';
          for (const char of line) {
            if (char === '{') { braceCount++; inFunction = true; }
            else if (char === '}') { braceCount--; if (inFunction && braceCount === 0) return body; }
          }
        }
        return body;
    }

    public addNavigationEdge(fromScreen: string, toScreen: string, action: string, confidence: number): void {
        const fromNode = this.graph.nodes.get(fromScreen);
        if (!fromNode) return;
        const existingEdge = fromNode.connections.find((edge: NavigationEdge) => edge.targetScreen === toScreen);
        if (existingEdge) {
          existingEdge.confidence = (existingEdge.confidence + confidence) / 2;
        } else {
          const newEdge: NavigationEdge = {
            action: action as NavigationEdge['action'],
            targetScreen: toScreen,
            confidence,
            description: `${action} to ${toScreen}`
          };
          fromNode.connections.push(newEdge);
        }
    }

    public identifyEntryPoints(): void {
        const entryPatterns = ['splash', 'main', 'home', 'login', 'welcome', 'start'];
        for (const [screenName] of this.graph.nodes) {
          const lower = screenName.toLowerCase();
          if (entryPatterns.some(pattern => lower.includes(pattern))) {
            if (!this.graph.entryPoints.includes(screenName)) {
              this.graph.entryPoints.push(screenName);
            }
          }
        }
        if (this.graph.entryPoints.length === 0) {
          const hasIncoming = new Set<string>();
          for (const [, node] of this.graph.nodes) {
            for (const edge of node.connections) hasIncoming.add(edge.targetScreen);
          }
          for (const [screenName] of this.graph.nodes) {
            if (!hasIncoming.has(screenName)) this.graph.entryPoints.push(screenName);
          }
        }
    }

    public getEntryPoints(): string[] {
        const screenUsage = (Array.from(this.graph.nodes.entries()) as any[])
                  .map(([name, node]: [string, NavigationNode]) => ({ name, visitCount: node.visitCount }))
                  .sort((a: any, b: any) => b.visitCount - a.visitCount);
        return screenUsage.slice(0, 3).map(s => s.name);
    }

    public getNavigationStepDefinitions(fromScreen: string, toScreen: string): string[] {
        const node = this.graph.nodes.get(fromScreen);
        if (!node) return [];
        return node.connections
        .filter((edge: NavigationEdge) => edge.targetScreen === toScreen)
        .map((edge: NavigationEdge) => edge.stepCode)
        .filter((code: any) => code !== undefined) as string[];
    }
}