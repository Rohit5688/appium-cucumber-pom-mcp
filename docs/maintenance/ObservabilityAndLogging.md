---
title: "📊 Observability & Logging"
description: "High-fidelity telemetry for production-grade mobile automation."
---

import { Aside, Steps } from '@astrojs/starlight/components';

Effective automation requires **Total Visibility**. AppForge provides a multi-layered telemetry stack to capture structural, logical, and environmental execution data.

---

## 🏗️ 1. The Telemetry Stack

AppForge logs are designed to be both human-readable and machine-parsable, enabling automated error classification.

### A. Driver Telemetry
Captures low-level communication between the MCP server and the Appium driver.
- **Commands**: Every `click`, `input`, and `swipe` is logged with millisecond precision.
- **Timing**: Tracks session initialization and command execution latency.

### B. Structural Dumps
Captures the state of the application UI at the moment of interaction.
- **XML Snapshots**: Stored transiently to provide context for self-healing logic.
- **Base64 Screenshots**: Captured upon failure or explicitly via tool calls.

---

## 🔬 2. Error DNA Classification

AppForge classifies failures into a standard taxonomy to accelerate remediation.

| Error Class | Technical Trigger | Recovery Strategy |
| :--- | :--- | :--- |
| **`ENVIRONMENT_FAILED`** | Appium server unreachable or ADB/Xcode driver crash. | Check local host services. |
| **`SELECTOR_DRIFT`** | UI Hierarchy changed; original locator not found. | Trigger `self_heal_test`. |
| **`SESSION_TIMEOUT`** | Hardware/Emulator freeze during step execution. | Increase session timeout in `mcp-config`. |
| **`SECURITY_BLOCK`** | Generation attempted to use insecure patterns. | Regenerate with hardened prompts. |

---

## 🛡️ 3. Audit Logs & Privacy

In enterprise environments, logging must be balanced with data privacy.

- **Selective Redaction**: Credentials stored in `.env` are automatically redacted from all terminal and file logs.
- **Automatic Cleanup**: Temporary session logs and XML dumps are purged after a configurable period to minimize data residency.

---

> [!TIP]
> **Debugging Tip**: Enable `enableTelemetry: true` in your `mcp-config.json` to see raw tool payloads in your terminal—ideal for debugging complex multi-screen navigation flows.

---

**Visualize your quality. Orchestrate your insights. 📊**
