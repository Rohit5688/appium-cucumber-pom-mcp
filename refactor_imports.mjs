import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

const serviceMap = {
  'AppiumSessionService': 'execution',
  'AuditLocatorService': 'audit',
  'BugReportService': 'collaboration',
  'CiWorkflowService': 'collaboration',
  'CodebaseAnalyzerService': 'analysis',
  'ContextManager': 'system',
  'CoverageAnalysisService': 'analysis',
  'CredentialService': 'config',
  'EnvironmentCheckService': 'setup',
  'ExecutionService': 'execution',
  'FewShotLibrary': 'generation',
  'FileStateService': 'io',
  'FileWriterService': 'io',
  'GeneratedCodeValidator': 'generation',
  'HybridPromptEngine': 'generation',
  'LearningService': 'collaboration',
  'McpConfigService': 'config',
  'MigrationService': 'test',
  'MobileSmartTreeService': 'execution',
  'NavigationGraphService': 'nav',
  'ObservabilityService': 'analysis',
  'OrchestrationService': 'system',
  'PreFlightService': 'setup',
  'ProjectMaintenanceService': 'setup',
  'ProjectSetupService': 'setup',
  'RefactoringService': 'test',
  'SandboxEngine': 'execution',
  'SelfHealingService': 'execution',
  'SessionManager': 'execution',
  'StructuralBrainService': 'analysis',
  'SummarySuiteService': 'analysis',
  'SystemStateService': 'system',
  'TestDataService': 'test',
  'TestGenerationService': 'generation',
  'TokenBudgetService': 'config',
  'UtilAuditService': 'audit'
};

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

function fixSpecifier(specifier, sourceFilePath) {
  let newSpecifier = specifier;
  
  // Rule 1: Services root to subfolder
  const serviceMatch = newSpecifier.match(/(\.\.?\/)+services\/([^\/]+\.js)/);
  if (serviceMatch) {
    const fileNameWithExt = serviceMatch[2];
    const fileName = fileNameWithExt.replace(/\.js$/, '');
    if (serviceMap[fileName]) {
      const folder = serviceMap[fileName];
      if (!newSpecifier.includes(`/services/${folder}/`)) {
        newSpecifier = newSpecifier.replace(`/services/${fileNameWithExt}`, `/services/${folder}/${fileNameWithExt}`);
      }
    }
  }
  
  // Rule 2: Files inside subfolders jumping to root utils/types
  if (sourceFilePath.includes('/services/') && !sourceFilePath.endsWith('Service.ts')) {
     const dir = path.dirname(sourceFilePath);
     const servicesDir = dir.split('/services/')[0] + '/services';
     const subDir = dir.split('/services/')[1];
     if (subDir && subDir.includes('/')) {
        // Deeply nested? Not standard yet, but handles just in case.
     } else if (subDir) {
        // We are exactly in src/services/XXXX
        if (newSpecifier.startsWith('../utils/') || newSpecifier.startsWith('../types/')) {
           // If it already has two levels, don't add more.
           if (!newSpecifier.startsWith('../../')) {
              newSpecifier = '../' + newSpecifier;
           }
        }
     }
  }
  
  return newSpecifier;
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  
  // Static Imports
  sourceFile.getImportDeclarations().forEach(imp => {
    imp.setModuleSpecifier(fixSpecifier(imp.getModuleSpecifierValue(), filePath));
  });

  // Dynamic Imports
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      const args = call.getArguments();
      if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
        const value = args[0].getLiteralValue();
        const newValue = fixSpecifier(value, filePath);
        if (newValue !== value) {
          args[0].replaceWithText(`'${newValue}'`);
        }
      }
    }
  });
}

project.saveSync();
console.log('Deep refactoring v2 complete.');
