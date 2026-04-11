---
title: "🏛️ AppForge System Architecture"
---

AppForge is designed as a highly modular, scalable Model Context Protocol (MCP) server that empowers AI agents to autonomously build, execute, and self-heal mobile automation frameworks.

This document provides a high-level overview of the most recent architectural upgrades (Phase 13), ensuring contributors and AI agents can seamlessly extend the platform.

---

## 🧩 1. The Decoupled Tool Handler Design (`src/tools/`)

Historically, the AppForge MCP server operated as a monolithic `index.ts` file. As the ecosystem ballooned to 33 individual tools, the server was refactored. 

### Current Structure:
*   **`src/tools/`**: Every tool is now an isolated handler. This allows each capability (e.g., `generate_cucumber_pom`, `migrate_test`, `check_environment`) to manage its own Zod schema parsing and logic safely.
*   **`src/index.ts`**: Now acts strictly as the router—wiring up dependency injections, registering tools with the `@modelcontextprotocol/sdk`, and delegating the payload.

> [!TIP]
> **Extending AppForge**: To add a new capability, create a cohesive handler in `src/tools/[tool_name].ts`, define its Zod input schema, and map it in `index.ts`.

---

## 🧠 2. Concurrency via `SessionManager`

Parallel AI agents working on multiple test generation tasks previously collided by overriding static Appium sessions. AppForge now relies on the `SessionManager` pattern:

*   **Project-Scoped Pool**: Connections are stored in an active map keyed by the user's project path.
*   **Idle Cleanups**: In-memory timers monitor session inactivity. Abandoned WebDriver instances are automatically terminated to prevent memory leaks or locked ports across CI pipelines.
*   **Health Telemetry**: The AI can execute `get_session_metrics` to actively diagnose whether device pools are exhausted or healthy.

---

## 📈 3. Emitting Structured Content for Automation

By default, LLMs receive text-based markdown outputs from MCP tools. However, integrating AppForge into fully programmatic CI/CD pipelines requires robust schema adherence.

*   Priority tools (e.g., test execution, environment validation) now yield a `structuredContent` JSON payload.
*   The raw structured object can be consumed directly by an upstream non-LLM orchestration layer without requiring brittle Regex text parsing on standard error channels.

---

## 📝 4. Unified Observability (`Logger` Utility)

Raw `console.log` and `console.warn` traces were completely removed from the ecosystem.

*   AppForge uses a centralized `Logger` class.
*   **Why?** The custom logger prefixes domain execution blocks (e.g., `[AppForge] [SessionManager]`), standardizes error shape objects down to their stack traces, and prepares the platform for remote metrics ingestion.

> [!IMPORTANT]
> When modifying AppForge source code, always import the native `Logger` to guarantee your debugging paths match the host application's standardized telemetry.