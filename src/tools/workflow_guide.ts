import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "./_helpers.js";

export function registerWorkflowGuide(
  server: McpServer
): void {
  server.registerTool(
    "workflow_guide",
    {
      title: "Workflow Guide",
      description: `TRIGGER: Unsure which tool to use OR need workflow guidance OR first time using AppForge
RETURNS: { workflows: { [name]: { description, steps: Array<step details> } } }
NEXT: Follow returned workflow steps sequentially
COST: Low (static data, no execution, ~100 tokens)
ERROR_HANDLING: None - always succeeds.

START HERE IF UNSURE. Returns step-by-step sequences for: new_project, write_test, run_and_heal, inspect_device.

OUTPUT: Ack (≤10 words), proceed.`,
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
          description: "Generate a new Cucumber BDD test scenario from plain English. ATOMICITY RULE: PREFER one generate_cucumber_pom → validate_and_write → run_cucumber_test cycle. AVOID repeated inspect_ui_hierarchy → tap → inspect round trips — each adds latency and state drift. Write the full scenario in one shot, then run it.",

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
              tool: "export_navigation_map",
              purpose: "Visualize the app flow to understand what screens AppForge has explored and how to navigate between them.",
              condition: "Call before writing tests to see if AppForge already knows how to reach the target screen.",
              onSuccess: "Examine Mermaid diagram. Reuse these exact steps in your Cucumber scenario.",
              onFailure: "If graph is empty, you may need to start_appium_session and inspect_ui_hierarchy to map it out."
            },
            {
              step: 3,
              tool: "inspect_ui_hierarchy",
              purpose: "Get snapshot of the NEW screen being built. Use stepHints=[...your steps].",
              prerequisite: "Active session required. Call start_appium_session first if not connected.",
              condition: "SKIP THIS STEP if ALL screens in the test already have Page Objects (check step 1 output).",
              onSuccess: "Pass snapshot to generate_cucumber_pom as screenContext.",
              onFailure: "If session is dead: skip this step and use known Page Object locators from step 1. If screen not found: ensure app is on correct screen before calling."
            },
            {
              step: 4,
              tool: "generate_cucumber_pom",
              purpose: "Generate feature file, step definitions, and Page Object.",
              onSuccess: "Pass generated JSON to validate_and_write.",
              onFailure: "If generation is incomplete or JSON is malformed: retry with a shorter, more focused testDescription. Break complex flows into smaller scenarios."
            },
            {
              step: 5,
              tool: "validate_and_write",
              purpose: "Validate TypeScript and Gherkin syntax, then write files to disk.",
              onSuccess: "Proceed to run_cucumber_test.",
              onFailure: "If TypeScript error: read the error message, fix the specific import or type issue in the generated code, retry validate_and_write. If Gherkin error: check step definition patterns match feature file exactly."
            },
            {
              step: 6,
              tool: "run_cucumber_test",
              purpose: "Execute the generated test to verify it passes.",
              onSuccess: "Test complete. Review HTML report at configured reportPath.",
              onFailure: "If 'element not found': call self_heal_test with the error output — it will suggest replacement selectors automatically using cached XML. If 'session expired': restart session and re-run. If 'step not defined': a step in the feature has no matching step definition — add it."
            }
          ],
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
              onSuccess: "Use #ref numbers and locators from snapshot in your Page Object. Re-inspect after every tap or navigation — never assume what the next screen looks like.",
              onFailure: "If session expired between steps: call start_appium_session again. If app crashed: relaunch app manually then retry."
            }
          ]
        }
      };
      const wf = args?.workflow;
      const result = (!wf || wf === 'all')
        ? ALL_WORKFLOWS
        : ALL_WORKFLOWS[wf] ? { [wf]: ALL_WORKFLOWS[wf] } : ALL_WORKFLOWS;
      return textResult(JSON.stringify({ workflows: result }, null, 2));
    }
  );
}
