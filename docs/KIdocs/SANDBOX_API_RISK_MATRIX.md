# Sandbox API Risk Matrix (v1)

Version: 1.0  
Date: 2026-04-10

| API | Risk Level | Key Threats | Mitigations | Audit Pass Rate | Recommendation | Actionable Next Steps |
|---|---:|---|---|---:|---|---|
| forge.api.listFiles(dir, options) | MEDIUM | Directory traversal, symlink abuse, excessive recursion | - Resolve to absolute path and require prefix match to projectRoot<br>- Do not follow symlinks (lstat + skip)<br>- Limit recursion depth & item count<br>- Return project-relative paths only | 95% | IMPLEMENT | - Add path validation util + tests<br>- Add MAX_LIST_ITEMS and MAX_RECURSION_DEPTH constants<br>- CI security fuzz for symlink scenarios |
| forge.api.searchFiles(pattern, dir, options) | LOW | ReDoS via regex, mass file reads (DoS), leakage of hidden files | - Validate/parse regex and reject pathological patterns<br>- Limit files scanned (MAX_SEARCH_FILES) and matches (MAX_SEARCH_RESULTS)<br>- Read files with size cap; skip binaries/dotfiles | 98% | IMPLEMENT | - Add regex-safety checker and test cases<br>- Enforce MAX_SEARCH_FILES=1000, MAX_SEARCH_RESULTS=500 |
| forge.api.parseAST(filePath, options) | LOW | Large file parse DoS, unsafe parse plugins | - Enforce MAX_PARSE_FILE_BYTES (1MB)<br>- Read-only, sync safe parser usage<br>- Catch and normalize parse errors to safe McpError | 99% | IMPLEMENT | - Add size-check helper and tests for >1MB files<br>- Provide extractSignatures option only |
| forge.api.getEnv(key) | MEDIUM | Secret exfiltration | - Maintain explicit allowlist of env keys<br>- Document allowlist and require audit for changes<br>- Return null for disallowed keys (or throw McpError) | 90% | IMPLEMENT (ALLOWLIST) | - Define SAFE_ENV_VARS in code + docs<br>- Add tests verifying disallowed keys return error |
| forge.api.exec / runSafeCommand | HIGH | Command injection, shell escape, privilege escalation, audit failure | - REJECT for v1 OR implement strict allowlist + execFile + argument sanitization + audit logging<br>- If implemented later: require explicit allowlist and per-command sanitizers, limited capability, and audit trail | 60% (with exec) | REJECT (v1) — CONSIDER v1.1 with heavy controls | - Do not add exec in v1. If requested, design runSafeCommand spec and threat model; add mandatory audit & allowlist review before enabling. |

Notes:
- All APIs must be gated by feature flag "enhancedSandbox" (default: false).
- Centralize limits and constants:
  - SANDBOX_TIMEOUT_MS = 10_000
  - MAX_PARSE_FILE_BYTES = 1_048_576
  - MAX_SEARCH_FILES = 1000
  - MAX_SEARCH_RESULTS = 500
  - MAX_LIST_ITEMS = 5000
  - MAX_RECURSION_DEPTH = 6
- Monitoring & Response:
  - Audit-log every call with caller id, API, sanitized args, duration, and result.
  - Auto-disable feature-flag on repeated suspicious activity (> N events/hour).
- Testing:
  - Add unit + integration tests for each row above.
  - Add fuzzing tests for regex, path, and symlink attacks.
- Rollout:
  - Implement behind flag -> staging canary -> limited beta -> full rollout only after security signoff.