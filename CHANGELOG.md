# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Dependency Conflict**: Downgraded `allure-cucumberjs` from `^3.0.0` to `^2.15.2` in project scaffold template to resolve npm ERESOLVE conflict. `allure-cucumberjs@3.x` requires `@cucumber/cucumber >=10.x`, but the scaffold correctly uses `@cucumber/cucumber@9.6.0` for WDIO compatibility.
- **Phase 1 Documentation**: Fixed setup_project Phase 1 to create MCP documentation files (`docs/MCP_CONFIG_REFERENCE.md` and `docs/APPFORGE_PROMPT_CHEATBOOK.md`) immediately so users can reference them while filling mcp-config.json.
- **Phase 2 WDIO Config**: Fixed wdio.conf.ts generation in Phase 2 to properly read user's configured capabilities from mcp-config.json instead of always using fallback defaults. Now correctly reflects device/app settings user specified in Phase 1.

### Improved
- **Phase 1 User Experience**: Users now have access to complete documentation during Phase 1 configuration, improving self-service and reducing confusion about mcp-config.json fields.
- **Config-Driven Scaffolding**: wdio configuration files now truly reflect user's mcp-config.json settings from Phase 1, eliminating the need to manually edit generated wdio configs.

## [2.0.1] - 2026-01-04

### Fixed
- **Critical Scaffold Bug**: wdio.conf.ts now correctly reads capabilities from mcp-config.json instead of using hardcoded values. Previously, scaffolded projects always generated iOS configurations regardless of user's platform choice.
- **Platform Mismatch**: Both single-platform (wdio.conf.ts) and multi-platform (wdio.android.conf.ts, wdio.ios.conf.ts) configs now properly match the platform specified in mcp-config.json.
- **Appium Logging**: Added Appium service configuration to all wdio configs with `logPath: './appium.log'` to help debug connection issues. Logs are now written to project root automatically.

### Improved
- **Config-Driven Scaffolding**: wdio configs are now truly config-driven - when users fill mcp-config.json Phase 1, Phase 2 scaffolding generates configs with their exact device/app settings.
- **Debugging Support**: Appium server logs are now captured to `appium.log` (single-platform) or `appium-android.log`/`appium-ios.log` (multi-platform).

### Notes
- This patch resolves issues found during fresh project scaffolding where generated wdio.conf.ts contained wrong platform capabilities.
- Existing projects scaffolded with v2.0.0: Run `upgrade_project` to regenerate wdio configs with proper capability reading.

## [2.0.0] - 2026-01-04

### Breaking Changes
- **Dependency Version**: Changed `@cucumber/cucumber` from `^10.8.0` to `9.6.0` for compatibility with `@wdio/cucumber-framework@8.29.1`. Existing projects must update their `package.json` manually.
- **npm Scripts**: Updated all test scripts to use `--cucumberOpts.tags` instead of deprecated `--cucumberOpts.tagExpression`. See [MIGRATION_v2.md](MIGRATION_v2.md) for upgrade instructions.

### Added
- **Runnable Smoke Test**: New scaffolded projects now include complete dummy smoke test files (`sample.steps.ts`, `LoginPage.ts`) that auto-pass to verify setup immediately after `npm install`.
- **Setup Verification Step**: Added `npm run test:smoke` verification instruction to setup completion message.
- **Environment Fail-Fast Guard**: `run_cucumber_test` now validates environment readiness before spawning test process, failing in <1s instead of 120s timeout when device/emulator offline.
- **Migration Guide**: Added comprehensive [MIGRATION_v2.md](MIGRATION_v2.md) with upgrade paths for existing projects.

### Fixed
- **Critical Runtime Error**: Fixed "You're calling functions (e.g. 'BeforeAll') on an instance of Cucumber that isn't running" error caused by Cucumber 10.x incompatibility with WDIO Cucumber framework.
- **Appium Detection**: Enhanced `check_appium_ready` to accept multiple Appium server response schemas, eliminating false-negative "Appium not ready" errors.
- **Deprecation Warnings**: Eliminated "tagExpression is deprecated" warnings in test output.

### Improved
- **Token Efficiency**: Environment validation prevents wasting 2+ minutes on doomed test runs when device/emulator unavailable.
- **LLM Verification**: LLMs can now immediately verify scaffolded projects work out-of-the-box with `npm run test:smoke`.
- **Error Messages**: Environment check failures now provide clear, actionable error messages with fix hints.

### Notes
- All issues identified during live MCP testing have been resolved
- Projects scaffolded with v2.0 are production-ready without manual fixes
- See [MIGRATION_v2.md](MIGRATION_v2.md) for detailed upgrade instructions

## [1.0.0] - 2026-04-05
### Added
- Initial release of AppForge MCP Server
- Mobile automation orchestration with Cucumber BDD
- Project setup and test generation capabilities
- Self-healing locators based on test output
- Automated Appium session management
