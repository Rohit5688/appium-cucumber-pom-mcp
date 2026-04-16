# Sandbox Security Model

Version: 1.0  
Date: 2026-04-10

## Purpose
Document the current sandbox threat model, mitigations, proposed safe API enhancements, testing requirements, and rollout guidance for AppForge's sandboxed execution environment.

---

## Current Threat Model
- Threat: Malicious script attempts directory traversal to read sensitive files (eg. /etc/passwd)  
  Mitigation: Enforce path validation; disallow access outside projectRoot; block symlink traversal.

- Threat: Script spawns long-running or infinite loops to exhaust CPU/time  
  Mitigation: Hard timeout (10s) + CPU wall-clock enforcement and sandbox watchdog.

- Threat: Script attempts command execution / shell injection  
  Mitigation: No child_process.exec exposure; reject any exec-like API for v1.

- Threat: Script attempts network exfiltration (HTTP, DNS, sockets)  
  Mitigation: No network APIs exposed inside sandbox; block fetch/http and sockets.

- Threat: Script exfiltrates environment secrets via getenv  
  Mitigation: Allowlist environment variables accessible via forge.api.getEnv.

- Threat: Regex ReDoS or parsing DoS via malicious regular expressions or huge file reads  
  Mitigation: Regex compilation guard, result limits, and file size caps.

---

## Proposed Sandbox API Enhancements (v1 — Safe, Read-Only)
These APIs are additive and intentionally conservative.

- forge.api.listFiles(dir, options)
  - Purpose: Read-only listing within projectRoot
  - Risk: Medium
  - Mitigations: Resolve to absolute path, must startWith(projectRoot); do not follow symlinks; restrict dotfiles; limit recursion depth.

- forge.api.searchFiles(pattern, dir, options)
  - Purpose: Grep-like search over files
  - Risk: Low
  - Mitigations: Compile regex with safeguards; cap matched files (500) and files scanned (1000); read-only access.

- forge.api.parseAST(filePath, options)
  - Purpose: Parse TypeScript/JS to AST and optionally extract signatures
  - Risk: Low
  - Mitigations: File size cap (1MB); read-only; sanitize parse errors.

- forge.api.getEnv(key)
  - Purpose: Return allowlisted environment variables only
  - Risk: Medium
  - Mitigations: Explicit allowlist in code and docs; never return secret keys by default.

- forge.api.exec (REJECTED for v1)
  - Reason: High risk (command injection, shell escapes, privilege escalation). Consider allowlist-based runSafeCommand in future with strict sanitization and auditing.

---

## Risk Matrix (Summary)

| API | Risk Level | Key Mitigations | Notes |
|---|---:|---|---|
| forge.api.listFiles | MEDIUM | Path validation; no symlink follow; projectRoot-only | ✅ Implement |
| forge.api.searchFiles | LOW | Regex guard; result/file limits; read-only | ✅ Implement |
| forge.api.parseAST | LOW | File size limit (1MB); read-only | ✅ Implement |
| forge.api.getEnv | MEDIUM | Allowlist-only; documented safe keys | ✅ Implement |
| forge.api.exec | HIGH | N/A (rejected) | ❌ Reject v1 |

---

## Security Test Suite Requirements
Create tests under `src/tests/`:

- src/tests/SandboxEngine.security-audit.test.ts
  - MUST block directory traversal in forge.api.readFile/listFiles
  - MUST refuse symlink-following (no access to host-protected files)
  - MUST enforce file size limits for parseAST
  - MUST enforce regex/scan limits for searchFiles
  - MUST only return allowlisted env vars via getEnv
  - MUST reject any attempts to call a blocked exec API

- src/tests/SandboxEngine.security-enhanced.test.ts
  - Tests for symlink creation scenarios
  - Fuzzing tests for regex DoS patterns
  - Time-bound tests for runtime timeouts

Test execution guidance:
- Run tests in CI with feature-flagged sandbox enabled
- Include negative tests that attempt common OWASP patterns

---

## Implementation Guardrails
- All APIs must be implemented in tool layer (`src/tools/execute_sandbox_code.ts`) with minimal changes to core services.
- Use defensive coding: input validation, try/catch wrappers, explicit error classes (McpError).
- Enforce limits centrally (e.g., MAX_FILE_SIZE = 1_048_576 bytes; MAX_SEARCH_RESULTS = 500).
- Do not expose raw absolute paths in success responses; prefer project-relative paths.

---

## Monitoring, Logging & Auditing
- Audit-log every sandbox API call with:
  - caller id, API name, sanitized args, timestamp, duration, success/failure
- On any suspicious pattern (e.g., repeated directory traversal attempts), automatically disable enhanced sandbox feature-flag and alert ops.

---

## Rollout & Feature Flags
Add feature flags to `mcp-config.json`:
```json
{
  "features": {
    "enhancedSandbox": true
  }
}
```
Rollout strategy:
1. Implement behind `enhancedSandbox` default=false.
2. Enable in internal staging only; run full security suite and fuzzing.
3. Gradual canary to select customers if staging passes.
4. Keep `exec` API disabled unless explicitly requested and audited.

---

## Incident Response
- If a sandbox exploit is discovered:
  1. Immediately disable `enhancedSandbox` feature-flag.
  2. Collect audit logs and isolate offending project/session.
  3. Patch fix, run full regression + fuzz tests, then re-enable.
  4. Notify stakeholders and document remediation timeline.

---

## Documentation & Developer Guidance
- Add docs/IMPLEMENTATION_ROADMAP.md (already present) links to this file.
- Update tool descriptions to reflect allowlist and limits.
- Provide developer checklist in PR templates for any sandbox API changes:
  - Include security rationale
  - Add unit + fuzz tests
  - Add audit log entry
  - List expected ripple files

---

## Appendix — Constants (suggested)
- SANDBOX_TIMEOUT_MS = 10_000
- MAX_PARSE_FILE_BYTES = 1_048_576
- MAX_SEARCH_FILES = 1000
- MAX_SEARCH_RESULTS = 500