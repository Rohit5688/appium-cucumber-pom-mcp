# Security & Compliance Guide

AppForge is designed for high-security, regulated environments (Healthcare, Finance, Government). This document covers both the Information Security (InfoSec) FAQ and the technical architecture of the security system.

---

## 🏗️ 1. Architecture & Data Flow

### Is AppForge a cloud-hosted SaaS?
**No.** AppForge is a **locally executed developer tool** (an MCP server) that runs entirely on your private infrastructure. The authors do not operate any central server or cloud database.

### What data is transmitted externally?
**None to the authors.** AppForge has zero built-in telemetry or "phone home" functionality. It does provide context (screenshots, XML) to your **configured LLM provider** (e.g., Anthropic, OpenAI) via the MCP host. Use an Enterprise/API tier with your LLM provider to ensure zero-data retention.

---

## 🛡️ 2. Technical Security Guards

### Path Traversal Protection
All file operations are validated through `SecurityUtils.validateProjectRoot()`. The system blocks any attempt to read or write files outside the declared `projectRoot`.

### Shell Injection Prevention
Command arguments are processed by `SecurityUtils.sanitizeForShell()`, which strips shell-dangerous characters (`;`, `&`, `|`, `>`, `<`, `$`) before execution.

### Secure V8 Sandbox (Turbo Mode)
The `execute_sandbox_code` tool runs logic inside a hardened Node.js `vm.Script` context:
- **No `eval()`**: Blocked by static scan and context flags.
- **No Network**: `fetch` and `require` are not available in the sandbox.
- **Timeouts**: Hard 10-second limit to prevent ReDoS or infinite loops.
- **Isolation**: Fresh context per execution; no state leakage.

---

## ⚖️ 3. Regulatory Compliance

### GDPR
AppForge is not a Data Controller or Processor. You retain 100% data sovereignty over your app binaries, screenshots, and test reports.

### HIPAA
AppForge is HIPAA-compatible when used with synthetic test data. If your app contains real PHI on screens, you **must** ensure the connected LLM provider has a signed **Business Associate Agreement (BAA)** in place.

### PCI-DSS
AppForge never transmits cardholder data externally. Ensure your private CI infrastructure and any connected device farms are configured within your PCI-DSS scope.

---

## 🔐 4. Credential Management

- **Storage**: Credentials are stored in local `.env` or `users.{env}.json` files.
- **Access**: Managed via the `set_credentials` and `manage_users` tools.
- **Git Safety**: AppForge automatically adds credential files to `.gitignore` during project scaffolding to prevent accidental leaks.

---

## ✅ 5. Enterprise Checklist

- [ ] Connect AppForge to an **Enterprise LLM API** with a signed DPA/BAA.
- [ ] If using a cloud device farm, verify their data isolation guarantees.
- [ ] Run **synthetic/mock data** for all mobile tests.
- [ ] In containerized/cloud deployments: restrict network access via private VPC.
- [ ] Use **Turbo Mode** (`execute_sandbox_code`) for all large-scale analysis to minimize data transmission to the LLM.
