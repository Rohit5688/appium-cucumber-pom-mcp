# MCP Issue Report — MarketPlace scaffold

Date: 2026-08-04 22:23 IST  
Project root: /Users/rsakhawalkar/AppForgeTest

## Summary
This document records problems observed while scaffolding the MarketPlace mobile automation project and provides actionable fixes for the MCP (appForge) tools. It also includes a test-users template and a TypeScript reading helper example that tests can use.

## Timeline (concise)
1. Called setup_project (phase 1) → generated mcp-config.json containing CONFIGURE_ME placeholders.
2. Ran manage_config (write) to add android_emulator and ios_simulator profiles.
3. Re-ran setup_project → returned REQUIRED_FIELDS_MISSING (platformName, appium:app) because a placeholder profile remained.
4. Attempted to remove placeholder via replace_in_file → the SEARCH block did not match (file changed between read/replace) and the operation reverted to a different file state.
5. Ran manage_config (write) again with correct profiles → setup_project completed (phase 2) and files were created.
6. Ran manage_users (write) → credentials/users.json written (strategy: unified-key).

## Observed Issues (for MCP devs)
1. Placeholder profile ("myDevice") remained and caused validation failures.
   - Severity: Medium
   - Symptom: setup_project returned REQUIRED_FIELDS_MISSING pointing to generic fields (platformName, appium:app).
   - Root cause hypothesis: placeholder keys are left in the file and manage_config.write does not remove or properly merge placeholders.
   - Suggested fix: manage_config.write should either:
     - Remove known placeholder entries automatically when adding real profiles, OR
     - Provide an explicit "removePlaceholders" option, OR
     - Return a list of profiles still containing CONFIGURE_ME values with JSON paths.

2. replace_in_file operation failed due to exact-text SEARCH mismatch.
   - Severity: Low → Medium (can block scripted edits)
   - Symptom: replace_in_file failed because file had changed after the read.
   - Root cause hypothesis: replace_in_file requires exact multi-line matches; concurrent edits or manual edits break this.
   - Suggested fix: provide JSON-aware edit helpers (deleteJsonKey, upsertJsonPath) to avoid brittle text matching when editing config JSON.

3. Poorly scoped validation messages from setup_project.
   - Severity: Low
   - Symptom: error listed missing fields but not the profile name or JSON path.
   - Suggested fix: include JSON pointer(s) to offending fields (e.g. mobile.capabilitiesProfiles.myDevice.platformName) and recommended corrective action.

4. Unclear generation of helper code from manage_users.
   - Severity: Low
   - Symptom: manage_users wrote credentials/users.json but it's unclear if/get where a typed getUser helper was created.
   - Suggested fix: manage_users.write must always generate (or explicitly report) the helper path (e.g. src/utils/getUser.ts) and return the path in its response.

5. Race conditions / file-change detection.
   - Severity: Low
   - Symptom: Tools operate sequentially but do not warn when a file changed since last read.
   - Suggested fix: implement basic file-change detection (compare file hashes / mtime) before applying edits and prompt or retry.

6. Missing explicit log of created files (or inconsistent visibility in editor).
   - Severity: Low
   - Symptom: setup_project returns filesCreated but some IDE listings didn't immediately show newly created files.
   - Suggested fix: ensure filesCreated list is complete, and emit stdout/JSON with paths for IDE watchers; consider returning per-file success status.

7. Environment-specific files not created despite environments listed in mcp-config.json.
   - Severity: Medium
   - Symptom: mcp-config.json contained environments (e.g. local, staging, integration) but setup_project/manage_users did not generate per-environment credential files (e.g. src/credentials/local.json) automatically, nor did setup_project create environment scaffolding files.
   - Root cause hypothesis: setup_project expects the user to create env files manually or manage_users.write should generate per-env files when environments are present.
   - Suggested fix: setup_project/manage_users should detect environments in mcp-config.json and either generate template per-environment credential files (src/credentials/<env>.json) or document explicitly that the user must create them. Return paths of created env files.

8. npm install not executed after scaffolding / missing instruction.
   - Severity: Low → Medium (impacts developer experience)
   - Symptom: No npm install was run automatically and setup_project did not instruct to run it as a required next step.
   - Root cause hypothesis: setup_project currently scaffolds files but doesn't manage dependency installation or clear post-scaffold steps.
   - Suggested fix: either run package manager install automatically (with an option like --install) or include an explicit, prominent next-step instruction in the setup_project response (e.g. "Run npm install" and recommended package manager). Return whether install was run or skipped.

9. Missing separate WebdriverIO config files for iOS and Android.
   - Severity: Low → Medium
   - Symptom: setup_project created a single wdio.conf.ts but did not generate platform-specific configs (wdio.android.conf.ts, wdio.ios.conf.ts) despite mobile.platforms=both.
   - Root cause hypothesis: codegen.generateFiles or setup_project did not account for multi-platform scaffolding of config files.
   - Suggested fix: when platform is "both", generate platform-specific config stubs (wdio.android.conf.ts, wdio.ios.conf.ts) and document how to run platform-specific runs. Alternatively include template overrides and examples in README.

## Repro steps for maintainers
1. Run setup_project in a clean directory.
2. Open generated mcp-config.json → confirm CONFIGURE_ME placeholders.
3. Call manage_config.write to add profiles without removing placeholder keys → re-run setup_project to see validation error.
4. Attempt a replace_in_file deletion with an old read snapshot → observe exact-match failure.
5. Confirm manage_users.write produces credentials/users.json; verify helper generation.

## Files created by successful setup_project (observed)
- package.json
- tsconfig.json
- cucumber.js
- src/pages/BasePage.ts
- src/utils/ActionUtils.ts
- src/utils/WaitUtils.ts
- src/utils/MobileGestures.ts
- src/utils/LocatorUtils.ts
- src/utils/MockServer.ts
- src/step-definitions/hooks.ts
- src/features/sample.feature
- .gitignore
- wdio.conf.ts
- src/test-data/mock-scenarios.json

## Test users template
manage_users.write created credentials/users.json by default (strategy: unified-key). Additionally, per-environment files (src/credentials/<env>.json) were created in this repo to support easier environment-specific lookups and CI workflows.

Examples:

1) Single-file, grouped by env (credentials/users.json) — created by manage_users:
```json
{
  "local": [
    { "username": "admin",  "password": "ChangeMe123!", "role": "admin" },
    { "username": "buyer1",  "password": "BuyerPass123!",  "role": "buyer" }
  ],
  "staging": [
    { "username": "staging_admin", "password": "StagingChangeMe!", "role": "admin" }
  ]
}
```

2) Per-environment files (recommended for CI and least-privilege):
- src/credentials/local.json
- src/credentials/staging.json
- src/credentials/integration.json

Each per-env file contains a simple array:
```json
[
  { "username": "admin", "password": "ChangeMe123!", "role": "admin" }
]
```

Rationale for both approaches and why both were created here:
- manage_users.write produced credentials/users.json (root) automatically; however the mcp-config.json also lists environments (local, staging, integration). To satisfy the user's request for environment-specific credential files and to make test lookup deterministic, I created src/credentials/<env>.json files and a fallback reading helper (src/utils/getUser.ts) that prefers per-env files, then src/credentials/users.json, then root credentials/users.json.
- This duplication is deliberate:
  - Single grouped file is convenient for manual editing and central management.
  - Per-env files are simpler to inject into CI or secret management per pipeline/job.
  - The helper resolves in priority order so existing workflows continue to work.

Notes:
- All credential files created under src/credentials are intentionally simple JSON arrays for ease of use in tests.
- Files with real secrets should be replaced with secure secrets in CI or rotated immediately.
- Recommendation for MCP: detect environments in mcp-config.json and generate per-env template files (src/credentials/<env>.json) or provide a flag to manage_users.write that toggles per-env file generation.


## TypeScript reading helper (reference)
Save the file as `src/utils/getUser.ts` (example implementation). This helper is conservative and accepts multiple JSON shapes produced by tools:

```typescript
import fs from 'fs';
import path from 'path';

export type TestUser = { username: string; password: string; role?: string; [k: string]: any };

const USERS_FILE = path.resolve(__dirname, '../../credentials/users.json');

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Users file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function getAllUsers(env = 'local'): TestUser[] {
  const data = readJson(USERS_FILE);
  if (Array.isArray(data)) return data as TestUser[];
  if (data[env] && Array.isArray(data[env])) return data[env] as TestUser[];
  if (data.users && Array.isArray(data.users)) return data.users as TestUser[];
  const arr = Object.values(data).find(v => Array.isArray(v));
  if (arr) return arr as TestUser[];
  throw new Error('Unexpected users.json format — expected array or { env: [...] }');
}

export function getUserByUsername(username: string, env = 'local'): TestUser | undefined {
  return getAllUsers(env).find(u => u.username === username);
}

export function getUserByRole(role: string, env = 'local'): TestUser | undefined {
  return getAllUsers(env).find(u => u.role === role);
}

export default { getAllUsers, getUserByUsername, getUserByRole };
```

## Execution notes
- npm install attempt failed with a dependency conflict (ERESOLVE). Full summary:
  - Error: ERESOLVE unable to resolve dependency tree.
  - Cause: allure-cucumberjs@3.x requires @cucumber/cucumber >=10.8.0 while the scaffolded package.json initially had @cucumber/cucumber@10.3.2.
  - Logs: npm printed the ERESOLVE report and debug logs to the user's npm cache (see /Users/rsakhawalkar/.npm/_logs/* for details).
  - Actions taken:
    - Bumped @cucumber/cucumber to ^10.8.0 in package.json to satisfy the peer requirement.
    - Did not force-install with --legacy-peer-deps to avoid masking other conflicts.
  - Recommendations:
    - setup_project should either run package installation automatically (optionally with a --install flag) or clearly instruct the user and surface dependency conflicts and suggested resolutions.
    - Provide an optional flag to run installs with --legacy-peer-deps when needed, and return the raw npm output so users can triage.
    - If scaffolder maintains pinned versions, verify peer compatibility between scaffolded packages (e.g., allure-cucumberjs vs @cucumber/cucumber) before writing package.json.

- manage_users / environment behavior and why files were created:
  - Observation: manage_users.write created a single root credentials/users.json (this is the current tool behavior) but did not consult mcp-config.json.environments to auto-generate per-environment files.
  - Why I created extra files here:
    - The user requested environment-specific files; mcp-config.json also lists environments (local, staging, integration). To satisfy both the tool output and the user's request I created:
      1. credentials/users.json (root) — produced by manage_users.write (grouped by env).
      2. src/credentials/<env>.json (local, staging, integration) — per-env files created to make CI/job injection and least-privilege workflows easier.
    - This duplication ensures backward compatibility (single grouped file) while offering per-env simplicity for CI.
  - Recommendation for MCP:
    - manage_users.write should reference mcp-config.json.environments and either:
      - auto-generate per-env templates (src/credentials/<env>.json), or
      - provide an explicit flag such as "perEnv": true to create separate files.
    - When generating credentials, the tool should document which file(s) it created and where (absolute paths) and optionally generate a typed helper or return the helper path.

- User intent vs tool behavior (bug to record):
  - The user did not explicitly request "local" in chat; the tool should not assume environment names beyond what's in mcp-config.json. manage_users.write created a grouped root file by default but did not use mcp-config.json.environments to decide whether to create per-env files. This mismatch should be fixed (tool should consult mcp-config.json or ask the user).
  - Added as a bug: "manage_users does not consult mcp-config.json.environments and may create credential files without referencing project environments."

- Other issues found while running npm install:
  - Peer dependency conflict as described (allure-cucumberjs → @cucumber/cucumber).
  - Potential additional missing type packages reported by TypeScript after scaffolding (e.g., @wdio/types or other @wdio/* types) — these appear once you run npm install and can be fixed by installing the proper @wdio packages and types.
  - Recommendation: setup_project should either include a validated, consistent package.json or include an install step that surfaces and records dependency resolution problems.

## All issues encountered during setup (full list)
- Placeholder capability profile ("myDevice") remained in mcp-config.json and caused setup_project validation to return REQUIRED_FIELDS_MISSING (generic field names only). Root cause: placeholder entries were not removed or flagged with JSON pointers.
- replace_in_file failed once because the SEARCH block did not match the file snapshot (file changed between read and replace). Root cause: text-based exact-match edits are brittle for JSON; JSON-aware edit APIs would prevent this.
- setup_project validation messages were not scoped to JSON pointers or profile names, making remediation unclear.
- manage_users.write behavior:
  - Tool created a grouped root credentials/users.json but did not consult mcp-config.json.environments to auto-create per-environment files.
  - The tool did not explicitly return the path of a generated typed helper (getUser). This caused uncertainty about where tests should read credentials from.
- Credentials files created here:
  - manage_users created credentials/users.json (grouped by env).
  - I created per-env files under src/credentials (local.json, staging.json, integration.json) to satisfy environment-specific lookup and CI needs. This duplication was deliberate but should be tool-driven or optional.
- npm install dependency issues encountered:
  1. ERESOLVE: allure-cucumberjs required @cucumber/cucumber >=10.8.0 while scaffold had 10.3.2 — action: bumped @cucumber/cucumber to ^10.8.0.
  2. E404: @appium/uiautomator2-driver and @appium/xcuitest-driver packages were not found in the registry — action: replaced with appium-uiautomator2-driver and appium-xcuitest-driver.
  3. ERESOLVE: appium-xcuitest-driver required appium >=2.5.4 while project used 2.5.1 — action: bumped appium to ^2.5.4.
  - After the above fixes, npm install succeeded and added dependencies, but many deprecation warnings were printed.
- TypeScript/tooling issues:
  - New getUser helper initially reported TS errors: missing Node types and __dirname/import.meta typing issues.
  - Actions: updated tsconfig.json to include "types": ["node"] and adjusted getUser to resolve files via process.cwd()/path rather than relying on __dirname/import.meta in a fragile way. Installing @types/node (dev dep) resolved type errors during build.
- WDIO spec mismatch / test run failure:
  - What I ran:
    - npm run test:smoke -> executed `npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@smoke'`
  - Output observed:
    - WARN @wdio/config: pattern ./features/**/*.feature did not match any file
    - ERROR @wdio/cli: No specs found to run, exiting with failure
    - Result: 0 specs discovered, run exited with failure (no tests executed)
  - Immediate cause(s):
    - Generated wdio.conf.ts used spec glob "./features/**/*.feature" while generated feature file is at src/features/sample.feature (mcp-config.paths.featuresRoot = "src/features").
    - No active Appium session / device connection was attempted; even if specs were discovered, tests would fail without a device/session.
  - Actions taken here:
    - Created platform-specific stubs (wdio.android.conf.ts, wdio.ios.conf.ts) and updated docs recommending using mcp-config.paths.featuresRoot.
    - Suggested commands to validate after fixes:
      1. Update wdio.conf.ts specs to `${mcp-config.paths.featuresRoot}/**/*.feature` or use the provided platform stubs.
      2. npm run test:smoke (to verify spec discovery)
      3. Run check_environment (to validate Appium/device stack) then start_appium_session before executing tests.
  - Fix / recommendation: 
    - scaffolder must use mcp-config.paths.featuresRoot when generating runner configs so spec globs match generated features.
    - Provide a post-scaffold sanity step that runs "spec discovery" (dry run) and reports mismatches.
    - Document and optionally run check_environment and start_appium_session before attempting test runs.
- setup_project did not run npm install automatically nor prominently instruct to run it; this caused iterative manual fixes. Recommend an optional --install flag or clearer post-scaffold instructions.
- Missing platform-specific WDIO configs initially (wdio.android.conf.ts / wdio.ios.conf.ts). I added stubs, but scaffold should generate these when platform="both".
- Race conditions / file-change detection risk: tools modify files sequentially but do not warn when files changed since last read. Recommend file-hash/mtime checks before edits.
- Miscellaneous: many transitive packages printed deprecation warnings after install — recommend auditing pinned transitive deps in the scaffolder.

## mcp-config: provided vs expected (what MCP produced and what setup expected)
- Provided by mcp-config.json (present in repo):
  - project: language (typescript), testFramework (cucumber), client (webdriverio-appium), executionCommand.
  - mobile.defaultPlatform set to "android".
  - mobile.capabilitiesProfiles: contains myDevice (iOS data), android_emulator, ios_simulator.
  - paths.*: featuresRoot="src/features", pagesRoot="src/pages", stepsRoot="src/step-definitions", utilsRoot="src/utils", testDataRoot="src/test-data".
  - environments: ["local"] and currentEnvironment: "local".
  - credentials.strategy: "unified-key".
  - codegen properties: tagTaxonomy (includes @smoke,@regression,@P0,@critical), generateFiles="full".
  - reuse.locatorOrder, timeouts, selfHeal, reporting settings present.

- Fields/setup interactions that were expected by setup_project but not consumed or that caused issues:
  1. Placeholder handling: initial scaffold contained CONFIGURE_ME placeholders (mobile.*). setup_project expected concrete capability profiles (platformName, appium:app) when moving to phase 2; a leftover placeholder profile ("myDevice") caused REQUIRED_FIELDS_MISSING. manage_config.write did not remove or flag the placeholder automatically.
  2. Environments → credentials: mcp-config.environments listed "local" (and earlier versions contained staging/integration). setup_project/manage_users did not auto-generate per-environment credential files (src/credentials/<env>.json) despite environments being present. manage_users.write created a grouped credentials/users.json only. The tool should consult mcp-config.environments or offer a per-env flag.
  3. paths.featuresRoot not honored: mcp-config.paths.featuresRoot = "src/features", but generated wdio.conf.ts used a default spec pattern ("./features/**/*.feature"), causing "No specs found" when running tests. setup_project should use paths.* when generating runner configs.
  4. Reporting / helpers: mcp-config.reporting.format present, but manage_users did not report creation path for any typed helper; setup_project/manage_users should return explicit created helper path (e.g., src/utils/getUser.ts).
  5. Validation details: setup_project reported missing fields generically; it did not return JSON pointers (e.g., mobile.capabilitiesProfiles.myDevice.appium:app) which would make fixes straightforward.
  6. Post-scaffold actions: mcp did not indicate whether it would run dependency installation; setup_project response did not include a clear instruction to run package installation or an --install option.

- Summary: MCP produced a complete-looking config file, but several actionable items expected by the scaffolder (honoring featuresRoot, auto-generating per-env credentials, removing placeholders, returning precise JSON pointers and helper paths, and offering an install option) were not performed or reported. These gaps caused iterative manual fixes documented above.

## Where I fixed things in this run
- Updated package.json to resolve peer and registry issues (bumped @cucumber/cucumber, replaced unavailable @appium packages, bumped appium).
- Created per-env credential files under src/credentials and updated src/utils/getUser.ts to prefer per-env files.
- Added wdio.android.conf.ts and wdio.ios.conf.ts stubs.
- Updated tsconfig.json to include Node types.

## Recommended actionable changes for MCP (summary)
- Consult mcp-config.json.environments when generating credentials; offer a per-env generation flag.
- Produce JSON-aware configuration edit APIs (upsert/delete by JSON path).
- Validate package.json dependency/peer-compatibility before writing and optionally run install with a user-approved flag.
- Generate WDIO configs that honor mcp-config.paths (featuresRoot) and platform targets.
- Surface helpful validation errors with JSON pointers to offending fields.

## Next steps / recommended action items
- [MCP] Add a JSON-aware edit API (upsert/delete by path) to avoid brittle text-replace operations.
- [MCP] Improve setup_project validation messages to include JSON pointers and offending profile names.
- [MCP] Ensure manage_users.write reads mcp-config.json.environments and either generates per-env templates or documents required manual steps.
- [MCP] Consider adding an optional --install flag to setup_project to run package installation and report results.
- [MCP] Validate package.json dependency compatibility before writing it; surface peer conflicts early.
- [Repo owner] Confirm credentials files and rotate placeholder passwords.
- [Repo owner] Approve creation of `src/utils/getUser.ts` (already created) and adjust if needed.

## Additional MCP expectations to make scaffolding seamless
- Auto-generate per-environment credential templates when mcp-config.json.environments is present (or prompt user) and return created file paths.
- Honor mcp-config.paths (featuresRoot, pagesRoot, stepsRoot, utilsRoot) when generating runner/config files and feature/step locations.
- Generate platform-specific runner configs automatically when platform="both" (wdio.android.conf.ts, wdio.ios.conf.ts) and document run commands.
- Offer an optional --install flag to run package installation, with a follow-up report containing raw installer output and any dependency conflicts.
- Validate dependency/peer compatibility before writing package.json; surface suggested fixes or automatically pick compatible versions with user consent.
- Emit machine-readable filesCreated and helperPaths in setup_project/manage_users responses so IDEs and scripts can react.
- Provide JSON-aware config mutations (upsert/delete by JSON pointer) and file-change detection (compare mtime/hash) before applying edits.
- Create onboarding README / next-steps file after scaffold listing commands: npm install, check_environment, start_appium_session, run tests, and CI workflow suggestion.
- Option to generate CI workflow (GitHub Actions) that runs a smoke job using per-env credentials and exposes artifacts.
- Generate typed helper stubs (e.g., src/utils/getUser.ts) or return the path when manage_users writes credentials.
- Optionally run basic checks after scaffold: npm install (if allowed), run linter/typecheck, and run a dry test spec discovery to ensure spec patterns match.
- Provide a "dry-run" mode for setup_project that validates config, package compatibility, and file collisions without writing files.

These additions will reduce manual iterations and make scaffolded projects runnable immediately.

