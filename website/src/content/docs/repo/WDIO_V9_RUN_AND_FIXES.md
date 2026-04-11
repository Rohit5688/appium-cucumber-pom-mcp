---
title: "🔌 WDIO v9: Run Guide & Required Fixes"
---

Summary
- Do not run the shared/base config (wdio.shared.conf.ts) directly — WDIO requires a final config object containing a `capabilities` property. Use platform-specific configs (wdio.android.conf.ts / wdio.ios.conf.ts).
- This document explains cross-platform commands (POSIX / PowerShell / CMD), recommended npm scripts, code fixes (step defs, hooks, tsconfig), and an implementation plan for run_Cucumber_test.

Why wdio.shared.conf.ts fails
- wdio.shared.conf.ts exports a Partial config (shared settings) and intentionally omits `capabilities`. WDIO's config parser will error: "No `capabilities` property found".

Recommended run commands (cross-platform)

- POSIX (macOS / Linux / WSL / Git Bash)
```bash
# Android
WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.android.conf.ts

# iOS
WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.ios.conf.ts

# Sequential both (POSIX)
WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.android.conf.ts && WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.ios.conf.ts
```

- PowerShell
```powershell
# set env for the session and run sequentially
$env:WDIO_CUCUMBER_OPTS_TAGS = '@smoke'
npx wdio run wdio.android.conf.ts
npx wdio run wdio.ios.conf.ts
```

- Windows CMD
```cmd
rem set env for the command then run
set "WDIO_CUCUMBER_OPTS_TAGS=@smoke" && npx wdio run wdio.android.conf.ts && npx wdio run wdio.ios.conf.ts
```

Cross-platform npm script (recommended)
- Install cross-env (dev dep) to standardize env setting:
```bash
npm install --save-dev cross-env
```

- package.json scripts (example)
```json
{
  "scripts": {
    "test:android": "cross-env WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.android.conf.ts",
    "test:ios": "cross-env WDIO_CUCUMBER_OPTS_TAGS='@smoke' npx wdio run wdio.ios.conf.ts",
    "test:both": "npm run test:android --silent && npm run test:ios --silent"
  }
}
```
- `test:both` will run sequentially and is cross-platform when using npm scripts.

Alternative: Node orchestration script (cross-platform, no extra deps)
- Create `scripts/run-both.js`:
```javascript
// javascript
const { spawn } = require('child_process');

function run(config, tags) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, WDIO_CUCUMBER_OPTS_TAGS: tags };
    const p = spawn('npx', ['wdio', 'run', config], { stdio: 'inherit', shell: true, env });
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${config} failed (${code})`)));
  });
}

(async () => {
  try {
    await run('wdio.android.conf.ts', '@smoke');
    await run('wdio.ios.conf.ts', '@smoke');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
```
- Call: `node scripts/run-both.js`

Code fixes required (apply to scaffold + user project)
1. Step definitions
   - Replace imports:
```typescript
// before
import { Given, When, Then } from '@cucumber/cucumber';

// after
import { Given, When, Then } from '@wdio/cucumber-framework';
```

2. Hooks (use WDIO hook signatures and `this`)
   - Use `this`-based hook functions and explicit `this: any` typing to avoid TS implicit-any errors:
```typescript
// typescript
import { Before, After } from '@wdio/cucumber-framework';

Before(async function (this: any) {
  console.log(`Starting: ${this.pickle?.name}`);
});

After(async function (this: any) {
  try {
    const shot = await AppiumDriver.takeScreenshot();
    if (shot) await this.attach(Buffer.from(shot, 'base64'), 'image/png');
  } catch (e) { console.error(e); }
});
```
   - Do NOT use the earlier two-argument signature (world, context) unless you install & type the correct WDIO/Cucumber types — the `this` pattern is simplest and compatible.

3. tsconfig.json
   - Ensure tsconfig includes WDIO types to avoid editor/ts issues:
```json
{
  "compilerOptions": {
    "types": ["node", "@wdio/globals", "@wdio/types"]
  }
}
```
   - Keep "module": "ES2022" and "moduleResolution": "node" as in your working project.

4. Shared config usage
   - Never run wdio.shared.conf.ts directly. Ensure tooling maps defaultPlatform → platform config.
   - In generated README / package.json scripts, reference platform-specific configs.

run_Cucumber_test tool behavior (implementation notes)
- Input: projectRoot, tags, optional platform override
- Logic:
  - Read `mcp-config.json` → `mobile.defaultPlatform`
  - Map:
    - android → `wdio.android.conf.ts`
    - ios → `wdio.ios.conf.ts`
    - both → run android then ios sequentially (default) or spawn parallel if requested
  - Execute each run via child process with env WDIO_CUCUMBER_OPTS_TAGS set to provided tags
  - Aggregate outputs and return structured result: { platform, success, exitCode, reportPaths }
- Platform quirks:
  - Use cross-env in npm scripts or spawn child processes with explicit env in Node (recommended).
  - Prefer sequential runs for determinism and simpler report aggregation.

Validation checklist (what to test after fixes)
- [ ] Update step-def imports and hooks; run `tsc` (or open editor) — no TS errors
- [ ] Run `npx wdio run wdio.android.conf.ts` (Android)
- [ ] Run `npx wdio run wdio.ios.conf.ts` (iOS)
- [ ] Run cross-platform `npm run test:both` (if scripts added)
- [ ] Run `run_Cucumber_test` tool (if implemented) and verify aggregated results and artifacts

Troubleshooting tips
- If you still see "No capabilities" error, open the config file you ran and confirm it exports a `capabilities` array/object.
- If `this.attach` is undefined in hooks, check that you're using `@wdio/cucumber-framework` and WDIO v9 packages; `this` is the Cucumber world.
- For Windows quoting issues, prefer cross-env or node orchestration to avoid shell-specific quoting.
 
References
- WebdriverIO docs: https://webdriver.io
- @wdio/cucumber-framework docs
- cross-env: https://www.npmjs.com/package/cross-env


## Status: Scaffold dependency fix

Done
- Updated src/services/ProjectSetupService.ts: scaffoldPackageJson now pins "@cucumber/cucumber": "9.6.0" and adds "allure-cucumberjs": "^2.15.2".
- CHANGELOG.md already documents the downgrade.

Pending verification
- Run AppForge build: `npm run build`
- Run unit tests / type-check: `npm test`
- Generate a scaffolded project (setup_project) and, inside that new project:
  - `npm install`
  - `npm run test:smoke`
- Capture and report any npm ERESOLVE or peer-dependency errors observed during install.

Progress
- [x] Updated scaffold template
- [ ] Build AppForge (npm run build)
- [ ] Run AppForge tests (npm test)
- [ ] Verify scaffolded project installs and smoke test