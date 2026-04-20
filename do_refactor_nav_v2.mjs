import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
// Read from backup
const backupPath = "backups-pre-refactor/NavigationGraphService.ts.bak";
const sourceFile = project.addSourceFileAtPath(backupPath);
const cls = sourceFile.getClassOrThrow("NavigationGraphService");

const destDir = "src/services/nav";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const plan = {
  XmlElementParser: ['extractElementsFromXml', 'parseAttributes', 'extractStableElements', 'generateScreenSignature', 'inferScreenName', 'normalizeScreenName', 'mergeElements'],
  GraphPathFinder: ['findShortestPath', 'convertPathToSteps', 'calculatePathConfidence', 'estimatePathDuration', 'calculatePathQuality', 'identifyRiskFactors', 'generateNavigationContext', 'getReachableScreens'],
  StaticRouteAnalyzer: ['analyzeStepDefinitions', 'analyzePageObjects', 'extractNavigationPatterns', 'extractPageObjectNavigationMethods', 'isNavigationStep', 'buildNavigationGraph', 'inferScreenConnection', 'inferActionType', 'findStepDefinitionFiles', 'findPageObjectFiles', 'getLineNumber', 'extractFunctionBody', 'addNavigationEdge', 'identifyEntryPoints', 'getEntryPoints', 'getNavigationStepDefinitions'],
  GraphPersistence: ['loadGraph', 'saveGraph', 'isGraphFresh', 'detectChangedFiles', 'computeFileHashes', 'saveFileHashes', 'updateGraphIncremental', 'rebuildGraphFull', 'buildSeedMapFromConfig', 'getTotalConnections', 'extractNavigationMap', 'updateGraphFromSession'],
  MermaidExporter: ['exportMermaidDiagram', 'addGraphNode']
};

const methodToOwner = {};
for (const [owner, methods] of Object.entries(plan)) {
  for (const m of methods) {
    methodToOwner[m] = owner;
  }
}

const ownerToProp = {
  XmlElementParser: 'xmlParser',
  GraphPathFinder: 'pathFinder',
  StaticRouteAnalyzer: 'staticAnalyzer',
  GraphPersistence: 'persistence',
  MermaidExporter: 'mermaidExporter'
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
    imports = imports.replace('../../types/NavigationTypes.js', '../types/NavigationTypes.js');
    imports = imports.replace('../McpConfigService.js', '../services/McpConfigService.js');
    imports = imports.replace('./SharedNavState.js', '../services/nav/SharedNavState.js');
  }

  const sf = project.createSourceFile(outPath, imports + `\n\nexport class ${className} {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) {}

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
    }
  }

  // Patch this. calls
  newCls.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach(propAccess => {
    if (propAccess.getExpression().getKind() === SyntaxKind.ThisKeyword) {
      const methodName = propAccess.getName();
      const owner = methodToOwner[methodName];
      
      // If the method is owned by another class, redirect through facade
      if (owner && owner !== className) {
        const propName = ownerToProp[owner];
        propAccess.replaceWithText(`this.facade.${propName}.${methodName}`);
      }
    }
  });
  
  sf.saveSync();
  console.log(`Created ${className}`);
}

console.log("Nav delegates generated and patched.");
