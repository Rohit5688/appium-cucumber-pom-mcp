# PATH Configuration — Explanation and Examples

This document explains the `paths.*` section in `mcp-config.json`, how defaults are resolved, migration behavior, and recommended patterns.

---

## 🏗️ 1. Principles
- **Relative Basis**: All paths are relative to the project root.
- **Single Source of Truth**: The MCP config is the authority for directory locations.
- **Conservative Defaults**: Empty keys fall back to safe, conventional defaults (e.g., `src/pages`).
- **Non-destructive Migration**: Old configs are backed up before being updated to the newest schema.

---

## 🛠️ 2. Keys Supported (paths.*)

| Key | Default | Description |
| :--- | :--- | :--- |
| `featuresRoot` | `src/features` | Where `.feature` Gherkin files live. |
| `pagesRoot` | `src/pages` | Where Page Object `.ts` files live. |
| `stepsRoot` | `src/step-definitions` | Where step definition `.ts` files live. |
| `utilsRoot` | `src/utils` | Where shared helpers live. |
| `locatorsRoot` | `src/locators` | Where YAML locator dictionaries live. |
| `testDataRoot` | `src/test-data` | Where generated test data/mocks live. |
| `credentialsRoot`| `src/credentials` | Where secure user JSONs live. |
| `reportsRoot` | `reports` | Target for test execution outputs. |
| `configRoot` | `src/config` | Location of custom TS/JSON config files. |

---

## 🔄 3. Resolution Rules

1.  **Verbatim Use**: If `paths.<key>` is present, AppForge uses it exactly as specified.
2.  **Service Defaults**: If missing, the app uses the defaults listed above.
3.  **Smart Migration**: When migrating legacy configs (e.g., `"features": "features"`), the system checks if `src/features` exists. If it does, it prefers `src/features` to preserve established directory conventions.
4.  **Absolute Path Support**: Supported but **strongly discouraged** for repository portability.

---

## 🚚 4. Migration Behavior

When `upgrade_project` or `setup_project` runs, the `McpConfigService` will:
- Create a backup in `.AppForge/mcp-config.backup.<timestamp>.json`.
- Normalize legacy paths to the `src/` prefix if standard folders are detected.
- Generate `.AppForge/configSchema.json` to enable IDE autocompletion.
- Log the migration details in `.AppForge/migration.log`.

---

## 💡 5. Recommended Practices

- **Avoid Absolute Paths**: Always use repo-relative paths to ensure the project works for other team members.
- **Explicit vs. Implicit**: If your repo structure is highly non-standard, define all paths explicitly to prevent generation errors.
- **IDE Sync**: Ensure `.AppForge/configSchema.json` is generated; this allows VS Code/Cursor to provide intellisense while editing `mcp-config.json`.
