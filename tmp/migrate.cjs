const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../src/index.ts');
let content = fs.readFileSync(targetFile, 'utf8');

// Replacement 1: Imports
content = content.replace(
`import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";`,
`import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";`
);

content = content.replace(
`import { NavigationGraphService } from "./services/NavigationGraphService.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";`,
`import { NavigationGraphService } from "./services/NavigationGraphService.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ScreenshotStorage } from "./utils/ScreenshotStorage.js";`
);

// Replacement 2: sandbox
content = content.replace(
`          readFile: async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }) => {
            const fs = await import('fs');
            const path = await import('path');
            // Security: ensure the resolved path is strictly inside projectRoot
            const resolvedRoot = path.default.resolve(projectRoot);
            const resolvedFile = path.default.resolve(resolvedRoot, filePath);
            if (!resolvedFile.startsWith(resolvedRoot + path.default.sep) && resolvedFile !== resolvedRoot) {
              throw new Error(\`[SECURITY] Path traversal blocked. "\${filePath}" resolves outside projectRoot.\`);
            }
            if (!fs.default.existsSync(resolvedFile)) {
              throw new Error(\`File not found: \${resolvedFile}\`);
            }
            return fs.default.readFileSync(resolvedFile, 'utf8');
          },`,
`          readFile: async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }) => {
            // Security: ensure the resolved path is strictly inside projectRoot
            const resolvedRoot = path.resolve(projectRoot);
            const resolvedFile = path.resolve(resolvedRoot, filePath);
            if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
              throw new Error(\`[SECURITY] Path traversal blocked. "\${filePath}" resolves outside projectRoot.\`);
            }
            if (!fs.existsSync(resolvedFile)) {
              throw new Error(\`File not found: \${resolvedFile}\`);
            }
            return fs.readFileSync(resolvedFile, 'utf8');
          },`
);

// Replacement 3: self_heal
content = content.replace(
`        let screenshotPath = '';
        if (args.screenshotBase64) {
          const storage = new (await import('./utils/ScreenshotStorage.js')).ScreenshotStorage(projectRoot);
          const stored = storage.store(args.screenshotBase64, 'heal-input');
          screenshotPath = stored.relativePath;
        }`,
`        let screenshotPath = '';
        if (args.screenshotBase64) {
          const storage = new ScreenshotStorage(projectRoot);
          const stored = storage.store(args.screenshotBase64, 'heal-input');
          screenshotPath = stored.relativePath;
        }`
);

// Replacement 4: summarize_suite
content = content.replace(
`        let reportDir = 'reports';
        let pt = await import('path');
        try {
          const config = this.configService.read(args.projectRoot);
          reportDir = this.configService.getReporting(config).outputDir;
        } catch { /* use default */ }

        const reportFile = args.reportFile
          ?? pt.join(reportDir, 'cucumber-report.json');`,
`        let reportDir = 'reports';
        try {
          const config = this.configService.read(args.projectRoot);
          reportDir = this.configService.getReporting(config).outputDir;
        } catch { /* use default */ }

        const reportFile = args.reportFile
          ?? path.join(reportDir, 'cucumber-report.json');`
);

// Replacement 5: generate_ci_workflow
content = content.replace(
`        // Write the workflow file to the project
        const fs = await import('fs');
        const path = await import('path');
        const fullPath = path.default.join(args.projectRoot, workflow.filename);
        const dir = path.default.dirname(fullPath);
        if (!fs.default.existsSync(dir)) {
          fs.default.mkdirSync(dir, { recursive: true });
        }
        fs.default.writeFileSync(fullPath, workflow.content);`,
`        // Write the workflow file to the project
        const fullPath = path.join(args.projectRoot, workflow.filename);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, workflow.content);`
);

// Check if any replace failed
if (content.includes('await import("fs")') || content.includes('await import(\\\'fs\\\')') || content.includes('await import("path")') || content.includes('await import(\\\'path\\\')')) {
  throw new Error("One of the import replacements failed");
}

const legacyStart = '    // ─── Legacy Tool Discovery';
const valArgsStart = '  private validateArgs(';

const splitPoint1 = content.indexOf(legacyStart);
const splitPoint2 = content.indexOf(valArgsStart);

if (splitPoint1 === -1 || splitPoint2 === -1) {
    throw new Error('Split points not found');
}

const beforeLegacy = content.substring(0, splitPoint1);
const afterLegacy = content.substring(splitPoint2);

const NEW_TOOLS = 
`    this.server.registerTool(
      "export_bug_report",
      {
        title: "Export Bug Report",
        description: "GENERATE JIRA BUG REPORT. Use when a failed test needs to be tracked in a ticket. Formats the test failure into a Jira-ready report with auto-classified severity, reproduction steps, environment details, and suggested fix. Returns: Markdown ready to paste into Jira.",
        inputSchema: z.object({
          testName: z.string(),
          rawError: z.string(),
          platform: z.string().optional(),
          deviceName: z.string().optional(),
          appVersion: z.string().optional()
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => this.textResult(this.bugReportService.generateBugReport(args.testName, args.rawError, args.platform, args.deviceName, args.appVersion)))
    );

    this.server.registerTool(
      "generate_test_data_factory",
      {
        title: "Generate Test Data Factory",
        description: "CREATE FAKE TEST DATA. Use when tests need realistic randomized data or the user says 'generate test data / mock data / create a data factory'. Returns a generation prompt to create a typed Faker.js factory.",
        inputSchema: z.object({
          entityName: z.string(),
          schemaDefinition: z.string()
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => this.textResult(this.testDataService.generateDataFactoryPrompt(args.entityName, args.schemaDefinition)))
    );

    this.server.registerTool(
      "request_user_clarification",
      {
        title: "Request User Clarification",
        description: "ASK THE USER A QUESTION. Use ONLY when you cannot proceed and no reasonable assumption is possible. This halts the workflow and presents the question to the user. PREFER making a sensible default assumption over stopping. NEVER call this in a loop — if the user already answered, proceed. Returns: the question displayed to the user.",
        inputSchema: z.object({
          question: z.string(),
          context: z.string(),
          options: z.array(z.string()).optional()
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => this.textResult(
        \`⚠️ SYSTEM HALT — HUMAN INPUT REQUIRED\\n\\n**Question**: \${args.question}\\n\\n**Context**: \${args.context}\\n\${args.options ? '\\n**Options**:\\n' + args.options.map((o: string, i: number) => \`\${i + 1}. \${o}\`).join('\\n') : ''}\\n\\nPlease answer the question above before continuing.\`
      ))
    );

    this.server.registerTool(
      "analyze_coverage",
      {
        title: "Analyze Coverage",
        description: "FIND MISSING TEST COVERAGE. Use when the user says 'what screens are not tested / find coverage gaps / what scenarios am I missing'. Parses .feature files to identify untested screens and missing edge cases. Returns: { report, prompt with suggestions }.",
        inputSchema: z.object({
          projectRoot: z.string(),
          featureFilesPaths: z.array(z.string())
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => {
        const report = this.coverageAnalysisService.analyzeCoverage(args.projectRoot, args.featureFilesPaths);
        const prompt = this.coverageAnalysisService.getCoveragePrompt(report);
        return this.textResult(JSON.stringify({ report, prompt }, null, 2));
      })
    );

    this.server.registerTool(
      "migrate_test",
      {
        title: "Migrate Test",
        description: "CONVERT EXISTING TESTS TO APPIUM. Use when the user has Espresso (Java), XCUITest (Swift), or Detox (JavaScript) tests and wants to migrate to Appium + Cucumber POM format. Returns a migration prompt with side-by-side construct mapping.",
        inputSchema: z.object({
          sourceCode: z.string(),
          sourceFileName: z.string(),
          sourceFramework: z.enum(["espresso", "xcuitest", "detox"]),
          sourceLanguage: z.enum(["java", "swift", "javascript"])
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => this.textResult(this.migrationService.generateMigrationPrompt(args.sourceCode, args.sourceFileName, { sourceFramework: args.sourceFramework, sourceLanguage: args.sourceLanguage })))
    );

    this.server.registerTool(
      "start_appium_session",
      {
        title: "Start Appium Session",
        description: "CONNECT TO DEVICE. Use when the user says 'connect to the device / start a session / inspect the app / I want to see what's on screen'. Connects to Appium and starts a session on the device in mcp-config.json. Returns: { sessionId, platform, device, hint }. After success, call inspect_ui_hierarchy with no args to see the current screen.",
        inputSchema: z.object({
          projectRoot: z.string(),
          profileName: z.string().optional()
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      async (args) => {
        try {
          const sessionInfo = await this.appiumSessionService.startSession(args.projectRoot, args.profileName);
          const hints = sessionInfo.navigationHints;
          const output = [
            \`✅ Session started | Device: \${sessionInfo.deviceName} | Platform: \${sessionInfo.platformName}\`,
            \`App: \${sessionInfo.appPackage || sessionInfo.bundleId || 'unknown'}\`,
            '',
            '📍 Navigation Shortcuts Available:',
            hints.androidPackage ? \`  Android startActivity: package=\${hints.androidPackage}, activity=\${hints.androidDefaultActivity}\` : '',
            hints.iosBundle ? \`  iOS bundle: \${hints.iosBundle}\` : '',
            \`  Deep links: openDeepLink(url) — use for any screen with a deep link\`,
            '',
            'Next: Call inspect_ui_hierarchy with stepHints=[...your steps] for the NEW screen you are building.',
            '🚫 Do NOT call inspect_ui_hierarchy for screens that already have Page Objects.'
          ].filter(Boolean).join('\\n');
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
    );

    this.server.registerTool(
      "end_appium_session",
      {
        title: "End Appium Session",
        description: "DISCONNECT FROM DEVICE. Terminates the active Appium session and frees the device. Call when inspection or live testing is complete. No args needed. Returns: confirmation.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      async (_args) => {
        await this.appiumSessionService.endSession();
        return this.textResult('Appium session terminated.');
      }
    );

    this.server.registerTool(
      "verify_selector",
      {
        title: "Verify Selector",
        description: "TEST A SELECTOR LIVE. Use after self_heal_test returns candidates to confirm a selector works before updating your Page Object. ⚡ REQUIRES ACTIVE SESSION. Returns: { exists, displayed, enabled, tagName, text }. If exists is true and this fixes a broken selector, also pass oldSelector and projectRoot to auto-learn the fix.",
        inputSchema: z.object({
          selector: z.string(),
          projectRoot: z.string().optional(),
          oldSelector: z.string().optional()
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => {
        const verification = await this.selfHealingService.verifyHealedSelector(args.selector);
        if (verification.exists && args.projectRoot && args.oldSelector) {
          this.selfHealingService.reportHealSuccess(args.projectRoot, args.oldSelector, args.selector);
          (verification as any).note = "Success automatically learned to rule base.";
        }
        return this.textResult(JSON.stringify(verification, null, 2));
      })
    );

    this.server.registerTool(
      "workflow_guide",
      {
        title: "Workflow Guide",
        description: "START HERE IF UNSURE. Returns the recommended step-by-step tool call sequence for common AppForge tasks. Call this FIRST if you don't know which tool to use or how to start. No side effects — safe to call at any time. Returns: { workflows: { [name]: { description, steps[] } } }.",
        inputSchema: z.object({
          workflow: z.enum(["new_project", "write_test", "run_and_heal", "inspect_device", "all"]).optional()
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      async (args) => {
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
    );

    this.server.registerTool(
      "extract_navigation_map",
      {
        title: "Extract Navigation Map",
        description: "EXTRACT APP NAVIGATION FLOW. Use when the user says 'understand the app flow / map the navigation / how do I get to X screen'. Analyzes existing step definitions, page objects, and test flows to build a navigation graph. Helps LLMs understand multi-screen app navigation patterns for intelligent test generation. Returns: { navigationMap: graph of screen connections, reusableFlows: common navigation paths, suggestions: how to reuse existing navigation steps }.",
        inputSchema: z.object({
          projectRoot: z.string(),
          targetScreen: z.string().optional(),
          includeCommonFlows: z.boolean().optional()
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
      },
      async (args) => this.safeHandler(async () => {
        const navService = this.getNavigationGraphService(args.projectRoot);
        const result = await navService.extractNavigationMap(args.projectRoot);
        return this.textResult(JSON.stringify(result, null, 2));
      })
    );
  }

  private async safeHandler(fn: () => Promise<any>) {
    try {
      return await safeExecute(fn);
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
              remediation: err.details
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
  }

`;

content = beforeLegacy + NEW_TOOLS + afterLegacy;

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Migration successful!");
