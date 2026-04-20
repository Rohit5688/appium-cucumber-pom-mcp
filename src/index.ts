
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { APPFORGE_VERSION } from "./version.js";
import { Logger } from "./utils/Logger.js";
import { Metrics } from "./utils/Metrics.js";
import { TokenBudgetService } from "./services/config/TokenBudgetService.js";
import { ObservabilityService } from "./services/analysis/ObservabilityService.js";
import { StructuralBrainService } from "./services/analysis/StructuralBrainService.js";

// ServiceContainer — resolves all services with correct dep injection (Concern 1)
import "./container/registrations.js"; // side-effect: registers all factories
import { container } from "./container/ServiceContainer.js";
import type { McpConfigService } from "./services/config/McpConfigService.js";
import type { CodebaseAnalyzerService } from "./services/analysis/CodebaseAnalyzerService.js";
import type { TestGenerationService } from "./services/generation/TestGenerationService.js";
import type { FileWriterService } from "./services/io/FileWriterService.js";
import type { ExecutionService } from "./services/execution/ExecutionService.js";
import type { SelfHealingService } from "./services/execution/SelfHealingService.js";
import type { CredentialService } from "./services/config/CredentialService.js";
import type { AuditLocatorService } from "./services/audit/AuditLocatorService.js";
import type { SummarySuiteService } from "./services/analysis/SummarySuiteService.js";
import type { EnvironmentCheckService } from "./services/setup/EnvironmentCheckService.js";
import type { UtilAuditService } from "./services/audit/UtilAuditService.js";
import type { CiWorkflowService } from "./services/collaboration/CiWorkflowService.js";
import type { LearningService } from "./services/collaboration/LearningService.js";
import type { RefactoringService } from "./services/test/RefactoringService.js";
import type { BugReportService } from "./services/collaboration/BugReportService.js";
import type { TestDataService } from "./services/test/TestDataService.js";
import type { SessionManager } from "./services/execution/SessionManager.js";
import type { ProjectMaintenanceService } from "./services/setup/ProjectMaintenanceService.js";
import type { CoverageAnalysisService } from "./services/analysis/CoverageAnalysisService.js";
import type { MigrationService } from "./services/test/MigrationService.js";
import type { OrchestrationService } from "./services/system/OrchestrationService.js";
import type { ProjectSetupService } from "./services/setup/ProjectSetupService.js";
import { NavigationGraphService } from "./services/nav/NavigationGraphService.js";

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
import { registerCheckTestStatus } from "./tools/check_test_status.js";
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
import { registerCreateTestAtomically } from './tools/create_test_atomically.js';
import { registerHealAndVerifyAtomically } from './tools/heal_and_verify_atomically.js';

// Initialize at startup (background scan)
StructuralBrainService.getInstance().scanProject().catch(() => {
  // Non-fatal — warnings just won't be available
});

/** Extract a safe summary (non-PII, size-limited) for logging */
function summarize(result: any): Record<string, any> {
  if (!result) return {};
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
  private server: McpServer;

  // All services resolved from the ServiceContainer (Concern 1 fix).
  // Construction order and dependency injection are handled by registrations.ts.
  private readonly projectSetupService    = container.resolve<ProjectSetupService>('projectSetup');
  private readonly configService          = container.resolve<McpConfigService>('config');
  private readonly analyzerService        = container.resolve<CodebaseAnalyzerService>('analyzer');
  private readonly generationService      = container.resolve<TestGenerationService>('generation');
  private readonly fileWriterService      = container.resolve<FileWriterService>('fileWriter');
  private readonly executionService       = container.resolve<ExecutionService>('execution');
  private readonly selfHealingService     = container.resolve<SelfHealingService>('healing');
  private readonly credentialService      = container.resolve<CredentialService>('credential');
  private readonly auditLocatorService    = container.resolve<AuditLocatorService>('auditLocator');
  private readonly summarySuiteService    = container.resolve<SummarySuiteService>('summarySuite');
  private readonly environmentCheckService = container.resolve<EnvironmentCheckService>('envCheck');
  private readonly utilAuditService       = container.resolve<UtilAuditService>('utilAudit');
  private readonly ciWorkflowService      = container.resolve<CiWorkflowService>('ciWorkflow');
  private readonly learningService        = container.resolve<LearningService>('learning');
  private readonly refactoringService     = container.resolve<RefactoringService>('refactoring');
  private readonly bugReportService       = container.resolve<BugReportService>('bugReport');
  private readonly testDataService        = container.resolve<TestDataService>('testData');
  private readonly sessionManager         = container.resolve<SessionManager>('session');
  private readonly projectMaintenanceService = container.resolve<ProjectMaintenanceService>('projectMaint');
  private readonly coverageAnalysisService = container.resolve<CoverageAnalysisService>('coverage');
  private readonly migrationService       = container.resolve<MigrationService>('migration');
  private readonly orchestrationService   = container.resolve<OrchestrationService>('orchestration');

  // MEMORY LEAK FIX: Per-project pool — not in container (per-project, not global singleton)
  private readonly navigationGraphServices = new Map<string, NavigationGraphService>();

  // Activity pulse tracker (nanotools idle detection)
  private readonly activityTimestamps = new Map<string, number>();
  private static readonly IDLE_PULSE_MS = 600_000; // 10 minutes

  constructor() {
    this.server = new McpServer(
      { name: "AppForge", version: APPFORGE_VERSION }
    );

    // Context & Token Tracking Wrapper
    const obs = ObservabilityService.getInstance();
    const originalRegisterTool = this.server.registerTool.bind(this.server);
    (this.server as any).registerTool = (name: string, info: any, handler: any) => {
      const wrappedHandler = async (args: any, extraOptions?: any) => {
        const startTime = Date.now();
        const traceId = obs.toolStart(name, args ?? {}, undefined);
        
        // Update activity pulse
        this.activityTimestamps.set(name, startTime);
        const lastPulse = Array.from(this.activityTimestamps.values()).sort((a, b) => b - a)[0];
        
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
        } catch (err) {
          obs.toolError(traceId, name, err, startTime);
          throw err;
        }
      };
      return originalRegisterTool(name, info, wrappedHandler);
    };

    this.setupToolHandlers();
    Metrics.registerShutdownHook();
    this.server.server.onerror = (error) => Logger.error("[MCP Error]", { error: String(error) });
    // Deps injected via ServiceContainer — no late set* calls needed
  }

  private setupToolHandlers() {
    registerSetupProject(this.server, this.projectSetupService, this.configService);
    registerUpgradeProject(this.server, this.projectMaintenanceService, this.configService);
    registerRepairProject(this.server, this.projectMaintenanceService);
    registerManageConfig(this.server, this.configService, this.credentialService);
    registerInjectAppBuild(this.server, this.configService);
    registerAnalyzeCodebase(this.server, this.configService, this.analyzerService);
    registerExecuteSandboxCode(this.server, this.configService, this.analyzerService, this.executionService);
    registerGenerateCucumberPom(this.server, this.configService, this.analyzerService, this.generationService, this.learningService);
    registerAuditUtils(this.server, this.utilAuditService);
    registerValidateAndWrite(this.server, this.fileWriterService);
    registerRunCucumberTest(this.server, this.executionService);
    registerCheckTestStatus(this.server, this.executionService);
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
    
    // Orchestrator tools (atomic multi-step operations)
    registerCreateTestAtomically(this.server, this.orchestrationService);
    registerHealAndVerifyAtomically(this.server, this.orchestrationService);
  }

  async run() {
    const args = process.argv.slice(2);
    const transportFlag = args.findIndex(a => a === '--transport');
    const transportType = transportFlag !== -1 ? args[transportFlag + 1] : 'stdio';

    if (transportType === 'sse' || transportType === 'http') {
      const portFlag = args.findIndex(a => a === '--port');
      const port = portFlag !== -1 ? parseInt(args[portFlag + 1] || '3100', 10) : 3100;

      const app = express();
      app.use(express.json());

      app.post('/mcp', async (req, res) => {
        // Stateless: fresh transport per request (replaces deprecated SSEServerTransport)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode
        });
        res.on('close', () => {
          transport.close();
        });
        await this.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });

      app.listen(port, () => {
        Logger.info("AppForge MCP Server started", { transport: "streamable-http", version: APPFORGE_VERSION });
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      Logger.info("AppForge MCP Server started", { transport: "stdio", version: APPFORGE_VERSION });
    }
  }
}

const server = new AppForgeServer();
server.run().catch((error) => Logger.error("Fatal startup error", { error: String(error) }));
