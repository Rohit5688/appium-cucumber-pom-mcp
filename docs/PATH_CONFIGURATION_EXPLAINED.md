# PATH Configuration — explanation and examples

This document explains the new `paths.*` section in `mcp-config.json`, how defaults are resolved, migration behavior, and recommended patterns.

## Principles
- All paths are relative to the project root.
- The MCP config is the single source of truth for directory locations.
- Empty / missing keys fall back to conservative defaults (safe, conventional).
- Migration is non-destructive: old configs are backed up and migrated idempotently.

## Keys supported (paths.*)
- featuresRoot — default: `src/features`
- pagesRoot — default: `src/pages`
- stepsRoot — default: `src/step-definitions`
- utilsRoot — default: `src/utils`
- locatorsRoot — default: `src/locators`
- testDataRoot — default: `src/test-data`
- credentialsRoot — default: `src/credentials`
- reportsRoot — default: `reports`
- configRoot — default: `src/config`

## Resolution rules
1. If `paths.<key>` is present, use it verbatim (relative to project root).
2. If `paths.<key>` is missing, use the service-provided default.
3. When users provide a short name (e.g., `"features": "features"`), migration will check for `src/<value>` and prefer `src/<value>` if that directory exists — this preserves common expectations.
4. Absolute paths are supported (not recommended for repo portability).
5. All tools read `McpConfigService.getPaths(config)` and use the resolved values.

## Examples

Minimal config (uses defaults):
```json
{
  "project": { "language": "typescript" },
  "mobile": { "defaultPlatform": "android", "capabilitiesProfiles": {} }
}
```

Customizing some roots:
```json
{
  "paths": {
    "featuresRoot": "test/e2e/features",
    "pagesRoot": "app/pages",
    "credentialsRoot": "infra/credentials"
  }
}
```

Full example (migrated form):
```json
{
  "version": "1.1.0",
  "schemaVersion": "1.0",
  "paths": {
    "featuresRoot": "src/features",
    "pagesRoot": "src/pages",
    "stepsRoot": "src/step-definitions",
    "utilsRoot": "src/utils",
    "locatorsRoot": "src/locators",
    "testDataRoot": "src/test-data",
    "credentialsRoot": "src/credentials",
    "reportsRoot": "reports",
    "configRoot": "src/config"
  }
}
```

## Migration notes
- `migrateIfNeeded(projectRoot)` will:
  - Create `.AppForge/` if missing.
  - Create a timestamped backup: `.AppForge/mcp-config.backup.<iso>.json`.
  - Normalize legacy bare path values (`"features": "features"`) to `src/...` when appropriate.
  - Write `schemaVersion` and set `$schema` to `./.AppForge/configSchema.json`.
  - Generate `.AppForge/configSchema.json` (idempotent).
  - Append a line to `.AppForge/migration.log`.
- Migration is idempotent and safe to call from setup/upgrade flows.

## Tooling impact
- Project scaffolding, code generators, analyzers, and locator audits now call `McpConfigService.getPaths()` and operate on those resolved paths.
- Tests and user scripts should reference paths via config (or via helpers that call `McpConfigService`) instead of hardcoded `src/...` locations.

## Recommended practices
- Prefer repository-relative values (no absolute paths).
- If you have an existing repo that already uses `src/<name>`, it's fine to leave values empty — migration will preserve/normalize.
- When sharing the repo, ensure `paths.*` reflects repository layout for contributors (makes IDEs and generators deterministic).

## Troubleshooting
- If IDE autocomplete for `mcp-config.json` is missing, ensure `.AppForge/configSchema.json` exists (setup or migration will create it).
- If migration ran but you see unexpected paths, restore the backup from `.AppForge/mcp-config.backup.<iso>.json` and re-run migration after adjusting any manual values.