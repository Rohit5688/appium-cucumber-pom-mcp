---
title: "📊 Observability & System Metrics"
---

AppForge includes built-in observability mechanisms designed to keep AI loops informed, provide structured telemetry, and prevent hanging sessions in CI/CD environments.

---

## 📋 The `Logger` Utility
AppForge no longer uses raw `console.log` or `console.error` for outputting system information. It utilizes a `Logger` utility that normalizes system outputs, making it much easier to track down errors, especially during live debug sessions and when aggregating CI logs.

### Key Benefits of the Unified Logger:
*   **Structured Output:** Standardized layouts that decouple the raw data from formatting, ensuring logs integrate cleanly with platforms like Datadog or ELK.
*   **Domain Prefixing:** Every log entry is prefixed with its associated domain (e.g., `[AppForge] [SessionManager]`, `[AppForge] [AuditLocator]`). This instantly identifies the system component responsible for an event.
*   **Stack Trace Isolation:** Standardizes Javascript Error tracking to remove ambiguous console dumps, outputting pure actionable traces.

> [!IMPORTANT]
> When investigating a failed Appium agent task or bug using the terminal, always check the `[AppForge] [*]` prefixed logs. They provide a high-level summary of what happened.

---

## 📈 System Concurrency: `SessionManager`
When large test suites generate multiple parallel tasks, AppForge intelligently allocates sessions without overriding active ones, thanks to the `SessionManager` singleton.

*   **Project-Scoped Pooling:** Connects WebdriverIO instances scoped completely to your `projectRoot`. This allows parallel repositories to be tested on the same host machine without collisions.
*   **Idle Cleanups:** Long-running LLM generation gaps occasionally abandon active WebdriverIO commands. The `SessionManager` detects idle connections and terminates them gracefully, freeing up memory and device connections.

---

## 📊 The `get_session_metrics` Tool
AI agents (and curious devs) can call `get_session_metrics` to perform a health check on the active AppForge environment. 

**This tool provides:**
1.  **Memory Load:** Information about active vs idle sessions in the memory pool.
2.  **Concurrency State:** Identifies if maximum Appium or device connection thresholds are near exhaustion.
3.  **Project Mapping:** Detail regarding which test projects (`projectRoot`) currently own active Appium lockfiles.

**Example Prompt to AI:**
> *"I'm getting timeout errors when running my tests. Execute `get_session_metrics` to check if there are abandoned sessions locking up the emulator ports."*

Using these metrics, an AI can automatically recommend restarting the server or triggering a session teardown sequence.