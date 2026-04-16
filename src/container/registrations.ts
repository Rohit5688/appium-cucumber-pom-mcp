/**
 * Service Registrations — Concern 1 + 4 Fix from docs/final/concerns.md.
 *
 * SINGLETON vs. INSTANCE RULE (Concern 4, Fix 2):
 * ─────────────────────────────────────────────────
 *  SINGLETONS  — services that hold state across tool calls
 *                → SessionManager, ObservabilityService, TokenBudgetService,
 *                  StructuralBrainService, ContextManager, FileStateService
 *                → Use getInstance() pattern; registered in the container as
 *                  singletons so resolve() always returns the same object.
 *
 *  FRESH INSTANCES — stateless services that transform inputs to outputs
 *                → CodebaseAnalyzerService, TestGenerationService,
 *                  RefactoringService, BugReportService, etc.
 *                → Constructed once per server startup (not per request),
 *                  registered as a lazy singleton in the container.
 *
 *  PER-PROJECT INSTANCES — services that scope state to a projectRoot
 *                → NavigationGraphService (Map<projectRoot, instance>)
 *                → Not registered here; managed via a Map in AppForgeServer.
 *
 * Adding a Phase 4 service is one container.register() call below.
 * Initialization order is enforced by the container, not by declaration order.
 */

import { container } from './ServiceContainer.js';
import { ProjectSetupService } from '../services/ProjectSetupService.js';
import { McpConfigService } from '../services/McpConfigService.js';
import { CodebaseAnalyzerService } from '../services/CodebaseAnalyzerService.js';
import { TestGenerationService } from '../services/TestGenerationService.js';
import { FileWriterService } from '../services/FileWriterService.js';
import { ExecutionService } from '../services/ExecutionService.js';
import { SelfHealingService } from '../services/SelfHealingService.js';
import { CredentialService } from '../services/CredentialService.js';
import { AuditLocatorService } from '../services/AuditLocatorService.js';
import { SummarySuiteService } from '../services/SummarySuiteService.js';
import { EnvironmentCheckService } from '../services/EnvironmentCheckService.js';
import { UtilAuditService } from '../services/UtilAuditService.js';
import { CiWorkflowService } from '../services/CiWorkflowService.js';
import { LearningService } from '../services/LearningService.js';
import { RefactoringService } from '../services/RefactoringService.js';
import { BugReportService } from '../services/BugReportService.js';
import { TestDataService } from '../services/TestDataService.js';
import { SessionManager } from '../services/SessionManager.js';
import { ProjectMaintenanceService } from '../services/ProjectMaintenanceService.js';
import { CoverageAnalysisService } from '../services/CoverageAnalysisService.js';
import { MigrationService } from '../services/MigrationService.js';
import { OrchestrationService } from '../services/OrchestrationService.js';

// ── Stateful Singletons ────────────────────────────────────────────────────────
// These hold cross-tool-call state. Always resolved from getInstance().

container.register('session', () => SessionManager.getInstance());

// ── Fresh Instances (stateless) ────────────────────────────────────────────────
// Constructed once per server startup; container caches them as lazy singletons.

container.register('config',       () => new McpConfigService());
container.register('analyzer',     () => new CodebaseAnalyzerService());
container.register('generation',   () => new TestGenerationService());
container.register('fileWriter',   () => new FileWriterService());
container.register('credential',   () => new CredentialService());
container.register('auditLocator', () => new AuditLocatorService());
container.register('summarySuite', () => new SummarySuiteService());
container.register('envCheck',     () => new EnvironmentCheckService());
container.register('utilAudit',    () => new UtilAuditService());
container.register('ciWorkflow',   () => new CiWorkflowService());
container.register('learning',     () => new LearningService());
container.register('refactoring',  () => new RefactoringService());
container.register('bugReport',    () => new BugReportService());
container.register('testData',     () => new TestDataService());
container.register('projectSetup', () => new ProjectSetupService());
container.register('projectMaint', () => new ProjectMaintenanceService());
container.register('coverage',     () => new CoverageAnalysisService());
container.register('migration',    () => new MigrationService());

// ── Services with injected dependencies ────────────────────────────────────────
// Deps are resolved lazily; container enforces correct construction order.

container.register('execution', () =>
  new ExecutionService(
    container.resolve('session')   // removes nullable sessionManager field
  )
);

container.register('healing', () =>
  SelfHealingService.getInstance(
    container.resolve('session'),  // removes nullable sessionManager field
    container.resolve('learning')  // removes nullable learningService field
  )
);

container.register('orchestration', () =>
  new OrchestrationService(
    container.resolve('generation'),
    container.resolve('fileWriter'),
    container.resolve('healing'),
    container.resolve('session'),  // SessionManager satisfies ISessionVerifier
    container.resolve('learning'),
    container.resolve('config'),
    container.resolve('analyzer'),
  )
);
