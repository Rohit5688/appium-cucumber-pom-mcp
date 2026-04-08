## AppForge Autonomous Agent Protocol

This project is optimized for "Street-Smart" AI collaboration. All agents MUST follow the **Universal Agent Working Protocol** below, in addition to AppForge-specific structural rules.

### 🏠 AppForge structural rules
- **Map-Based Navigation**: Read `graphify-out/graph.json` to identify exact line numbers for methods before searching.
- **Silent Graph Sync**: After modifying codebase structure or adding tools, run: `python build_appforge_graph.py`.
- **Turbo Mode**: Use `execute_sandbox_code` script via MCP for all heavy analysis.

---

# 🌐 Universal Agent Working Protocol
**Status**: Active / Mandatory for all projects.

## ⚡ 1. Token-Aware Planning
1. **Turbo Analysis**: ALWAYS use targeted `grep` or sandbox execution. DO NOT read large source files (>500 lines) multiple times.
2. **Context Maintenance**: Break large tasks into sequential, atomic tool calls.
3. **No-Incomplete-Write**: NEVER start a write you cannot complete within the token limit.

## 🔍 2. Atomic Implementation
1. **Granular Bug Fixes**: Audit -> Analyze -> Minimal Fix -> Verify.
2. **Breadth-First Validation**: Proactively search for the same vulnerable pattern across similar components.
3. **Avoid Breaking Changes**: File all dependent files first; use Adapters if a change is too large for one turn.
4. **Verification**: Always verify logic with a secondary check (compiling, tests, or logs).

## 🛠️ 3. Generation-Aware Maintenance
1. **Sync Prompts with Fixes**: Update instruction templates if they caused the bug.
2. **Preserve Knowledge**: Document "gotchas" immediately in design docs or KI files.
3. **No Placeholders**: NEVER generate `// TODO` or stubs. Every write must be production-ready.

## 🛡️ 4. Security & Environment First
1. **No Raw Interpolation**: Sanitize all shell inputs.
2. **Use Sanitization Helpers**: Use platform-aware quoting (Windows `""` / Unix `\`).
3. **Environment Agnostic**: Detect local environment (e.g., `package-lock.json`) before running commands.

## 🧹 5. Explicit Resource Lifecycle
1. **Finally-First Architecture**: Use `try/finally` for cleanup of temp files/processes.
2. **Guaranteed Deletion**: Robust cleanup logic handling locked or missing objects.
3. **State Reset**: Delete orphaned artifacts if a task fails.

## 🧩 6. Data-Chain Validation
1. **Schema Enforcement**: Explicitly enforce schemas for API payloads and configs.
2. **Schema Verification**: Verify generated structures matches the expected schema before committing.

## 🛡️ 7. Defensive Boundary Crossing
1. **Never Throw to the Host**: Wrap top-level handlers in `try/catch`.
2. **Graceful Degradation**: Fallback gracefully if external deps fail to load.
3. **Null-Safety**: Null-check all host environment variables and state.

## 🔁 8. Idempotency & Re-entrancy
1. **Safe File Operations**: Check existence before writing; only create if missing.
2. **Intelligent Merging**: Merge partial config properties instead of overwriting.
3. **Process Recycling**: Check for and kill previous instances/ports before spawning.

## 📡 9. Observability First
1. **Persistent Logging**: Log critical steps and stacks to `stderr` or log files, not just UI.
2. **Verbose Tool Output**: Return the actual cause and stack trace on failure.

## ✂️ 10. Diff-Based Token Editing
1. **No Full-File Rewrites**: NEVER rewrite files >50 lines.
2. **Minimal Replacement**: Replace only impacted lines to prevent regressions.
3. **Surgical Imports**: Only import exact classes/functions needed.

## 📦 11. Dependency and Architecture Isolation (The "Implicit Wrapper" Rule)
To prevent runtime conflicts, duplicate singletons, and corrupted module resolution:
1. **Respect Wrapper Architectures**: If the project uses a wrapper framework/meta-framework (e.g., a library that wraps a core runner, or an SDK that wraps an API), DO NOT manually install the underlying base dependency.
2. **Peer Dependencies**: Treat the underlying framework as an implicit peer dependency provided by the wrapper. Duplicating dependencies across `node_modules` or identical binary paths causes strict architectural failures.

## 🧠 12. Universal Self-Learning (The "Global Brain" Rule)
To prevent "Groundhog Day" engineering, every session must conclude with a knowledge deposit:
1. **Capture**: Identify the primary problem faced, the solution, and new project patterns.
2. **Deposit**: Invoke the `train_on_example` tool to save these insights.
3. **Silent Sync**: Tool automatically triggers a sync to the Global Knowledge Base.
