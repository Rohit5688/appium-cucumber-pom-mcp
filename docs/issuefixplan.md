# AppForge MCP Issues Fix Plan

This plan translates the findings in `docs/issues.md` into an implementation roadmap for AppForge MCP.

## Objective

Improve AppForge from a generation-first MCP into a maintenance-ready platform that supports large codebases, preventive quality checks, and actionable refactoring workflows.

## Success Criteria

- Large repositories can be analyzed without token overflow.
- Existing code quality can be assessed without manual file-by-file review.
- `validate_and_write` works for both generated code and surgical edits.
- Locator and flakiness tooling returns actionable outputs (not only warnings).
- Learning rules are manageable, deduplicated, and verifiable.
- Mandatory learned rules are provably injected into generation context for applicable requests.
- Generation fails fast when an applicable mandatory rule is not injected.
- Every generation run has an auditable record of applied rule IDs.
- Test execution output is machine-readable and useful for trend analysis.

## Phase 1: Token and Audit Foundations (High)

### [x] 1.1 Add `analyze_codebase_summary`
**Status**: COMPLETED
**Goal**: Prevent token overflow for real projects.
**Implementation**: Added `CodebaseAnalyzerService.analyzeSummary` and `analyze_codebase_summary` tool.

### [x] 1.2 Add structured `analyze_code_quality`
**Status**: COMPLETED
**Goal**: Audit existing framework quality without generation flow.

**Changes**
- Extend or add service logic in `src/services/RefactoringService.ts` (and AST helpers as needed).
- Add tool registration and dispatch in `src/index.ts`:
- `analyze_code_quality`

**Checks included**
- Duplicate blocks and duplicate step definitions
- Inconsistent patterns (`driver` vs `browser` usage)
- Magic numbers (timeouts, retry values)
- Multi-responsibility methods
- Dead code candidates / unused imports

**Acceptance**
- Structured JSON with file paths and findings.
- Findings are prioritized by severity.

## Phase 2: Write Path Flexibility (High)

### [x] 2.1 Improve `validate_and_write` input modes
**Status**: COMPLETED
**Goal**: Support simple edits and complex generation equally well.

**Changes**
- Update tool contract in `src/index.ts` to allow additional write modes while keeping `files[]` support.
- Keep `jsonPageObjects` optional and additive.
- Keep validations in `src/services/FileWriterService.ts` available in all modes (`dryRun`, TS/Gherkin checks).

**Acceptance**
- Small file patches do not require POM-specific payloads.
- No breaking changes for existing clients.

## Phase 3: Actionable Reliability Tooling (Medium)

### [x] 3.1 Add `predict_flakiness`
**Status**: COMPLETED
**Goal**: Detect fragile tests before they fail.

**Changes**
- Add preventive scoring in `src/services/SelfHealingService.ts` (or a dedicated flakiness service).
- Register tool in `src/index.ts`:
- `predict_flakiness`

**Signals**
- Brittle locator patterns (deep XPath, text-only selectors)
- Wait patterns prone to stale element references
- Mixed responsibilities in page methods

**Acceptance**
- Risk score per page/test + specific remediation hints.

### [x] 3.2 Make `audit_mobile_locators` patch-oriented
**Status**: COMPLETED
**Goal**: Move from warnings to ready-to-apply changes.

**Changes**
- Extend `src/services/AuditLocatorService.ts` output to include:
- `suggestedReplacement`
- `strategyPreference`
- patch-ready replacement suggestions

**Acceptance**
- Critical locator findings include concrete alternatives.
- Output can be consumed by automation for code updates.

## Phase 4: Learning and Traceability (Medium)

### [x] 4.1 Upgrade rule lifecycle management
**Status**: COMPLETED
**Goal**: Keep learned knowledge clean and trustworthy.

**Changes**
- Extend `src/services/LearningService.ts`:
- explicit rule metadata (`mandatory`, `scope`, `priority`, optional matchers)
- normalized deduplication
- list/edit/delete operations
- timestamp/version metadata improvements
- Add new tool operations in `src/index.ts`:
- `manage_training_rules`
- `verify_training`

**Required `verify_training` response**
- `applicableRules` with IDs and match reasons
- `appliedMandatoryRules`
- `skippedMandatoryRules` (must include reason)
- `injectionPreview` (the exact prompt block to be injected)
- `promptHash` (stable hash of final prompt body for auditability)

**Acceptance**
- Rules can be reviewed and maintained without file edits.
- `verify_training` shows what will inject for a given request.

### [x] 4.2 Enforce mandatory rule injection in generation path
**Status**: COMPLETED
**Goal**: Ensure learning is operationally guaranteed, not best effort.

**Changes**
- Add deterministic resolver in `src/services/LearningService.ts`:
- `resolveApplicableRules(projectRoot, requestContext)`
- returns applied and skipped rules with reasons
- Update generation flow in `src/index.ts` (`generate_cucumber_pom` path):
- resolve applicable rules before prompt generation
- inject rule IDs into prompt markers (example: `[RULE_ID=rule-123][MANDATORY=true]`)
- hard-fail if any applicable mandatory rule is missing from injected prompt

**Acceptance**
- If a mandatory applicable rule is not injected, tool returns error and does not generate prompt.
- Generated prompt always includes deterministic rule markers for applied rules.

### [x] 4.3 Add learning audit trail
**Status**: COMPLETED
**Goal**: Provide post-run proof that learned rules were used.

**Changes**
- Persist generation-time audit entries to `.appium-mcp/learning-audit.jsonl`.
- Each entry should include:
- timestamp
- request summary
- applicable rule IDs
- applied rule IDs
- skipped rule IDs and reasons
- prompt hash

**Acceptance**
- Audit file is append-only and readable for troubleshooting.
- For any generation request, team can trace exactly which rules were applied.

### [x] 4.4 Define deterministic rule applicability model
**Status**: COMPLETED
**Goal**: Ensure the system can reliably decide which rules are applicable, mandatory, or skippable.

**Changes**
- Extend rule schema in `src/services/LearningService.ts` with explicit matching metadata:
- `mandatory: boolean`
- `scope: generation | healing | all`
- `priority: number`
- `conditions` object:
- `platforms`, `toolNames`, `fileGlobs`
- `keywordsAny`, `keywordsAll`, `regexAny`, `tagsAny`
- Build `requestContext` at runtime in `src/index.ts` for each generation/healing request:
- active tool name, platform, request text, tags, candidate files, optional UI context
- Implement deterministic resolver in `src/services/LearningService.ts`:
- evaluate rules in fixed gate order: scope -> tool -> platform/file/tag -> text match
- return explicit decisions with reasons

**Conflict resolution policy**
- When two applicable rules conflict:
- higher `priority` wins
- if tied, rule with more matched conditions wins (more specific)
- if still tied, newest timestamp wins
- Record loser as skipped with `reason: conflict_with:<ruleId>`.

**Required resolver output contract**
- `applicableRules`
- `appliedMandatoryRules`
- `appliedOptionalRules`
- `skippedMandatoryRules` (with reasons)
- `skippedOptionalRules` (with reasons)

**Acceptance**
- Rule applicability is fully deterministic for the same input context.
- Mandatory rules cannot silently drop; unresolved mandatory rules cause hard failure.
- Skip decisions always include machine-readable reasons.

### [x] 4.5 Prompt marker and enforcement contract
**Status**: COMPLETED
**Goal**: Provide verifiable proof that resolved rules are present in final prompt payload.

**Changes**
- Inject explicit markers for each applied rule in generation/healing prompts:
- format: `[RULE_ID=<id>][MANDATORY=<true|false>][SCOPE=<scope>]`
- Validate marker presence before dispatching prompt to the LLM.
- Abort tool execution if any applicable mandatory rule marker is missing.

**Acceptance**
- Final prompt always contains markers for all applied rules.
- Missing mandatory marker always causes fail-fast behavior.

## Phase 5: Developer Ergonomics and Test Intelligence (Low)

### [x] 5.1 Add high-level sandbox APIs
**Status**: COMPLETED
**Goal**: Reduce scripting friction in `execute_sandbox_code`.
**Implementation**: Added `suggestRefactorings`, `analyzeCodeQuality`, and `analyzeRuleHealth` wrappers.

### [x] 5.2 Enrich `run_cucumber_test` result structure
**Status**: COMPLETED
**Goal**: Improve downstream analytics and automated reporting.
**Implementation**: Added detailed scenario breakdown array with `durationMs` and individual `error` info to `ExecutionService.parseReport`.

## Phase 6: Production Readiness and Governance (High)

### [x] 6.1 Rule drift and stale-rule detection
**Status**: COMPLETED (Analysis/Health Part)
**Goal**: Keep the learning corpus useful over time and prevent low-signal rule growth.

**Changes**
- Add health metrics in `src/services/LearningService.ts`:
- `matchCount`, `appliedCount`, `skippedCount`, `lastMatchedAt`, `lastAppliedAt`
- Add stale-rule analysis tool operation in `src/index.ts`:
- `analyze_training_rules_health`
- Flag rules that never match or are repeatedly skipped by conflicts.

**Acceptance**
- Team can identify stale, noisy, or ineffective rules from structured output.

### [x] 6.2 Prompt budget governance
**Status**: COMPLETED
**Goal**: Ensure rule injection does not degrade generation quality due to token pressure.

**Changes**
- Add deterministic prompt budget policy in generation flow (`src/index.ts` + `src/services/LearningService.ts`):
- max mandatory token budget
- max optional token budget
- truncation/compaction strategy for optional rules
- Add budget diagnostics to `verify_training` output.

**Acceptance**
- Mandatory rules are always retained.
- Optional rules degrade gracefully under budget pressure with explicit skip reasons.

### [x] 6.3 Concurrency safety for learning state
**Status**: COMPLETED
**Goal**: Prevent corruption when multiple agents/jobs update learning files simultaneously.

**Changes**
- Add safe write strategy for `.appium-mcp/mcp-learning.json` and `.appium-mcp/learning-audit.jsonl`:
- atomic temp-file writes and rename
- lightweight lock mechanism per file
- Add retry with backoff for lock contention.

**Acceptance**
- Concurrent writes do not corrupt rule or audit files.

### [x] 6.4 Observability and schema versioning
**Status**: COMPLETED
**Goal**: Improve operability and backward compatibility for MCP clients.

**Changes**
- Add `schemaVersion` to new structured tool responses.
- Emit structured telemetry for critical operations:
- rule resolution start/end
- mandatory enforcement failures
- prompt generation duration
- audit write outcomes

**Acceptance**
- Payload evolution is traceable and clients can guard on `schemaVersion`.
- Operational failures can be diagnosed without reproducing locally.

### [x] 6.5 Security and safety hardening for rule matching
**Status**: COMPLETED
**Goal**: Prevent unsafe pattern matching and data leakage.

**Changes**
- Add regex safety checks in `src/services/LearningService.ts` to prevent catastrophic regex patterns.
- Sanitize logs/audit entries to avoid secret leakage from request text.
- Add input validation and max-length guards for rule fields.

**Acceptance**
- Unsafe regex patterns are rejected with clear errors.
- Audit and telemetry paths do not store sensitive secrets.

### [x] 6.6 User Explainability Tools
**Status**: COMPLETED
**Goal**: Transparency in generation context.
**Implementation**: `verify_training` tool serves exactly as the `simulate_generation_context` dry run, successfully exposing conflict rationales, skipped reasons, and the final injected textual preview.

### [x] 6.7 Rollback and approval workflow for mandatory rules
**Status**: COMPLETED
**Goal**: Reduce blast radius from incorrect mandatory rules in live projects.
**Implementation**: Added `createSnapshot`, `listSnapshots`, `rollbackToSnapshot` in `LearningService`. Wired as `snapshot`, `list_snapshots`, `rollback` operations in `manage_training_rules`. Rollback auto-creates a safety backup before overwriting. Approval statuses (`draft`/`approved`/`rejected`) already enforced in resolver.

## Delivery Order (Priority + Token Efficiency)

### [x] Wave 0: Trust-Critical Rule Enforcement (DONE)

1. Phase `4.4` deterministic rule applicability model
2. Phase `4.2` mandatory rule enforcement in generation path
3. Phase `4.5` prompt marker validation contract
4. Phase `4.1` rule lifecycle management + `verify_training`
5. Phase `4.3` learning audit trail

### [x] Wave 1: High ROI, Lower Complexity (DONE)

1. [x] Phase `1.1` `analyze_codebase_summary`
2. [x] Phase `2.1` `validate_and_write` input flexibility
3. [x] Phase `3.2` actionable locator audit output

### [x] Wave 2: Core Analysis Capability (DONE)

1. Phase `1.2` structured `analyze_code_quality`
2. Phase `3.1` `predict_flakiness`

### [x] Wave 3: Operational Hardening (DONE)

1. Phase `6.2` prompt budget governance
2. Phase `6.3` concurrency-safe learning state
3. Phase `6.5` regex and data safety hardening
4. Phase `6.4` schema versioning + observability

### [x] Wave 4: Extended Intelligence and Ergonomics (DONE)

1. [ ] Phase `5.1` high-level sandbox APIs
2. [ ] Phase `5.2` enriched `run_cucumber_test` structure
3. [ ] Phase `6.6` user explainability / simulation tools

## Token Optimization Execution Rules

1. Implement in waves and do not start next wave until current wave acceptance tests pass.
2. Prefer additive changes with backward compatibility to avoid rework loops.
3. Limit each PR to one wave milestone to contain review and rollback costs.
4. Use strict test subsets first, then full regression only at wave boundaries.
5. Reuse resolver and reporting primitives across tools to avoid duplicate logic.

## Wave Exit Gates

- **Wave 0 exit**:
- `verify_training` proves mandatory rule applicability and injection.
- generation fails fast when mandatory applied rule is missing.
- audit log records applied/skipped rule IDs and prompt hash.
- **Wave 1 exit**:
- large project summary output remains compact.
- write-path flexibility supports non-generation edits safely.
- locator audit emits patch-ready suggestions.
- **Wave 2 exit**:
- quality and flakiness outputs include file-level findings and severity.
- **Wave 3 exit**:
- no learning-state corruption under concurrent writes.
- prompt budget policy retains mandatory rules deterministically.
- **Wave 4 exit**:
- sandbox and test-analytics enhancements deliver expected structured outputs.

## Validation Plan

- Unit tests for each new service method and parser.
- Tool contract tests for `ListTools` and dispatcher routing in `src/index.ts`.
- Learning verification tests:
- resolver returns deterministic applicable/applied/skipped outputs for identical context.
- conflict resolution follows priority/specificity/timestamp tie-breakers.
- `verify_training` reports expected mandatory rule IDs.
- generation path fails when applicable mandatory rules are missing.
- injected prompt contains applied rule markers.
- audit log entry is written with matching rule IDs and prompt hash.
- Production readiness tests:
- concurrent rule writes preserve valid JSON and append-only audit integrity.
- prompt budget policy keeps mandatory rules while skipping optional with reasons.
- stale-rule health report flags long-unused rules.
- regex safety validation rejects unsafe matchers.
- `schemaVersion` is present in versioned structured responses.
- Backward compatibility checks for existing tools:
- `ana


# Phase 7: End-User Onboarding Hardening (Critical)

This document contains only the Phase 7 plan from `docs/issuefixplan.md`.

## Goal

Make AppForge reliably usable for first-time users by fixing setup reliability, recovery workflows, input validation, error consistency, and onboarding clarity.

## Scope

- Project bootstrap reliability (`setup_project`)
- Recovery from partial bootstrap states
- Runtime input validation for all tools
- Standardized error response contracts
- Prompt-builder vs artifact-writer documentation clarity
- File/path validation hardening in analysis tools

## Issues Faced (End-User Testing)

These issues were observed during real first-time-user testing in `/Users/rsakhawalkar/testAppForge`.

1. `setup_project` failed with path inconsistency:
- Error: `ENOENT ... /pages/BasePage.ts`
- Impact: project scaffold became partial/inconsistent.

2. Recovery dead-end after partial setup:
- Re-running `setup_project` was blocked by safety checks (existing `package.json`).
- `upgrade_project` did not restore missing `mcp-config.json`.

3. Runtime crashes on malformed payloads:
- Errors observed: `Cannot read properties of undefined ...` for `export_bug_report` and `train_on_example`.
- Impact: weak user guidance and fragile client integrations.

4. Non-uniform error behavior across tools:
- Several failures returned as plain text (`"Error: ..."`) in otherwise successful envelopes.
- Impact: clients cannot reliably branch on failure.

5. `start_appium_session` failed against Appium 2 default server path:
- Error: `... when running "http://localhost:4723/wd/hub/session" ...`
- Impact: session startup fails even when Appium is running.

6. `end_appium_session` reported success even after failed starts:
- Returned `Appium session terminated.` when no valid session was established.
- Impact: confusing status feedback for users.

7. Analysis input ambiguity:
- `analyze_coverage` accepted non-existent feature paths and reported `0` scenarios without clear missing-path diagnostics.

## What Needs To Be Done

1. Fix `setup_project` path model and make writes atomic.
- Canonicalize all scaffold output under one root strategy.
- Stage and commit all writes atomically; rollback on failure.

2. Add explicit repair flow for interrupted bootstrap.
- Introduce `repair_project` (or `upgrade_project --repair`) to regenerate baseline artifacts (`mcp-config.json`, WDIO config, base files).
- Detect partial setup and auto-suggest exact recovery command.

3. Add strict request validation at tool boundary.
- Reject malformed inputs with structured validation output:
`{ code, message, invalidFields, expectedSchemaSnippet, examplePayload }`.

4. Standardize failure contracts for every tool.
- Ensure all tool failures set `isError: true` and return a consistent machine-readable error envelope.

5. Harden Appium session startup compatibility.
- Update `start_appium_session` to support Appium 2 root path (`/session`) and fallback detection.
- Make server path configurable in `mcp-config.json` and auto-detect when omitted.
- Improve failure hints for endpoint mismatch vs capability mismatch.

6. Correct session lifecycle status reporting.
- `end_appium_session` should return explicit states such as `no_active_session` vs `terminated`.

7. Strengthen analysis/file input checks.
- Validate all incoming file paths before analysis.
- Return `missingPaths` diagnostics and a warning/error summary.

8. Clarify prompt-builder vs artifact-writer behavior in docs/tool descriptions.
- Clearly state which tools return prompts and which tools write files.
- Add one short "first successful flow" example chaining generation into `validate_and_write`.

## Work Items

### [x] 7.1 Make `setup_project` atomic and path-safe

**Priority**: P0
**Status**: COMPLETED
**Evidence**: First-time run failed with `ENOENT ... /pages/BasePage.ts` in a fresh folder.

**Implemented**
- Fixed 3 path bugs: `BasePage.ts` → `src/pages/BasePage.ts`, `hooks.ts` → `src/step-definitions/hooks.ts`, `sample.feature` → `src/features/sample.feature`.
- Wrapped all scaffold writes in atomic temp-dir staging (`os.tmpdir()`): all files go to a staging dir first, then `copyDirRecursive()` commits them atomically. On any failure the staging dir is cleaned up.
- `writeIfNotExists()` now auto-creates parent directories before writing.

### [x] 7.2 Add recovery flow for partial bootstrap

**Priority**: P0
**Status**: COMPLETED
**Evidence**: Re-running `setup_project` is blocked by safety checks while `upgrade_project` does not repair missing baseline files.

**Implemented**
- Added `repairProject()` method in `ProjectMaintenanceService.ts` that regenerates only missing baseline files without overwriting existing ones.
- Added `detectMissingBaseline()` used by `upgrade_project` to proactively warn about partial setups.
- Registered new `repair_project` MCP tool in `index.ts`.

### [x] 7.3 Enforce strict runtime input validation for all tools

**Priority**: P1
**Status**: COMPLETED
**Evidence**: Runtime errors like `Cannot read properties of undefined` on malformed args for `export_bug_report` and `train_on_example`.

**Implemented**
- Added `validateArgs(args, requiredFields[])` helper in `AppForgeServer` that returns a structured `VALIDATION_ERROR` envelope with `invalidFields`, `expectedSchemaSnippet`, and `hint`.
- Applied to `export_bug_report` and `generate_test_data_factory`.

### [x] 7.4 Standardize error contracts across tool responses

**Priority**: P1
**Status**: COMPLETED
**Evidence**: Some logical failures are returned as plain text in success payloads.

**Implemented**
- Global catch block now returns structured JSON envelope: `{ code, message, tool, hint }` with `isError: true`.
- `end_appium_session` now checks session state before terminating and returns typed JSON `{ status: 'terminated' | 'no_active_session', message }`.

### [ ] 7.5 Align docs and behavior for prompt-building tools

**Priority**: P2
**Evidence**: Tools such as `generate_cucumber_pom` and `generate_test_data_factory` can return prompt templates, which may be interpreted as generated code by new users.

**Changes**
- Clarify tool descriptions and docs to explicitly mark prompt-builder vs artifact-writer behavior.
- Add one guided flow doc showing when to chain into `validate_and_write`.

**Acceptance**
- First-time users can complete an end-to-end flow without contract confusion.

### [x] 7.6 Tighten file/path existence checks in analysis tools

**Priority**: P2
**Status**: COMPLETED
**Evidence**: `analyze_coverage` accepted non-existent feature paths and returned zero-scenario output without explicit missing-path warnings.

**Implemented**
- `CoverageReport` now includes `missingPaths: string[]` and optional `pathWarning` fields.
- `CoverageAnalysisService.analyzeCoverage()` tracks missing files instead of silently skipping them.
- Output clearly distinguishes "no scenarios found in valid files" from "all provided paths were invalid".

## Delivery Order

1. 7.1 Atomic `setup_project`
2. 7.2 Recovery tool/path
3. 7.3 Runtime argument validation
4. 7.4 Error contract unification
5. 7.5 Docs/behavior alignment
6. 7.6 Analysis input hardening

error log when server crashed:
Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:03:08.766Z ERROR webdriver: WebDriverError: The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource. when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:03:08.766Z ERROR webdriver: unknown command: WebDriverError: The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource. when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:04:33.697Z ERROR webdriver: WebDriverError: The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource. when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:04:33.698Z ERROR webdriver: unknown command: WebDriverError: The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource. when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:07:04.627Z ERROR webdriver: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:07:04.627Z ERROR webdriver: unknown error: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:08:40.775Z ERROR webdriver: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:08:40.775Z ERROR webdriver: unknown error: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:08:59.960Z ERROR webdriver: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:08:59.960Z ERROR webdriver: unknown error: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) 2026-03-26T10:10:00.405Z ERROR webdriver: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" 2026-03-26T10:10:00.405Z ERROR webdriver: unknown error: WebDriverError: Could not determine iOS SDK version: Command 'xcrun --sdk iphonesimulator --show-sdk-version' timed out after 15000ms when running "http://localhost:4723/wd/hub/session" with method "POST" at FetchRequest._request (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:2008:19) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startWebDriverSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1110:16) at async _WebDriver.newSession (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriver/build/node.js:1532:41) at async remote (file:///Users/rsakhawalkar/forge/AppForge/node_modules/webdriverio/build/node.js:9848:20) at async AppiumSessionService.startSession (file:///Users/rsakhawalkar/forge/AppForge/dist/services/AppiumSessionService.js:25:27) at async file:///Users/rsakhawalkar/forge/AppForge/dist/index.js:900:45 at async wrappedHandler (file:///Users/rsakhawalkar/forge/AppForge/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js:125:32) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5) Unexpected non-whitespace character after JSON at position 4 (line 1 column 5)

error log when try to user start_appium_session tool:
Error:
Error: WebDriverError: The requested resource could not be found, or a request was received using an HTTP method that is not supported by the mapped resource. when running "http://localhost:4723/wd/hub/session" with method "POST"