# Migrating to AppForge 2.0

## Overview

AppForge 2.0 resolves critical issues found during production testing and improves reliability for LLM-driven test generation and execution.

---

## Breaking Changes

### 1. Cucumber Dependency Downgrade

**Change**: `@cucumber/cucumber` version changed from `^10.8.0` → `9.6.0`

**Why**: The `@wdio/cucumber-framework@8.29.1` package has a peer dependency on Cucumber 9.x. Using Cucumber 10.x caused runtime errors:
```
You're calling functions (e.g. "BeforeAll") on an instance of Cucumber that isn't running
```

**Impact**: 
- ✅ **New projects**: Automatically get the correct version
- ⚠️ **Existing projects**: Must update manually

**Migration Steps for Existing Projects**:

1. Update `package.json`:
   ```json
   {
     "dependencies": {
       "@cucumber/cucumber": "9.6.0"
     }
   }
   ```

2. Run:
   ```bash
   npm install
   ```

3. Verify no peer dependency warnings appear

---

### 2. npm Script Tag Parameter Update

**Change**: All test scripts now use `--cucumberOpts.tags` instead of deprecated `--cucumberOpts.tagExpression`

**Before** (v1.x):
```json
{
  "scripts": {
    "test:smoke": "npx wdio run wdio.conf.ts --cucumberOpts.tagExpression='@smoke'"
  }
}
```

**After** (v2.0):
```json
{
  "scripts": {
    "test:smoke": "npx wdio run wdio.conf.ts --cucumberOpts.tags='@smoke'"
  }
}
```

**Migration Steps**:

1. Open `package.json`
2. Find/replace: `tagExpression` → `tags`
3. Save and test: `npm run test:smoke`

**Impact**: Eliminates deprecation warnings in test output

---

## New Features

### 1. Runnable Smoke Test (Out-of-the-Box Verification)

New scaffolded projects now include a complete dummy smoke test:

- `src/step-definitions/sample.steps.ts` - Auto-passing step implementations
- `src/pages/LoginPage.ts` - Sample Page Object
- `src/features/sample.feature` - Already existed, now has matching steps

**Usage**:
```bash
npm install
npm run test:smoke  # ✅ Passes immediately - verifies setup works
```

**Benefits**:
- LLMs can verify environment setup instantly
- New developers see a working example
- Reduces "is it working?" confusion

---

### 2. Enhanced Appium Detection

The `check_appium_ready` tool now accepts multiple Appium server response formats:

- Standard Appium 2.x: `{ value: { ready: true } }`
- Legacy format: `{ status: 0 }`
- Any non-empty value object (handles version variations)

**Impact**: Eliminates false-negative "Appium not ready" errors when the server is actually running.

---

### 3. Environment Fail-Fast Guard

The `run_cucumber_test` tool now validates environment readiness **before** spawning the test process.

**Before** (v1.x):
- Starts test execution
- Waits 60-120 seconds for Appium to boot
- Times out if device offline

**After** (v2.0):
- Checks environment in <1 second
- Fails immediately with clear error if device offline
- Only spawns process if environment ready

**Impact**: Saves 2+ minutes per failed run, provides actionable error messages.

---

## Upgrade Path

### For New Projects

No action needed. Run `setup_project` and you'll automatically get v2.0 improvements.

### For Existing Projects (Created with v1.x)

#### Option 1: Quick Fix (Minimal Changes)

Update only the breaking changes:

```bash
# 1. Update Cucumber version
npm install @cucumber/cucumber@9.6.0

# 2. Update npm scripts in package.json
#    Replace: tagExpression → tags (see Breaking Change #2 above)

# 3. Verify
npm run test:smoke
```

#### Option 2: Full Upgrade (Recommended)

Get all v2.0 improvements:

```bash
# 1. In your project root
cd /path/to/your/project

# 2. Run upgrade (from AppForge MCP)
# Call: upgrade_project({ projectRoot: "/path/to/your/project" })

# This will:
# - Update mcp-config.json schema
# - Repair missing baseline files
# - Update dependencies in package.json
# - Add sample smoke test files (if missing)
```

---

## Testing Your Migration

After migrating, verify everything works:

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Verify no peer dependency warnings
# (Should see no Cucumber-related warnings)

# 3. Run smoke test
npm run test:smoke

# 4. Run your actual tests
npm test
```

---

## Rollback (If Needed)

If you encounter issues with v2.0:

```bash
# 1. Revert package.json changes
git checkout HEAD -- package.json

# 2. Reinstall
npm install

# 3. Report the issue
# Use GitHub Issues: https://github.com/ForgeTest-AI/AppForge/issues
```

---

## Support

- **Documentation**: See `docs/` folder in AppForge repo
- **Issues**: https://github.com/ForgeTest-AI/AppForge/issues
- **Prompt Cheatbook**: `docs/APPFORGE_PROMPT_CHEATBOOK.md`

---

## Summary of Changes

| Area | v1.x | v2.0 | Impact |
|------|------|------|--------|
| Cucumber version | `^10.8.0` | `9.6.0` | ⚠️ Breaking - update package.json |
| npm script tags | `tagExpression` | `tags` | ⚠️ Breaking - update scripts |
| Smoke test | Not included | Included | ✅ New - auto-pass verification |
| Appium detection | Strict schema | Flexible | ✅ Improved - fewer false negatives |
| Environment check | After spawn | Before spawn | ✅ Improved - fails fast |

---

**Published**: 2026-01-04  
**AppForge Version**: 2.0.0