import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
import { ClarificationRequired, Questioner } from "./utils/Questioner.js";
import { AppForgeError } from "./utils/ErrorCodes.js";
import { validateProjectRoot } from "./utils/SecurityUtils.js";
import { LearningService } from "./services/LearningService.js";
import { RefactoringService } from "./services/RefactoringService.js";
import { BugReportService } from "./services/BugReportService.js";
import { TestDataService } from "./services/TestDataService.js";
import { AppiumSessionService } from "./services/AppiumSessionService.js";
import { SessionManager } from "./services/SessionManager.js";
import { ProjectMaintenanceService } from "./services/ProjectMaintenanceService.js";
import { CoverageAnalysisService } from "./services/CoverageAnalysisService.js";
import { MigrationService } from "./services/MigrationService.js";
import { NavigationGraphService } from "./services/NavigationGraphService.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { executeSandbox } from "./services/SandboxEngine.js";
import type { SandboxApiRegistry } from "./services/SandboxEngine.js";

/**
 * AppForge — Mobile Automation MCP Server
 * Orchestrates Mobile Automation (Android/iOS) using WebdriverIO + Cucumber
 */
class AppForgeServer {
  private server: Server;
  private projectSetupService = new ProjectSetupService();
  private configService = new McpConfigService();
  private analyzerService = new CodebaseAnalyzerService();
  private generationService = new TestGenerationService();
  private fileWriterService = new FileWriterService();
  private executionService = new ExecutionService();
  private selfHealingService = new SelfHealingService();
  private credentialService = new CredentialService();
  private auditLocatorService = new AuditLocatorService();
  private summarySuiteService = new SummarySuiteService();
  private environmentCheckService = new EnvironmentCheckService();
  private utilAuditService = new UtilAuditService();
  private ciWorkflowService = new CiWorkflowService();
  private learningService = new LearningService();
  private refactoringService = new RefactoringService();
  private bugReportService = new BugReportService();
  private testDataService = new TestDataService();
  private appiumSessionService = new AppiumSessionService();
  private projectMaintenanceService = new ProjectMaintenanceService();
  private coverageAnalysisService = new CoverageAnalysisService();
  private migrationService = new MigrationService();
  // MEMORY LEAK FIX: Instance pooling for NavigationGraphService to prevent creating new instances per tool call
  private navigationGraphServices = new Map<string, NavigationGraphService>();

  constructor() {
    this.server = new Server(
      { name: "AppForge", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.setupToolHandlers();
    this.server.onerror = (error) => console.error("[MCP Error]", error);

    // Inject live session service into services that need it
    this.executionService.setSessionService(this.appiumSessionService);
    this.selfHealingService.setSessionService(this.appiumSessionService);
    this.selfHealingService.setLearningService(this.learningService);
  }

  private setupToolHandlers() {
    // ─── Tool Discovery ──────────────────────────────────
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "setup_project",
          description: `FIRST-TIME SETUP & INCREMENTAL SCAFFOLD. Sets up a new or partially-configured project.

PHASE 1 (first call — no mcp-config.json exists):
  → Creates a self-documenting mcp-config.json template with ALL fields and explanations
  → Returns instructions to fill in what you know (not everything is required immediately)
  → Call setup_project again when ready to scaffold files

PHASE 2 (second call — mcp-config.json exists):
  → Reads your config and scaffolds project files based on YOUR choices
  → Skips optional sections where config still has CONFIGURE_ME (warns you)
  → Returns list of remaining unconfigured fields

You do NOT need all answers upfront. Add config fields over time and run upgrade_project to apply new scaffolding.

📖 Full config guide: docs/MCP_CONFIG_REFERENCE.md (created in Phase 1)

Returns: { phase, status, filesCreated?, unfilledOptionalFields?, nextSteps[] }`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              platform: { type: "string", enum: ["android", "ios", "both"] },
              appName: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "upgrade_project",
          description: `UPGRADE & SYNC PROJECT. Run this any time after updating mcp-config.json to apply new settings.

What it does:
  1. Reads your current mcp-config.json
  2. Reports any fields still set to CONFIGURE_ME (pending setup)
  3. Applies scaffolding for newly configured features:
     • credentials.strategy set → creates credentials/ scaffold + gitignore entry
     • reporting.format = "allure" → patches wdio.conf.ts reporters
     • customWrapperPackage set → warns if AppForge-generated BasePage.ts conflicts
     • New optional config fields added → scaffolds what's missing
  4. Repairs any missing baseline files (safe, never overwrites custom code)

Run upgrade_project after:
  → Adding environments / currentEnvironment to config
  → Setting credentials.strategy for the first time
  → Changing reporting.format
  → Adding customWrapperPackage
  → Any manage_config write that should affect generated files

Returns: { status, applied[], skipped[], pending[], message }`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "repair_project",
          description: `REPAIR MISSING FILES. Regenerates ONLY missing baseline files — never overwrites custom code. Safe to run at any time.

For config-aware upgrades (applying new mcp-config.json settings to generated files), use upgrade_project instead.
repair_project focuses on file completeness; upgrade_project focuses on config-driven changes.

Returns: list of files regenerated.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              platform: { type: "string", enum: ["android", "ios", "both"], description: "Platform hint used when regenerating mcp-config.json. Defaults to android." }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "manage_config",
          description: "READ OR UPDATE PROJECT CONFIG. Use when the user wants to check or change Appium capabilities, device settings, app paths, or cloud provider. 'read' returns the full mcp-config.json. 'write' does a partial merge — only keys you provide are updated, all others are preserved. Returns: current config on read, updated confirmation on write.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              operation: { type: "string", enum: ["read", "write"] },
              config: { type: "object", description: "For 'write': partial config to merge. Only provided keys are updated. Example: { mobile: { capabilitiesProfiles: { myProfile: { 'appium:deviceName': 'Pixel 6' } } } }" }
            },
            required: ["projectRoot", "operation"]
          }
        },
        {
          name: "inject_app_build",
          description: "UPDATE APP FILE PATH. Use after a new build or when pointing to a different .apk/.ipa/.app file. Updates the app path in mcp-config.json for the specified platform. Set forceWrite: true for CI paths where the file does not exist locally yet. Returns: confirmation with the new path. Next: use start_appium_session to test the new build.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              platform: { type: "string", enum: ["android", "ios"] },
              appPath: { type: "string" },
              forceWrite: { type: "boolean", description: "If true, saves the path even if it does not exist locally (useful for CI paths)." }
            },
            required: ["projectRoot", "platform", "appPath"]
          }
        },
        {
          name: "analyze_codebase",
          description: "⚠️ TOKEN-INTENSIVE — ONLY FOR TINY PROJECTS (<5 files). Reads every source file to extract existing steps, page objects, and utilities for reuse in code generation. For ANY real project, use execute_sandbox_code (Turbo Mode) instead — it uses 98% fewer tokens and returns only the data you request. Returns: { existingSteps[], existingPageObjects[], existingUtils[] }.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "execute_sandbox_code",
          description: "🚀 TURBO MODE — USE FOR ALL PROJECT ANALYSIS. Runs a JavaScript snippet in a secure V8 sandbox without reading entire files. Always prefer this over analyze_codebase for real projects. Available APIs: forge.api.analyzeCodebase(projectRoot) → existing steps/pages/utils; forge.api.runTests(projectRoot) → runs tests; forge.api.readFile({ filePath, projectRoot }) → reads one file (path must be inside projectRoot); forge.api.getConfig(projectRoot) → config object. Use `return <value>` in your script. Tip: answer questions like 'do I already have a LoginPage?' before generating new code.",
          inputSchema: {
            type: "object",
            properties: {
              script: { type: "string", description: "JavaScript to execute. Use `return` to send results back. Example: `const c = await forge.api.analyzeCodebase('/path'); return c.existingSteps.filter(s => s.text.includes('login'));`" },
              timeoutMs: { type: "number", description: "Optional execution timeout in milliseconds. Default: 10000 (10s)." }
            },
            required: ["script"]
          }
        },
        {
          name: "generate_cucumber_pom",
          description: "WRITE A NEW TEST. Use when the user asks to 'write a test / create a scenario / add automation for X'. Returns a generation PROMPT pre-loaded with your project's existing steps, page objects, and architecture pattern — YOU act on this prompt to produce the actual .feature, step .ts, and Page Object .ts files. Does NOT write files itself. After generating, call validate_and_write to save. Provide screenXml and screenshotBase64 from a live session for highest locator accuracy. Returns: generation prompt text. Code generation behavior (BasePage strategy, naming convention, tag taxonomy, file scope, custom wrapper package) is fully controlled by the \"codegen\" section of mcp-config.json. Run manage_config to set preferences before generating.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              testDescription: { type: "string" },
              testName: { type: "string" },
              screenXml: { type: "string" },
              screenshotBase64: { type: "string" }
            },
            required: ["projectRoot", "testDescription"]
          }
        },
        {
          name: "audit_utils",
          description: "CHECK UTILITY COVERAGE. Use when the user asks 'what helpers are missing / check my utilities / what Appium methods are not wrapped'. Scans for implementations of essential Appium wrappers (tap, swipe, scroll, waitForElement, etc.) and reports gaps. Returns: { coveragePercent, missing[]: unwrapped APIs, actionableSuggestions[]: where and how to add them }.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              customWrapperPackage: { type: "string", description: "Optional package name for a shared helper lib (e.g. '@myorg/appium-base'). Methods from this package are counted as present and not flagged as missing." }
            },
            required: ["projectRoot"]
          }
        },

        {
          name: "validate_and_write",
          description: "SAVE FILES TO DISK. Use after generate_cucumber_pom to write the generated test code. Validates TypeScript syntax (tsc --noEmit) and Gherkin syntax first — returns errors instead of writing if validation fails. Use dryRun: true to preview validation without writing. Always call this instead of writing files manually. Returns: validation result and list of written files.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              files: {
                type: "array",
                items: {
                  type: "object",
                  properties: { path: { type: "string" }, content: { type: "string" } },
                  required: ["path", "content"]
                }
              },
              dryRun: { type: "boolean", description: "If true, validates code without writing to disk." }
            },
            required: ["projectRoot", "files"]
          }
        },
        {
          name: "run_cucumber_test",
          description: "RUN TESTS. Use when the user says 'run my tests / execute / run @smoke'. Executes the Appium Cucumber suite. Auto-detects execution command from mcp-config.json — falls back to npx wdio run wdio.conf.ts if not configured. Supports Cucumber tag expressions and platform filtering. Timeout resolution: explicit timeoutMs > mcp-config.json execution.timeoutMs > detected from wdio.conf > default (30 min). Returns: { success, output, stats: { total, passed, failed, skipped }, reportPath }. If tests fail, pass the output to self_heal_test to fix broken locators.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              tags: { type: "string", description: "Cucumber tag expression, e.g. '@smoke and @android'" },
              platform: { type: "string", enum: ["android", "ios"] },
              specificArgs: { type: "string" },
              overrideCommand: { type: "string", description: "Full custom execution command (e.g. 'npm run test'). Bypasses mcp-config.json executionCommand." },
              timeoutMs: { type: "number", description: "Optional execution timeout in milliseconds. Overrides all other timeout sources. Maximum: 2 hours (7200000ms)." }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "inspect_ui_hierarchy",
          description: `SEE WHAT'S ON SCREEN. Returns a compact Mobile Accessibility Snapshot of interactive elements.
⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. Exception: pass xmlDump for offline parsing.

🚫 DO NOT CALL if the screen's Page Object already exists in the project.
   → Check existingPageObjects from execute_sandbox_code first.
   → If the screen exists → use its locators directly. Skip this call entirely.
✅ ONLY CALL for screens with NO existing Page Object (new screens you are building).
✅ CALL with stepHints=[...your step strings] to get snapshot filtered to relevant elements only.

Returns: { snapshot: compact plain-text element list with #ref IDs and best locators, elementCount: { total, interactive }, source, timestamp }
Use #ref numbers and locators from snapshot to build Page Object selectors.
The snapshot shows: role, visible label, best locator strategy, interaction states.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string", description: "Optional: Project root path. Auto-detected from active session if omitted." },
              xmlDump: { type: "string", description: "Optional: Appium XML page source. When omitted, live XML is fetched automatically from the active session." },
              screenshotBase64: { type: "string" },
              stepHints: {
                type: "array",
                items: { type: "string" },
                description: "Array of step strings the user described (e.g. ['Tap Login button', 'Enter username']). The tool extracts keywords and returns only matched elements. Reduces tokens by 80–95% vs full snapshot. Use when you know which steps need locators."
              }
            },
            required: []
          }
        },
        {
          name: "self_heal_test",
          description: `FIX BROKEN TESTS. Use when a test failure says 'element not found / no such element'.
Parses the error and current screen to find the correct replacement selector.

xmlHierarchy is now OPTIONAL — if omitted, uses the cached XML from the last inspect_ui_hierarchy call.
This solves the chicken-and-egg problem where the session dies when the test fails.

Returns: { candidates[]: [{ selector, strategy, confidence, rationale }] }
After getting candidates, update your Page Object with the best selector.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string", description: "Optional: Project root path. Auto-detected from active session if omitted." },
              testOutput: { type: "string" },
              xmlHierarchy: { type: "string" },
              screenshotBase64: { type: "string" },
              attempt: { type: "number" }
            },
            required: ["testOutput"]
          }
        },
        {
          name: "set_credentials",
          description: `SAVE NON-SECRET ENV CONFIG. Writes non-sensitive configuration values (Base URLs, feature flags, timeouts, endpoint paths) to the project .env file. 

⚠️ THIS TOOL IS NOT FOR PASSWORDS OR API SECRETS.
Do NOT use this tool for: usernames, passwords, tokens, API keys, client secrets.

For credentials (login users, API tokens), use manage_users which stores them in a gitignored credentials/ JSON file.

Non-secret examples that belong here:
  BASE_URL=https://staging.example.com
  API_TIMEOUT=30000
  FEATURE_FLAGS_ENABLED=true
  MOCK_SERVER_PORT=3001

Returns: confirmation with the .env file path updated.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              credentials: { type: "object", additionalProperties: { type: "string" } }
            },
            required: ["projectRoot", "credentials"]
          }
        },
        {
          name: "manage_users",
          description: `MANAGE TEST CREDENTIALS. Use when the user wants to store or retrieve test user credentials (usernames/passwords) for different environments.

Credentials are stored in a gitignored credentials/ JSON file — NEVER in .env.
The file schema is user-defined (not hardcoded). On first call, returns schema options for the user to choose.

On first use: returns 4 schema options → user picks one → call manage_config to save strategy → call manage_users again to create the file.

After strategy is set:
  operation="write" + users=[...] → creates/updates the credential file for currentEnvironment
  operation="read" → returns current credential file contents

The getCredentials() TypeScript reader is generated by generate_cucumber_pom — not by this tool.

Returns: strategy selection options (first call) OR file content (read) OR write confirmation.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              operation: { type: "string", enum: ["read", "write"] },
              env: {
                type: "string",
                description: "Target environment (e.g. 'staging', 'local', 'prod'). If omitted, uses currentEnvironment from mcp-config.json. Valid values are in the 'environments' array of mcp-config.json."
              },
              users: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    role: { type: "string" }
                  },
                  required: ["username", "password"]
                }
              }
            },
            required: ["projectRoot", "operation"]
          }
        },
        {
          name: "audit_mobile_locators",
          description: "LOCATOR HEALTH CHECK. Use when the user says 'check my locators / are my selectors stable / too many XPaths'. Scans Page Objects and YAML locator files. Flags XPath (❌ brittle), CSS class/ID (⚠️ fragile), accessibility-id (✅ stable). Returns a health report with per-file breakdown, health score percentage, and specific lines to fix. Brittle XPath locators are the #1 cause of flaky mobile tests.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "summarize_suite",
          description: "TEST RUN SUMMARY. Use after run_cucumber_test or when the user asks 'what were the test results / how many passed'. Parses the Cucumber JSON report. Returns: { summary: Markdown report, totalScenarios, passed, failed, skipped, duration, failingScenarios[]: [{ name, error }] }. The failingScenarios list tells you exactly which tests to investigate and fix.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              reportFile: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "check_environment",
          description: "PRE-FLIGHT CHECK. Use when the user says 'is my environment ready / why isn’t Appium connecting / tests won’t start / check my setup'. Verifies the entire Appium stack: Node.js, Appium server, drivers, Android SDK, Xcode, connected device/emulator, app binary, node_modules, and mcp-config.json. Returns: { summary: full report, ready: boolean, failCount, warnCount }. Run this FIRST when tests fail for unknown reasons.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              platform: { type: "string", enum: ["android", "ios", "both"] },
              appPath: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "generate_ci_workflow",
          description: "SET UP CI/CD PIPELINE. Use when the user says 'add GitHub Actions / create a CI pipeline / automate my test runs'. Generates a pre-configured workflow file for GitHub Actions or GitLab CI — reads deviceName, execution command, and report path from mcp-config.json automatically. Writes the file to .github/workflows/ or gitlab-ci.yml. Returns: file path and workflow content.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              provider: { type: "string", enum: ["github", "gitlab"] },
              platform: { type: "string", enum: ["android", "ios"] },
              nodeVersion: { type: "string" },
              appiumVersion: { type: "string" }
            },
            required: ["projectRoot", "provider"]
          }
        },
        {
          name: "train_on_example",
          description: "TEACH A PROJECT RULE. Use when a generation was wrong and you know the correct pattern, or after fixing a broken selector. Saves the rule to .AppForge/mcp-learning.json. All future generate_cucumber_pom calls will incorporate it. Call this after every successful self-heal to prevent the same selector from breaking again. Returns: confirmation with the rule ID.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              issuePattern: { type: "string", description: "The error or pattern to learn from." },
              solution: { type: "string", description: "The correct fix or approach." },
              tags: { type: "array", items: { type: "string" } }
            },
            required: ["projectRoot", "issuePattern", "solution"]
          }
        },
        {
          name: "export_team_knowledge",
          description: "EXPORT LEARNED RULES. Generates a human-readable Markdown table of all rules taught via train_on_example. Use to review what the AI knows about your project, onboard new team members, or audit the knowledge base. Returns: Markdown document with all learned rules.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "suggest_refactorings",
          description: "FIND CODE QUALITY ISSUES. Use when the user says 'clean up my test code / check for duplicate steps / is my code DRY'. Finds duplicate step definitions (cause Cucumber compile errors), potentially unused Page Object methods, and XPath over-usage percentage. Returns: { report: Markdown, duplicateStepCount, unusedMethodCount, xpathOverusePercent }. ⚠️ Unused method detection has high false-positive risk — verify manually before deleting code.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "export_bug_report",
          description: "GENERATE JIRA BUG REPORT. Use when a failed test needs to be tracked in a ticket. Formats the test failure into a Jira-ready report with auto-classified severity (Critical/High/Medium/Low), reproduction steps, environment details, and suggested fix. Returns: Markdown ready to paste into Jira or any issue tracker.",
          inputSchema: {
            type: "object",
            properties: {
              testName: { type: "string" },
              rawError: { type: "string" },
              platform: { type: "string" },
              deviceName: { type: "string" },
              appVersion: { type: "string" }
            },
            required: ["testName", "rawError"]
          }
        },
        {
          name: "generate_test_data_factory",
          description: "CREATE FAKE TEST DATA. Use when tests need realistic randomized data (users, products, orders) or the user says 'generate test data / mock data / create a data factory'. Returns a generation prompt to create a typed Faker.js factory. YOU act on the prompt to produce the factory file. Returns: generation prompt text.",
          inputSchema: {
            type: "object",
            properties: {
              entityName: { type: "string", description: "Name of the entity (e.g. 'User', 'Product')." },
              schemaDefinition: { type: "string", description: "Schema description or TypeScript interface." }
            },
            required: ["entityName", "schemaDefinition"]
          }
        },
        {
          name: "request_user_clarification",
          description: "ASK THE USER A QUESTION. Use ONLY when you cannot proceed and no reasonable assumption is possible. This halts the workflow and presents the question to the user. PREFER making a sensible default assumption and logging a warning over stopping. NEVER call this in a loop — if the user already answered, proceed with their answer. Returns: the question displayed to the user.",
          inputSchema: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              context: { type: "string" }
            },
            required: ["question", "context"]
          }
        },
        {
          name: "analyze_coverage",
          description: "FIND MISSING TEST COVERAGE. Use when the user says 'what screens are not tested / find coverage gaps / what scenarios am I missing'. Parses .feature files to identify untested screens, missing accessibility scenarios, and absent negative test cases. Returns: { report: coverage data, prompt: suggestions for new tests to write with generate_cucumber_pom }.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              featureFilesPaths: { type: "array", items: { type: "string" } }
            },
            required: ["projectRoot", "featureFilesPaths"]
          }
        },
        {
          name: "migrate_test",
          description: "CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping. YOU act on the prompt to produce the migrated files. Returns: migration prompt text.",
          inputSchema: {
            type: "object",
            properties: {
              sourceCode: { type: "string" },
              sourceFileName: { type: "string" },
              sourceFramework: { type: "string", enum: ["espresso", "xcuitest", "detox"] },
              sourceLanguage: { type: "string", enum: ["java", "swift", "javascript"] }
            },
            required: ["sourceCode", "sourceFileName", "sourceFramework", "sourceLanguage"]
          }
        },
        {
          name: "start_appium_session",
          description: `CONNECT TO DEVICE. Starts a live Appium session on the device configured in mcp-config.json.
The app must already be installed on the device. Use noReset:true (auto-applied).

Returns: { sessionId, platform, device, appPackage, navigationHints }

navigationHints tells you how to navigate WITHOUT calling inspect_ui_hierarchy on every screen:
  • openDeepLink(url) — jump directly to any deep-linked screen (fastest)
  • startActivity(package, activity) — Android: jump to any Activity directly
  • Use these instead of tapping through intermediate screens

After connecting:
✅ Call inspect_ui_hierarchy with stepHints=[...your new steps] for NEW screens only.
🚫 DO NOT call inspect_ui_hierarchy for screens that already have Page Objects.`,
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              profileName: { type: "string", description: "Optional capability profile name from mcp-config.json." }
            },
            required: ["projectRoot"]
          }
        },
        {
          name: "end_appium_session",
          description: "DISCONNECT FROM DEVICE. Terminates the active Appium session and frees the device. Call when inspection or live testing is complete. No args needed. Returns: confirmation.",
          inputSchema: {
            type: "object",
            properties: {},
          }
        },
        {
          name: "verify_selector",
          description: "TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.",
          inputSchema: {
            type: "object",
            properties: {
              selector: { type: "string", description: "The selector to verify (e.g. '~loginButton', 'id=com.app:id/btn')." },
              projectRoot: { type: "string", description: "Project root (required if auto-learning)." },
              oldSelector: { type: "string", description: "The broken selector that was replaced (required if auto-learning)." }
            },
            required: ["selector"]
          }
        },

        {
          name: "workflow_guide",
          description: "START HERE IF UNSURE. Returns the recommended step-by-step tool call sequence for common AppForge tasks. Call this FIRST if you don't know which tool to use or how to start. No side effects — safe to call at any time. Specify a workflow name for a focused guide, or omit to see all workflows. Returns: { workflows: { [name]: { description, steps[] } } }.",
          inputSchema: {
            type: "object",
            properties: {
              workflow: {
                type: "string",
                enum: ["new_project", "write_test", "run_and_heal", "inspect_device", "all"],
                description: "Which workflow to return. Omit or use 'all' to see every workflow."
              }
            },
            required: []
          }
        },
        {
          name: "extract_navigation_map",
          description: "EXTRACT APP NAVIGATION FLOW. Use when the user says 'understand the app flow / map the navigation / how do I get to X screen'. Analyzes existing step definitions, page objects, and test flows to build a navigation graph. Helps LLMs understand multi-screen app navigation patterns for intelligent test generation. Returns: { navigationMap: graph of screen connections, reusableFlows: common navigation paths, suggestions: how to reuse existing navigation steps }.",
          inputSchema: {
            type: "object",
            properties: {
              projectRoot: { type: "string" },
              targetScreen: { type: "string", description: "Optional specific screen or feature to analyze navigation paths to." },
              includeCommonFlows: { type: "boolean", description: "Whether to extract common multi-step navigation patterns (default: true)." }
            },
            required: ["projectRoot"]
          }
        }
      ],
    }));

    // ─── Tool Dispatcher ──────────────────────────────────
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments as any;
        switch (request.params.name) {
          case "setup_project": {
            // Use sensible defaults rather than blocking clarifications
            const platform = args.platform ?? 'android';
            const appName = args.appName ?? 'MyApp';
            const result = await this.projectSetupService.setup(args.projectRoot, platform, appName);
            this.configService.migrateIfNeeded(args.projectRoot);
            return this.textResult(result);
          }

          case "upgrade_project": {
            const upgradeResult = await this.projectMaintenanceService.upgradeProject(args.projectRoot);
            this.configService.migrateIfNeeded(args.projectRoot);
            return this.textResult(upgradeResult);
          }

          case "repair_project":
            return this.textResult(await this.projectMaintenanceService.repairProject(args.projectRoot, args.platform));

          case "manage_config":
            if (args.operation === "read") {
              return this.textResult(JSON.stringify(this.configService.read(args.projectRoot), null, 2));
            } else {
              // Validate currentEnvironment is in environments list
              if (args.operation === 'write' && args.config) {
                const incoming = args.config as any;
                if (incoming.currentEnvironment && incoming.environments) {
                  if (!incoming.environments.includes(incoming.currentEnvironment)) {
                    return this.textResult(JSON.stringify({
                      error: 'INVALID_ENVIRONMENT',
                      message: `currentEnvironment "${incoming.currentEnvironment}" is not in environments: [${incoming.environments.join(', ')}]`,
                      fix: `Either add "${incoming.currentEnvironment}" to the environments array, or choose an existing one.`
                    }));
                  }
                } else if (incoming.currentEnvironment) {
                  try {
                    const existing = this.configService.read(args.projectRoot);
                    const validEnvs = this.configService.getEnvironments(existing);
                    if (validEnvs.length > 1 && !validEnvs.includes(incoming.currentEnvironment)) {
                      return this.textResult(JSON.stringify({
                        error: 'INVALID_ENVIRONMENT',
                        message: `currentEnvironment "${incoming.currentEnvironment}" is not in: [${validEnvs.join(', ')}]`,
                        fix: `Add "${incoming.currentEnvironment}" to environments first, then set it as currentEnvironment.`
                      }));
                    }
                  } catch { /* allow write if config unreadable */ }
                }
              }
              this.configService.write(args.projectRoot, args.config);
              return this.textResult("Configuration updated successfully.");
            }

          case "inject_app_build":
            this.configService.updateAppPath(args.projectRoot, args.platform, args.appPath, args.forceWrite);
            return this.textResult(`Updated ${args.platform} app path to: ${args.appPath}`);

          case "analyze_codebase": {
            const config = this.configService.read(args.projectRoot);
            const paths = this.configService.getPaths(config);
            // Read customWrapperPackage from config and pass to analyzer
            let customWrapperPackage: string | undefined;
            try {
              const codegen = this.configService.getCodegen(config);
              if (codegen.customWrapperPackage) {
                customWrapperPackage = codegen.customWrapperPackage;
              }
            } catch { /* config unreadable — proceed without package */ }
            const result = await this.analyzerService.analyze(args.projectRoot, paths, customWrapperPackage);
            return this.textResult(JSON.stringify(result, null, 2));
          }

          case "generate_cucumber_pom": {
            const config = this.configService.read(args.projectRoot);
            const paths = this.configService.getPaths(config);
            const analysis = await this.analyzerService.analyze(args.projectRoot, paths);

            if (analysis.existingPageObjects.length === 0) {
              console.warn(`[AppForge] ⚠️ No page objects detected in ${paths.pagesRoot}. Proceeding with fresh generation.`);
            }

            const learningPrompt = this.learningService.getKnowledgePromptInjection(args.projectRoot);
            const prompt = await this.generationService.generateAppiumPrompt(
              args.projectRoot,
              args.testDescription,
              config,
              analysis,
              args.testName,
              learningPrompt,
              args.screenXml,
              args.screenshotBase64
            );
            return this.textResult(prompt);
          }

          case "audit_utils": {
            // BUG-12 FIX: Pass customWrapperPackage so methods from shared helper
            // packages (e.g. @company/appium-helpers) are counted as present.
            const result = await this.utilAuditService.audit(args.projectRoot, args.customWrapperPackage);
            return this.textResult(JSON.stringify({
              msg: "🔧 Util coverage suggestions",
              ...result
            }, null, 2));
          }

          case "validate_and_write":
            return this.textResult(await this.fileWriterService.validateAndWrite(args.projectRoot, args.files, 3, args.dryRun));

          case "run_cucumber_test": {
            const result = await this.executionService.runTest(args.projectRoot, {
              tags: args.tags,
              platform: args.platform,
              specificArgs: args.specificArgs,
              overrideCommand: args.overrideCommand,
              timeoutMs: args.timeoutMs
            });
            const hint = result.success 
              ? "✅ All tests passed. Call summarize_suite to generate the final report."
              : "❌ Some tests failed. Call self_heal_test with the output to fix broken selectors.";
            return this.textResult(JSON.stringify({ ...result, hint }, null, 2));
          }

          case "inspect_ui_hierarchy": {
            // Get projectRoot from args or active session
            let projectRoot = args.projectRoot;
            
            // If no projectRoot provided but session is active, get it from session
            if (!projectRoot && this.appiumSessionService.isSessionActive()) {
              projectRoot = this.appiumSessionService.getProjectRoot();
            }
            
            if (!projectRoot) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    action: 'ERROR',
                    code: 'MISSING_PROJECT_ROOT',
                    message: 'projectRoot is required when no active session exists',
                    hint: 'Either start a session with start_appium_session or provide projectRoot parameter'
                  }, null, 2)
                }],
                isError: true
              };
            }
            
            const result = await this.executionService.inspectHierarchy(
              projectRoot,
              args.xmlDump as string | undefined,
              args.screenshotBase64 as string | undefined,
              args.stepHints as string[] | undefined
            );
            const output = [
              result.snapshot,
              '',
              `Elements: ${result.elementCount.interactive} interactive of ${result.elementCount.total} total`,
              `Source: ${result.source} | ${result.timestamp}`,
            ].join('\n');
            return this.textResult(output);
          }

          case "self_heal_test": {
            // Get projectRoot from args or active session
            let projectRoot = args.projectRoot;
            
            if (!projectRoot && this.appiumSessionService.isSessionActive()) {
              projectRoot = this.appiumSessionService.getProjectRoot();
            }
            
            // If still no projectRoot, use cwd as fallback (better than crashing)
            if (!projectRoot) {
              projectRoot = process.cwd();
              console.warn('[AppForge] ⚠️ No projectRoot provided and no active session. Using process.cwd() as fallback.');
            }

            let xmlHierarchy = args.xmlHierarchy as string | undefined;

            // CHICKEN-AND-EGG FIX: if no XML provided, try cache from last successful inspect
            if (!xmlHierarchy) {
              const cached = this.appiumSessionService.getCachedXml();
              if (cached) {
                xmlHierarchy = cached.xml;
                // Prepend a warning so the LLM knows this XML is from cache
                console.warn(`[self_heal_test] Using cached XML (${cached.ageSeconds}s old). Navigate to the broken screen and re-inspect for fresher data.`);
              }
            }

            if (!xmlHierarchy) {
              return this.textResult(JSON.stringify({
                error: 'HEAL_BLOCKED',
                message: 'No XML hierarchy available. No live session and no cached XML found.',
                suggestion: 'Start a session, navigate to the broken screen, call inspect_ui_hierarchy once, then retry self_heal_test.'
              }));
            }

            let confidenceThreshold = 0.7;
            let maxCandidates = 3;
            let autoApply = false;

            try {
              const config = this.configService.read(projectRoot);
              const selfHealCfg = this.configService.getSelfHeal(config);
              confidenceThreshold = selfHealCfg.confidenceThreshold;
              maxCandidates = selfHealCfg.maxCandidates;
              autoApply = selfHealCfg.autoApply;
            } catch { /* use defaults */ }

            // If screenshot is provided as base64, store it first
            let screenshotPath = '';
            if (args.screenshotBase64) {
              const storage = new (await import('./utils/ScreenshotStorage.js')).ScreenshotStorage(projectRoot);
              const stored = storage.store(args.screenshotBase64, 'heal-input');
              screenshotPath = stored.relativePath;
            }
            
            const healResult = await this.selfHealingService.healWithRetry(
              args.testOutput,
              xmlHierarchy,
              screenshotPath,
              args.attempt ?? 1,
              3, // maxAttempts
              confidenceThreshold,
              maxCandidates
            );
            return this.textResult(JSON.stringify({
              candidates: healResult.instruction.alternativeSelectors || [],
              autoApply,
              promptForLLM: autoApply
                ? `Auto-apply mode is ON. Apply the first candidate (confidence: ${healResult.instruction.alternativeSelectors?.length ? 'high' : 'unknown'}) immediately without asking.`
                : healResult.prompt
            }, null, 2));
          }

          case "set_credentials":
            return this.textResult(await this.credentialService.setEnv(args.projectRoot, args.credentials));

          case "manage_users":
            return this.textResult(await this.credentialService.manageUsers(args.projectRoot, args.operation, args.env, args.users));

          case "audit_mobile_locators": {
            const config = this.configService.read(args.projectRoot);
            const paths = this.configService.getPaths(config);
            const report = await this.auditLocatorService.audit(args.projectRoot, [paths.pagesRoot, 'locators', 'src/locators']);
            return this.textResult(report.markdownReport);
          }

          case "summarize_suite": {
            let reportDir = 'reports';
            let pt = await import('path');
            try {
              const config = this.configService.read(args.projectRoot);
              reportDir = this.configService.getReporting(config).outputDir;
            } catch { /* use default */ }

            const reportFile = args.reportFile
              ?? pt.join(reportDir, 'cucumber-report.json');

            const summary = await this.summarySuiteService.summarize(args.projectRoot, reportFile);
            return this.textResult(JSON.stringify({
              summary: summary.plainEnglishSummary,
              data: {
                total: summary.totalScenarios,
                passed: summary.passed,
                failed: summary.failed,
                skipped: summary.skipped,
                duration: summary.duration,
                failedScenarios: summary.failedScenarios
              },
              hint: summary.failed > 0 ? "Call self_heal_test for any failing scenarios listed above." : "Tests passed. Ready for production push."
            }, null, 2));
          }

          case "check_environment": {
            const report = await this.environmentCheckService.check(args.projectRoot, args.platform, args.appPath);
            return this.textResult(JSON.stringify({
              summary: report.summary,
              data: {
                ready: report.ready,
                failCount: report.checks.filter((c: any) => c.status === 'fail').length,
                warnCount: report.checks.filter((c: any) => c.status === 'warn').length
              },
              hint: report.ready ? "✅ Environment ready. Call setup_project to scaffold your tests." : "❌ Environment issues found. Fix the failures before continuing."
            }, null, 2));
          }

          case "generate_ci_workflow": {
            // Security: validate projectRoot before writing any files
            validateProjectRoot(args.projectRoot);

            const config = this.configService.read(args.projectRoot);

            // Extract best-effort CI parameters from config
            const executionCommand = config.project?.executionCommand;

            let deviceName = args.platform === 'ios' ? 'iPhone 14' : 'Pixel_6';
            for (const profile of Object.values(config.mobile?.capabilitiesProfiles || {})) {
              if (profile.platformName?.toLowerCase() === args.platform && profile['appium:deviceName']) {
                deviceName = profile['appium:deviceName'];
                break;
              }
            }

            // WDIO commonly uses _results_ or reports/
            const reportPath = executionCommand?.includes('wdio') ? '_results_/' : 'reports/';

            const workflow = this.ciWorkflowService.generate(args.provider, args.platform, {
              nodeVersion: args.nodeVersion,
              appiumVersion: args.appiumVersion,
              executionCommand,
              deviceName,
              reportPath
            });
            // Write the workflow file to the project
            const fs = await import('fs');
            const path = await import('path');
            const fullPath = path.default.join(args.projectRoot, workflow.filename);
            const dir = path.default.dirname(fullPath);
            if (!fs.default.existsSync(dir)) {
              fs.default.mkdirSync(dir, { recursive: true });
            }
            fs.default.writeFileSync(fullPath, workflow.content);
            return this.textResult(`Generated CI workflow at ${workflow.filename}\n\n${workflow.content}`);
          }

          case "train_on_example": {
            const rule = this.learningService.learn(args.projectRoot, args.issuePattern, args.solution, args.tags ?? []);
            return this.textResult(`✅ Learned rule "${rule.id}": When encountering "${rule.pattern}" → apply: ${rule.solution}`);
          }

          case "export_team_knowledge":
            return this.textResult(this.learningService.exportToMarkdown(args.projectRoot));

          case "suggest_refactorings": {
            const config = this.configService.read(args.projectRoot);
            const paths = this.configService.getPaths(config);
            const analysis = await this.analyzerService.analyze(args.projectRoot, paths);
            return this.textResult(this.refactoringService.generateRefactoringSuggestions(analysis));
          }

          case "export_bug_report":
            return this.textResult(this.bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion));

          case "generate_test_data_factory":
            return this.textResult(this.testDataService.generateDataFactoryPrompt(args.entityName, args.schemaDefinition));

          case "analyze_coverage": {
            const report = this.coverageAnalysisService.analyzeCoverage(args.projectRoot, args.featureFilesPaths);
            const prompt = this.coverageAnalysisService.getCoveragePrompt(report);
            return this.textResult(JSON.stringify({ report, prompt }, null, 2));
          }

          case "migrate_test": {
            const prompt = this.migrationService.generateMigrationPrompt(
              args.sourceCode,
              args.sourceFileName,
              { sourceFramework: args.sourceFramework, sourceLanguage: args.sourceLanguage }
            );
            return this.textResult(prompt);
          }

          case "request_user_clarification":
            return this.textResult(`⚠️ SYSTEM HALT — HUMAN INPUT REQUIRED\n\n**Question**: ${args.question}\n\n**Context**: ${args.context}\n${args.options ? '\n**Options**:\n' + args.options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n') : ''}\n\nPlease answer the question above before continuing.`);

          case "start_appium_session": {
            // Use this.appiumSessionService directly — the SAME instance injected into
            // ExecutionService and SelfHealingService, so inspect_ui_hierarchy can use it.
            try {
              const sessionInfo = await this.appiumSessionService.startSession(args.projectRoot, args.profileName);
              const hints = sessionInfo.navigationHints;
              const output = [
                `✅ Session started | Device: ${sessionInfo.deviceName} | Platform: ${sessionInfo.platformName}`,
                `App: ${sessionInfo.appPackage || sessionInfo.bundleId || 'unknown'}`,
                '',
                '📍 Navigation Shortcuts Available:',
                hints.androidPackage ? `  Android startActivity: package=${hints.androidPackage}, activity=${hints.androidDefaultActivity}` : '',
                hints.iosBundle ? `  iOS bundle: ${hints.iosBundle}` : '',
                `  Deep links: openDeepLink(url) — use for any screen with a deep link`,
                '',
                'Next: Call inspect_ui_hierarchy with stepHints=[...your steps] for the NEW screen you are building.',
                '🚫 Do NOT call inspect_ui_hierarchy for screens that already have Page Objects.'
              ].filter(Boolean).join('\n');
              return this.textResult(output);
            } catch (error: any) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    action: 'ERROR',
                    code: 'SESSION_START_FAILED',
                    message: error.message || String(error),
                    hint: 'Verify Appium server is running (npx appium), device/emulator is connected, and mcp-config.json has valid capabilities.'
                  }, null, 2)
                }],
                isError: true
              };
            }
          }

          case "end_appium_session": {
            await this.appiumSessionService.endSession();
            return this.textResult('Appium session terminated.');
          }

          case "verify_selector": {
            const verification = await this.selfHealingService.verifyHealedSelector(args.selector);

            // Auto-learn if the selector works and we have context
            if (verification.exists && args.projectRoot && args.oldSelector) {
              this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
              (verification as any).note = "Success automatically learned to rule base.";
            }

            return this.textResult(JSON.stringify(verification, null, 2));
          }



          case "execute_sandbox_code": {
            const v = this.validateArgs(args, ['script']);
            if (v) return v;

            const apiRegistry: SandboxApiRegistry = {
              analyzeCodebase: async (projectRoot: string) => {
                const config = this.configService.read(projectRoot);
                const paths = this.configService.getPaths(config);
                let customWrapperPackage: string | undefined;
                try {
                  const codegen = this.configService.getCodegen(config);
                  if (codegen.customWrapperPackage) {
                    customWrapperPackage = codegen.customWrapperPackage;
                  }
                } catch { /* config unreadable — proceed without package */ }
                return this.analyzerService.analyze(projectRoot, paths, customWrapperPackage);
              },
              runTests: async (projectRoot: string) => {
                return this.executionService.runTest(projectRoot, {});
              },
              readFile: async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }) => {
                const fs = await import('fs');
                const path = await import('path');
                // Security: ensure the resolved path is strictly inside projectRoot
                const resolvedRoot = path.default.resolve(projectRoot);
                const resolvedFile = path.default.resolve(resolvedRoot, filePath);
                if (!resolvedFile.startsWith(resolvedRoot + path.default.sep) && resolvedFile !== resolvedRoot) {
                  throw new Error(`[SECURITY] Path traversal blocked. "${filePath}" resolves outside projectRoot.`);
                }
                if (!fs.default.existsSync(resolvedFile)) {
                  throw new Error(`File not found: ${resolvedFile}`);
                }
                return fs.default.readFileSync(resolvedFile, 'utf8');
              },
              getConfig: async (projectRoot: string) => {
                return this.configService.read(projectRoot);
              },
            };

            const sandboxResult = await executeSandbox(args.script, apiRegistry, { timeoutMs: args.timeoutMs });

            if (sandboxResult.success) {
              const parts: string[] = [];
              if (sandboxResult.logs.length > 0) {
                parts.push(`[Sandbox Logs]\n${sandboxResult.logs.join('\n')}`);
              }
              if (sandboxResult.result != null) {
                parts.push(
                  typeof sandboxResult.result === 'string'
                    ? sandboxResult.result
                    : JSON.stringify(sandboxResult.result, null, 2)
                );
              } else if (sandboxResult.logs.length === 0) {
                parts.push('⚠️ Sandbox executed successfully but returned no data. Ensure your script uses `return <value>` to send results back.');
              }
              parts.push(`\n⏱️ Executed in ${sandboxResult.durationMs}ms`);
              return this.textResult(parts.join('\n\n'));
            } else {
              return {
                content: [{ type: "text" as const, text: `❌ SANDBOX ERROR:\n${sandboxResult.error}\n\nLogs:\n${sandboxResult.logs.join('\n')}\n\n⏱️ Failed after ${sandboxResult.durationMs}ms` }],
                isError: true
              };
            }
          }

          case "workflow_guide": {
            const ALL_WORKFLOWS: Record<string, { description: string; steps: any[] }> = {
              new_project: {
                description: "Set up a brand-new Appium Cucumber mobile automation project from scratch.",
                steps: [
                  "1. check_environment — Verify Node.js, Appium, Android SDK / Xcode, and connected device.",
                  "2. setup_project — Scaffold the full project structure (BasePage, features, wdio config, hooks).",
                  "3. manage_config (read) — Review the generated mcp-config.json.",
                  "4. manage_config (write) — Set your deviceName, app path, platformVersion.",
                  "5. inject_app_build — Point config to your .apk/.ipa file.",
                  "6. start_appium_session — Verify the session starts successfully.",
                  "7. end_appium_session — Clean up after verification."
                ]
              },
              write_test: {
                description: "Generate a new Cucumber BDD test scenario from plain English.",
                steps: [
                  {
                    step: 1,
                    tool: "execute_sandbox_code",
                    purpose: "Scan codebase: get existing steps, page objects, and architecture pattern.",
                    onSuccess: "Pass result to generate_cucumber_pom as context.",
                    onFailure: "If projectRoot is wrong, check mcp-config.json. If scan returns empty, project may be new — proceed to step 2 with empty context."
                  },
                  {
                    step: 2,
                    tool: "inspect_ui_hierarchy",
                    purpose: "Get snapshot of the NEW screen being built. Use stepHints=[...your steps].",
                    prerequisite: "Active session required. Call start_appium_session first if not connected.",
                    condition: "SKIP THIS STEP if ALL screens in the test already have Page Objects (check step 1 output).",
                    onSuccess: "Pass snapshot to generate_cucumber_pom as screenContext.",
                    onFailure: "If session is dead: skip this step and use known Page Object locators from step 1. If screen not found: ensure app is on correct screen before calling."
                  },
                  {
                    step: 3,
                    tool: "generate_cucumber_pom",
                    purpose: "Generate feature file, step definitions, and Page Object.",
                    onSuccess: "Pass generated JSON to validate_and_write.",
                    onFailure: "If generation is incomplete or JSON is malformed: retry with a shorter, more focused testDescription. Break complex flows into smaller scenarios."
                  },
                  {
                    step: 4,
                    tool: "validate_and_write",
                    purpose: "Validate TypeScript and Gherkin syntax, then write files to disk.",
                    onSuccess: "Proceed to run_cucumber_test.",
                    onFailure: "If TypeScript error: read the error message, fix the specific import or type issue in the generated code, retry validate_and_write. If Gherkin error: check step definition patterns match feature file exactly."
                  },
                  {
                    step: 5,
                    tool: "run_cucumber_test",
                    purpose: "Execute the generated test to verify it passes.",
                    onSuccess: "Test complete. Review HTML report at configured reportPath.",
                    onFailure: "If 'element not found': call self_heal_test with the error output — it will suggest replacement selectors automatically using cached XML. If 'session expired': restart session and re-run. If 'step not defined': a step in the feature has no matching step definition — add it."
                  }
                ]
              },
              run_and_heal: {
                description: "Run the test suite and fix any tests failing due to broken selectors.",
                steps: [
                  "1. run_cucumber_test — Run all or filtered tests.",
                  "2. [If tests fail] inspect_ui_hierarchy — Get current XML from the failing screen.",
                  "3. self_heal_test — Pass the failure output + XML to get replacement selector candidates.",
                  "4. verify_selector — Confirm the best candidate works on the live device.",
                  "5. Update the Page Object file with the working selector.",
                  "6. train_on_example — Save the fix so it is never repeated.",
                  "7. run_cucumber_test — Re-run to confirm everything passes."
                ]
              },
              inspect_device: {
                description: "Connect to device and inspect current screen.",
                steps: [
                  {
                    step: 1,
                    tool: "start_appium_session",
                    purpose: "Connect to the device.",
                    prerequisite: "App must be installed. Appium server must be running.",
                    onSuccess: "Note the navigationHints in the response — use them instead of navigating through UI.",
                    onFailure: "If 'session not created': verify app is installed (adb install <apk> for Android). Check mcp-config.json has correct appium:app path and appium:deviceName. Run check_environment to diagnose."
                  },
                  {
                    step: 2,
                    tool: "inspect_ui_hierarchy",
                    purpose: "Get snapshot of current screen.",
                    onSuccess: "Use #ref numbers and locators from snapshot in your Page Object.",
                    onFailure: "If session expired between steps: call start_appium_session again. If app crashed: relaunch app manually then retry."
                  }
                ]
              }
            };
            const wf = args?.workflow;
            const result = (!wf || wf === 'all')
              ? ALL_WORKFLOWS
              : ALL_WORKFLOWS[wf] ? { [wf]: ALL_WORKFLOWS[wf] } : ALL_WORKFLOWS;
            return this.textResult(JSON.stringify({ workflows: result }, null, 2));
          }

          case "extract_navigation_map": {
            // MEMORY LEAK FIX: Use pooled NavigationGraphService instance per project
            const navService = this.getNavigationGraphService(args.projectRoot);
            const result = await navService.extractNavigationMap(args.projectRoot);
            
            return this.textResult(JSON.stringify(result, null, 2));
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (err: any) {
        if (err instanceof ClarificationRequired) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'CLARIFICATION_REQUIRED',
                question: err.question,
                context: err.context,
                options: err.options ?? []
              }, null, 2)
            }]
          };
        }
        if (err instanceof AppForgeError) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                action: 'ERROR',
                code: err.code,
                message: err.message,
                remediation: err.remediation
              }, null, 2)
            }],
            isError: true
          };
        }
        return {
          content: [{
            type: "text" as const, text: JSON.stringify({
              action: 'ERROR',
              code: 'UNHANDLED_ERROR',
              message: err.message || String(err),
              hint: 'Verify that projectRoot is an absolute path, mcp-config.json is valid JSON, and the Appium server is running (if using live session tools).'
            }, null, 2)
          }],
          isError: true
        };
      }
    });
  }

  private validateArgs(args: Record<string, any>, requiredFields: string[]) {
    const missing = requiredFields.filter(
      f => args[f] === undefined || args[f] === null || args[f] === ''
    );
    if (missing.length === 0) return null;
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: `Missing required argument(s): ${missing.join(', ')}`,
          invalidFields: missing,
          hint: 'Provide all required fields and retry.'
        }, null, 2)
      }],
      isError: true as const
    };
  }

  /**
   * MEMORY LEAK FIX: Get or create a NavigationGraphService instance for the given project.
   * Prevents memory accumulation by reusing instances across tool calls.
   */
  private getNavigationGraphService(projectRoot: string): NavigationGraphService {
    if (!this.navigationGraphServices.has(projectRoot)) {
      this.navigationGraphServices.set(projectRoot, new NavigationGraphService(projectRoot));
    }
    return this.navigationGraphServices.get(projectRoot)!;
  }

  private textResult(text: string) {
    return { content: [{ type: "text" as const, text }] };
  }

  async run() {
    const args = process.argv.slice(2);
    const transportFlag = args.findIndex(a => a === '--transport');
    const transportType = transportFlag !== -1 ? args[transportFlag + 1] : 'stdio';

    if (transportType === 'sse') {
      const portFlag = args.findIndex(a => a === '--port');
      const port = portFlag !== -1 ? parseInt(args[portFlag + 1] || '3100', 10) : 3100;

      const app = express();
      let sseTransport: SSEServerTransport;

      app.get('/sse', async (req, res) => {
        sseTransport = new SSEServerTransport('/message', res);
        await this.server.connect(sseTransport);
      });

      app.post('/message', async (req, res) => {
        if (sseTransport) {
          await sseTransport.handlePostMessage(req, res);
        } else {
          res.status(500).send('SSE transport not connected');
        }
      });

      app.listen(port, () => {
        console.error(`Appium MCP Server running on SSE at http://localhost:${port}/sse`);
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Appium MCP Server running on stdio");
    }
  }
}

const server = new AppForgeServer();
server.run().catch(console.error);
