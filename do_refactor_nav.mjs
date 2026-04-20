import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("src/services/NavigationGraphService.ts");
const sourceFile = project.getSourceFileOrThrow("src/services/NavigationGraphService.ts");
const cls = sourceFile.getClassOrThrow("NavigationGraphService");

const destDir = "src/services/nav";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const plan = {
  XmlElementParser: ['extractElementsFromXml', 'parseAttributes', 'extractStableElements', 'generateScreenSignature', 'inferScreenName', 'normalizeScreenName', 'mergeElements'],
  GraphPathFinder: ['findShortestPath', 'convertPathToSteps', 'calculatePathConfidence', 'estimatePathDuration', 'calculatePathQuality', 'identifyRiskFactors'],
  StaticRouteAnalyzer: ['analyzeStepDefinitions', 'analyzePageObjects', 'extractNavigationPatterns', 'extractPageObjectNavigationMethods', 'isNavigationStep', 'buildNavigationGraph', 'inferScreenConnection', 'inferActionType', 'findStepDefinitionFiles', 'findPageObjectFiles', 'getLineNumber', 'extractFunctionBody', 'addNavigationEdge', 'identifyEntryPoints'],
  GraphPersistence: ['loadGraph', 'saveGraph', 'isGraphFresh', 'detectChangedFiles', 'computeFileHashes', 'saveFileHashes', 'updateGraphIncremental', 'rebuildGraphFull', 'buildSeedMapFromConfig'],
  MermaidExporter: ['exportMermaidDiagram', 'addGraphNode']
};

const baseImports = `import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../../types/NavigationTypes.js';
import { McpConfigService } from '../McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';
`;

for (const [className, methodNames] of Object.entries(plan)) {
  const isUtils = className === 'MermaidExporter';
  const outPath = isUtils ? 'src/utils/MermaidExporter.ts' : `src/services/nav/${className}.ts`;
  
  let imports = baseImports;
  if (isUtils) {
    imports = `import fs from 'fs';
import path from 'path';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../types/NavigationTypes.js';
import { McpConfigService } from '../services/McpConfigService.js';
import { SharedNavState } from '../services/nav/SharedNavState.js';
`;
  }

  const sf = project.createSourceFile(outPath, imports + `\n\nexport class ${className} {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService) {}

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }
}`, { overwrite: true });

  const newCls = sf.getClassOrThrow(className);

  for (const mName of methodNames) {
    const method = cls.getMethod(mName);
    if (method) {
      let structure = method.getStructure();
      structure.scope = "public"; 
      newCls.addMethod(structure);
    } else {
      console.log("Method not found:", mName);
    }
  }
  
  sf.saveSync();
  console.log(`Created ${className}`);
}

console.log("Nav delegates generated.");
