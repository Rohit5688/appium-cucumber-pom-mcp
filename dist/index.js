import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProjectSetupService } from "./services/ProjectSetupService.js";
import { McpConfigService } from "./services/McpConfigService.js";
import { CodebaseAnalyzerService } from "./services/CodebaseAnalyzerService.js";
import { TestGenerationService } from "./services/TestGenerationService.js";
import { FileWriterService } from "./services/FileWriterService.js";
import { ExecutionService } from "./services/ExecutionService.js";
import { SelfHealingService } from "./services/SelfHealingService.js";
import { CredentialService } from "./services/CredentialService.js";
import { AuditLocatorService } from "./services/AuditLocatorService.js";
import { SummarySuiteService } from "./services/SummarySuiteService.js";
import { EnvironmentCheckService } from "./services/EnvironmentCheckService.js";
import { UtilAuditService } from "./services/UtilAuditService.js";
import { CiWorkflowService } from "./services/CiWorkflowService.js";
import { LearningService } from "./services/LearningService.js";
import { RefactoringService } from "./services/RefactoringService.js";
import { BugReportService } from "./services/BugReportService.js";
import { TestDataService } from "./services/TestDataService.js";
import { SessionManager } from "./services/SessionManager.js";
import { ProjectMaintenanceService } from "./services/ProjectMaintenanceService.js";
import { CoverageAnalysisService } from "./services/CoverageAnalysisService.js";
import { MigrationService } from "./services/MigrationService.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { APPFORGE_VERSION } from "./version.js";
import { Logger } from "./utils/Logger.js";
import { Metrics } from "./utils/Metrics.js";
// Tool registrars
import { registerSetupProject } from "./tools/setup_project.js";
import { registerUpgradeProject } from "./tools/upgrade_project.js";
import { registerRepairProject } from "./tools/repair_project.js";
import { registerManageConfig } from "./tools/manage_config.js";
import { registerInjectAppBuild } from "./tools/inject_app_build.js";
import { registerAnalyzeCodebase } from "./tools/analyze_codebase.js";
import { registerExecuteSandboxCode } from "./tools/execute_sandbox_code.js";
import { registerGenerateCucumberPom } from "./tools/generate_cucumber_pom.js";
import { registerAuditUtils } from "./tools/audit_utils.js";
import { registerValidateAndWrite } from "./tools/validate_and_write.js";
import { registerRunCucumberTest } from "./tools/run_cucumber_test.js";
import { registerInspectUiHierarchy } from "./tools/inspect_ui_hierarchy.js";
import { registerSelfHealTest } from "./tools/self_heal_test.js";
import { registerSetCredentials } from "./tools/set_credentials.js";
import { registerManageUsers } from "./tools/manage_users.js";
import { registerAuditMobileLocators } from "./tools/audit_mobile_locators.js";
import { registerSummarizeSuite } from "./tools/summarize_suite.js";
import { registerCheckEnvironment } from "./tools/check_environment.js";
import { registerGenerateCiWorkflow } from "./tools/generate_ci_workflow.js";
import { registerTrainOnExample } from "./tools/train_on_example.js";
import { registerExportTeamKnowledge } from "./tools/export_team_knowledge.js";
import { registerSuggestRefactorings } from "./tools/suggest_refactorings.js";
import { registerExportBugReport } from "./tools/export_bug_report.js";
import { registerGenerateTestDataFactory } from "./tools/generate_test_data_factory.js";
import { registerRequestUserClarification } from "./tools/request_user_clarification.js";
import { registerAnalyzeCoverage } from "./tools/analyze_coverage.js";
import { registerMigrateTest } from "./tools/migrate_test.js";
import { registerStartAppiumSession } from "./tools/start_appium_session.js";
import { registerEndAppiumSession } from "./tools/end_appium_session.js";
import { registerGetSessionHealth } from "./tools/get_session_health.js";
import { registerVerifySelector } from "./tools/verify_selector.js";
import { registerWorkflowGuide } from "./tools/workflow_guide.js";
import { registerExtractNavigationMap } from "./tools/extract_navigation_map.js";
import { registerExportNavigationMap } from "./tools/export_navigation_map.js";
import { registerGetTokenBudget } from "./tools/get_token_budget.js";
import { registerCheckAppiumReady } from './tools/check_appium_ready.js';
import { registerScanStructuralBrain } from './tools/scan_structural_brain.js';
import { TokenBudgetService } from "./services/TokenBudgetService.js";
import { ObservabilityService } from "./services/ObservabilityService.js";
import { StructuralBrainService } from "./services/StructuralBrainService.js";
// Initialize at startup (background scan)
StructuralBrainService.getInstance().scanProject().catch(() => {
    // Non-fatal — warnings just won't be available
});
/** Extract a safe summary (non-PII, size-limited) for logging */
function summarize(result) {
    if (!result)
        return {};
    return {
        isError: result.isError ?? false,
        contentLength: JSON.stringify(result).length,
        hasContent: Array.isArray(result.content) && result.content.length > 0,
    };
}
/**
 * AppForge — Mobile Automation MCP Server
 * Orchestrates Mobile Automation (Android/iOS) using WebdriverIO + Cucumber
 */
class AppForgeServer {
    server;
    projectSetupService = new ProjectSetupService();
    configService = new McpConfigService();
    analyzerService = new CodebaseAnalyzerService();
    generationService = new TestGenerationService();
    fileWriterService = new FileWriterService();
    executionService = new ExecutionService();
    selfHealingService = SelfHealingService.getInstance();
    credentialService = new CredentialService();
    auditLocatorService = new AuditLocatorService();
    summarySuiteService = new SummarySuiteService();
    environmentCheckService = new EnvironmentCheckService();
    utilAuditService = new UtilAuditService();
    ciWorkflowService = new CiWorkflowService();
    learningService = new LearningService();
    refactoringService = new RefactoringService();
    bugReportService = new BugReportService();
    testDataService = new TestDataService();
    sessionManager = SessionManager.getInstance();
    projectMaintenanceService = new ProjectMaintenanceService();
    coverageAnalysisService = new CoverageAnalysisService();
    migrationService = new MigrationService();
    // MEMORY LEAK FIX: Instance pooling for NavigationGraphService to prevent creating new instances per tool call
    navigationGraphServices = new Map();
    constructor() {
        this.server = new McpServer({ name: "AppForge", version: APPFORGE_VERSION });
        // Context & Token Tracking Wrapper
        const obs = ObservabilityService.getInstance();
        const originalRegisterTool = this.server.registerTool.bind(this.server);
        this.server.registerTool = (name, info, handler) => {
            const wrappedHandler = async (args, extraOptions) => {
                const startTime = Date.now();
                const traceId = obs.toolStart(name, args ?? {}, undefined);
                try {
                    const result = await handler(args, extraOptions);
                    const tokenService = TokenBudgetService.getInstance();
                    const inputText = JSON.stringify(args ?? '');
                    const outputText = JSON.stringify(result ?? '');
                    const usage = tokenService.trackToolCall(name, inputText, outputText);
                    if (usage.warning) {
                        if (Array.isArray(result?.content)) {
                            result.content.push({ type: 'text', text: `\n⚠️ ${usage.warning}` });
                        }
                    }
                    obs.toolEnd(traceId, name, true, summarize(result), startTime);
                    return result;
                }
                catch (err) {
                    obs.toolError(traceId, name, err, startTime);
                    throw err;
                }
            };
            return originalRegisterTool(name, info, wrappedHandler);
        };
        this.setupToolHandlers();
        Metrics.registerShutdownHook();
        this.server.server.onerror = (error) => Logger.error("[MCP Error]", { error: String(error) });
        // Inject live session manager into services that need it
        this.executionService.setSessionManager(this.sessionManager);
        this.selfHealingService.setSessionManager(this.sessionManager);
        this.selfHealingService.setLearningService(this.learningService);
    }
    setupToolHandlers() {
        registerSetupProject(this.server, this.projectSetupService, this.configService);
        registerUpgradeProject(this.server, this.projectMaintenanceService, this.configService);
        registerRepairProject(this.server, this.projectMaintenanceService);
        registerManageConfig(this.server, this.configService);
        registerInjectAppBuild(this.server, this.configService);
        registerAnalyzeCodebase(this.server, this.configService, this.analyzerService);
        registerExecuteSandboxCode(this.server, this.configService, this.analyzerService, this.executionService);
        registerGenerateCucumberPom(this.server, this.configService, this.analyzerService, this.generationService, this.learningService);
        registerAuditUtils(this.server, this.utilAuditService);
        registerValidateAndWrite(this.server, this.fileWriterService);
        registerRunCucumberTest(this.server, this.executionService);
        registerInspectUiHierarchy(this.server, this.executionService);
        registerSelfHealTest(this.server, this.selfHealingService, this.configService, this.sessionManager);
        registerSetCredentials(this.server, this.credentialService);
        registerManageUsers(this.server, this.credentialService);
        registerAuditMobileLocators(this.server, this.configService, this.auditLocatorService);
        registerSummarizeSuite(this.server, this.configService, this.summarySuiteService);
        registerCheckEnvironment(this.server, this.environmentCheckService);
        registerGenerateCiWorkflow(this.server, this.configService, this.ciWorkflowService);
        registerTrainOnExample(this.server, this.learningService);
        registerExportTeamKnowledge(this.server, this.learningService);
        registerSuggestRefactorings(this.server, this.configService, this.analyzerService, this.refactoringService);
        registerExportBugReport(this.server, this.bugReportService);
        registerGenerateTestDataFactory(this.server, this.testDataService);
        registerRequestUserClarification(this.server);
        registerAnalyzeCoverage(this.server, this.coverageAnalysisService);
        registerMigrateTest(this.server, this.migrationService);
        registerStartAppiumSession(this.server, this.sessionManager);
        registerEndAppiumSession(this.server, this.sessionManager);
        registerGetSessionHealth(this.server, this.sessionManager);
        registerVerifySelector(this.server, this.selfHealingService);
        registerWorkflowGuide(this.server);
        registerExtractNavigationMap(this.server, this.navigationGraphServices);
        registerExportNavigationMap(this.server, this.navigationGraphServices);
        registerGetTokenBudget(this.server);
        registerCheckAppiumReady(this.server);
        registerScanStructuralBrain(this.server);
    }
    async run() {
        const args = process.argv.slice(2);
        const transportFlag = args.findIndex(a => a === '--transport');
        const transportType = transportFlag !== -1 ? args[transportFlag + 1] : 'stdio';
        if (transportType === 'sse') {
            const portFlag = args.findIndex(a => a === '--port');
            const port = portFlag !== -1 ? parseInt(args[portFlag + 1] || '3100', 10) : 3100;
            const app = express();
            let sseTransport;
            app.get('/sse', async (req, res) => {
                sseTransport = new SSEServerTransport('/message', res);
                await this.server.connect(sseTransport);
            });
            app.post('/message', async (req, res) => {
                if (sseTransport) {
                    await sseTransport.handlePostMessage(req, res);
                }
                else {
                    res.status(500).send('SSE transport not connected');
                }
            });
            app.listen(port, () => {
                Logger.info("AppForge MCP Server started", { transport: "sse", version: APPFORGE_VERSION });
            });
        }
        else {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            Logger.info("AppForge MCP Server started", { transport: "stdio", version: APPFORGE_VERSION });
        }
    }
}
const server = new AppForgeServer();
server.run().catch((error) => Logger.error("Fatal startup error", { error: String(error) }));
