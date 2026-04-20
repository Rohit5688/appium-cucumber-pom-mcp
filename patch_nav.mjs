import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("src/services/nav/**/*.ts");
project.addSourceFilesAtPaths("src/utils/MermaidExporter.ts");

const plan = {
  XmlElementParser: ['extractElementsFromXml', 'parseAttributes', 'extractStableElements', 'generateScreenSignature', 'inferScreenName', 'normalizeScreenName', 'mergeElements'],
  GraphPathFinder: ['findShortestPath', 'convertPathToSteps', 'calculatePathConfidence', 'estimatePathDuration', 'calculatePathQuality', 'identifyRiskFactors'],
  StaticRouteAnalyzer: ['analyzeStepDefinitions', 'analyzePageObjects', 'extractNavigationPatterns', 'extractPageObjectNavigationMethods', 'isNavigationStep', 'buildNavigationGraph', 'inferScreenConnection', 'inferActionType', 'findStepDefinitionFiles', 'findPageObjectFiles', 'getLineNumber', 'extractFunctionBody', 'addNavigationEdge', 'identifyEntryPoints'],
  GraphPersistence: ['loadGraph', 'saveGraph', 'isGraphFresh', 'detectChangedFiles', 'computeFileHashes', 'saveFileHashes', 'updateGraphIncremental', 'rebuildGraphFull', 'buildSeedMapFromConfig'],
  MermaidExporter: ['exportMermaidDiagram', 'addGraphNode'],
  NavigationGraphService: ['extractNavigationMap', 'updateGraphFromSession', 'suggestNavigationSteps', 'getReachableScreens', 'getEntryPoints', 'getNavigationStepDefinitions', 'generateNavigationContext', 'getKnownScreens', 'getMapSource', 'getTotalConnections']
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

for (const sourceFile of project.getSourceFiles()) {
  const cls = sourceFile.getClasses()[0];
  if (!cls || cls.getName() === 'SharedNavState') continue;

  const currentClassName = cls.getName();

  cls.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach(propAccess => {
    if (propAccess.getExpression().getKind() === SyntaxKind.ThisKeyword) {
      const methodName = propAccess.getName();
      const owner = methodToOwner[methodName];
      
      if (owner && owner !== currentClassName) {
        if (owner === 'NavigationGraphService') {
            propAccess.replaceWithText(`this.facade.${methodName}`);
        } else {
            propAccess.replaceWithText(`this.facade.${ownerToProp[owner]}.${methodName}`);
        }
      }
    }
  });

  sourceFile.saveSync();
  console.log(`Patched ${currentClassName}`);
}
