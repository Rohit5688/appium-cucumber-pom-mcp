import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const servicesDir = path.join(__dirname, 'src', 'services');

const serviceToDomain = {
    'ProjectSetupService': 'setup',
    'McpConfigService': 'config',
    'CodebaseAnalyzerService': 'analysis',
    'TestGenerationService': 'generation',
    'FileWriterService': 'io',
    'ExecutionService': 'execution',
    'SelfHealingService': 'execution',
    'CredentialService': 'config',
    'AuditLocatorService': 'audit',
    'SummarySuiteService': 'analysis',
    'EnvironmentCheckService': 'setup',
    'UtilAuditService': 'audit',
    'CiWorkflowService': 'collaboration',
    'LearningService': 'collaboration',
    'RefactoringService': 'test',
    'BugReportService': 'collaboration',
    'TestDataService': 'test',
    'SessionManager': 'execution',
    'ProjectMaintenanceService': 'setup',
    'CoverageAnalysisService': 'analysis',
    'MigrationService': 'test',
    'OrchestrationService': 'system',
    'MobileSmartTreeService': 'execution',
    'ObservabilityService': 'analysis',
    'TokenBudgetService': 'config',
    'StructuralBrainService': 'analysis',
    'ContextManager': 'system',
    'FileStateService': 'io',
    'NavigationGraphService': 'nav',
    'ProjectScaffolder': 'setup',
    'ConfigTemplateManager': 'setup',
    'DocScaffolder': 'setup',
    'TestScaffolder': 'setup',
    'UtilTemplateWriter': 'setup',
    'WdioConfigBuilder': 'setup',
    'SharedNavState': 'nav',
    'XmlElementParser': 'nav',
    'GraphPathFinder': 'nav',
    'StaticRouteAnalyzer': 'nav',
    'GraphPersistence': 'nav'
};

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;

            for (const [service, domain] of Object.entries(serviceToDomain)) {
                const oldImport = `'../${service}.js'`;
                const newImport = `'../${domain}/${service}.js'`;
                if (content.includes(oldImport)) {
                    content = content.replaceAll(oldImport, newImport);
                    changed = true;
                }
                const oldImportSub = `"../${service}.js"`;
                const newImportSub = `"../${domain}/${service}.js"`;
                if (content.includes(oldImportSub)) {
                    content = content.replaceAll(oldImportSub, newImportSub);
                    changed = true;
                }
            }

            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated imports in ${fullPath}`);
            }
        }
    }
}

walk(servicesDir);
