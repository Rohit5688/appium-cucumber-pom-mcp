# MCP Server Stabilization Phase

## "Break → Refine → Fix → Efficient" — No New Features Until Done

This is a **freeze-and-harden** initiative. The goal is to stress-test every tool in TestForge and AppForge, find failures, fix them, and leave both servers in a provably stable state before any new work begins.

---

## Scope & Constraints

> [!IMPORTANT]
> **Feature freeze is in effect.** No new tools, no new services, no new capabilities until this phase is complete. Every PR/session must be a fix, a hardening, or a test.

| Server        | Tools    | Services     | Status                                                   |
| ------------- | -------- | ------------ | -------------------------------------------------------- |
| **TestForge** | 44 tools | ~35 services | Recently refactored — needs live stress testing          |
| **AppForge**  | 40 tools | ~36 services | Multi-tenancy POC planned but core needs hardening first |

---

## Methodology: The 4-Step Loop Per Tool

For each tool in both servers, apply this loop:

```
1. BREAK   → Call the tool with bad/edge inputs. Find the failure mode.
2. ANALYZE → Classify error (scripting / application / infra / null-safety gap).
3. FIX     → Minimal surgical fix. No scope creep.
4. VERIFY  → Re-run tool, confirm fix. Log the pattern in train_on_example.
```

> [!NOTE]
> **Consistency Rule:** During the "Refine" step (Step 2/3), **TestForge** (Forge) MUST adopt the exact tool description and `OUTPUT INSTRUCTIONS` format established in AppForge. All tools must have clear, actionable system instructions to ensure deterministic generation.

---

## Phase 1 — TestForge Hardening (44 tools)

Tools are grouped into risk tiers based on complexity and known issue history.

### Tier A — Critical Path (Test Generation & Healing)

These tools are the revenue path. A bug here breaks the user's core workflow.

| Tool                              | Known Risk                                             | Test Priority |
| --------------------------------- | ------------------------------------------------------ | ------------- |
| `generate_gherkin_pom_test_suite` | ~35K TS service, `analysisResult` null crash (known)   | P0            |
| `validate_and_write`              | 3-retry self-heal loop, can silently fail on attempt 3 | P0            |
| `create_test_atomically`          | Gherkin/TS dual validation — edge on malformed Gherkin | P0            |
| `self_heal_test`                  | ErrorDNA parsing, DOM re-inspect race conditions       | P0            |
| `heal_and_verify_atomically`      | Requires live session — can deadlock                   | P1            |
| `run_playwright_test`             | Output parsing of Playwright JSON reporter             | P1            |

**Break Tests to Run:**

- Pass empty `testDescription` to `generate_gherkin_pom_test_suite`
- Pass a `.feature` file with broken Gherkin syntax to `create_test_atomically`
- Trigger `validate_and_write` when all 3 healing retries produce bad code
- Call `self_heal_test` with a completely fake `errorDna` object
- Call `heal_and_verify_atomically` with no active session

### Tier B — DOM & Session Tools

Browser session lifecycle is the most common source of flakiness.

| Tool                                 | Known Risk                                                       | Test Priority |
| ------------------------------------ | ---------------------------------------------------------------- | ------------- |
| `inspect_page_dom`                   | JSON structuredClone crash on read-only (fixed in past — verify) | P0            |
| `gather_test_context`                | Large page XHR floods, timeout on slow sites                     | P1            |
| `discover_app_flow`                  | Crawl loop on infinite scroll / SPAs                             | P1            |
| `start_session` / `navigate_session` | No active session guard                                          | P1            |
| `verify_selector`                    | No browser session active — should fail gracefully               | P1            |

**Break Tests to Run:**

- Call `inspect_page_dom` on a URL that returns 404
- Call `gather_test_context` on a site with no network calls
- Call `navigate_session` without calling `start_session` first
- Call `verify_selector` with a completely invalid CSS selector

### Tier C — Analysis & Reporting Tools

Lower risk, but bad output silently misleads the user.

| Tool                    | Known Risk                                    | Test Priority |
| ----------------------- | --------------------------------------------- | ------------- |
| `analyze_trace`         | No trace file present — path assumption fails | P1            |
| `analyze_coverage_gaps` | Missing LCOV report directory                 | P1            |
| `analyze_codebase`      | Large projects (>100 files) — sandbox timeout | P2            |
| `summarize_suite`       | Zero feature files → empty return or crash?   | P2            |
| `audit_locators`        | Missing `pages/` dir assumption               | P2            |
| `audit_utils`           | customWrapperPackage not installed            | P2            |

### Tier D — Config, Setup & Utility Tools

These tools run at the start of every project. Silent failures here cascade everywhere.

| Tool                     | Known Risk                                  | Test Priority |
| ------------------------ | ------------------------------------------- | ------------- |
| `setup_project`          | npm install on offline machine              | P1            |
| `check_playwright_ready` | Cache stale / `forceRefresh` not passed     | P1            |
| `check_environment`      | Node version mismatch edge cases            | P1            |
| `manage_config`          | Deep-merge of invalid partial config        | P1            |
| `manage_env`             | Missing `.env` file — scaffold vs error     | P2            |
| `repair_project`         | Runs on already-healthy project             | P2            |
| `upgrade_project`        | package.json with locked versions conflicts | P2            |

### Tier E — Knowledge & Learning Tools

These are "maintenance" tools. Low crash risk but correctness matters.

| Tool                                    | Known Risk                      | Test Priority |
| --------------------------------------- | ------------------------------- | ------------- |
| `train_on_example`                      | Duplicate pattern handling      | P2            |
| `export_team_knowledge`                 | Missing `mcp-learning.json`     | P2            |
| `export_bug_report` / `export_jira_bug` | Malformed `rawError` string     | P3            |
| `get_token_budget` / `get_system_state` | Empty session history           | P3            |
| `workflow_guide`                        | Works as static data — low risk | P3            |
| `request_user_clarification`            | Always succeeds — verify format | P3            |

---

## Phase 2 — AppForge Hardening (40 tools)

AppForge has a heavier backend (Appium sessions, Android/iOS) and more God Nodes.

### Tier A — Appium Session Lifecycle (God Node: `AppiumSessionService`)

> [!CAUTION]
> `AppiumSessionService` is a confirmed God Node with high connection count. Changes here ripple everywhere. Fix bugs here surgically and always run `build_appforge_graph.py` after.

| Tool                         | Known Risk                               | Test Priority |
| ---------------------------- | ---------------------------------------- | ------------- |
| `start_appium_session`       | Device not connected — should not hang   | P0            |
| `end_appium_session`         | Double-end (no session guard)            | P0            |
| `get_session_health`         | Stale session returns wrong state        | P0            |
| `inspect_ui_hierarchy`       | 50KB+ XML on complex screens — timeout   | P1            |
| `verify_selector`            | XPath vs accessibility-id fallback logic | P1            |
| `heal_and_verify_atomically` | Requires live Appium session             | P1            |

**Break Tests:**

- Call `start_appium_session` with no device connected
- Call `end_appium_session` twice in a row
- Call `verify_selector` with an invalid WebDriver selector syntax

### Tier B — Test Generation & Execution

| Tool                     | Known Risk                                                          | Test Priority |
| ------------------------ | ------------------------------------------------------------------- | ------------- |
| `generate_cucumber_pom`  | `TestGenerationService` — null `analysisResult` (same as TestForge) | P0            |
| `validate_and_write`     | 3-retry loop on native Android syntax                               | P0            |
| `run_cucumber_test`      | Output parsing of Cucumber JSON reporter format                     | P1            |
| `create_test_atomically` | JSON POM + Gherkin dual validation                                  | P1            |
| `self_heal_test`         | ErrorDNA + Appium-specific trace parsing                            | P1            |
| `migrate_test`           | Java Selenium `auto` dialect detection                              | P2            |

### Tier C — Code Analysis & Observability

> [!NOTE]
> `NavigationGraphService` (47KB) is the largest God Node in AppForge. The `execute_sandbox_code` tool routes through it extensively. Treat it as a read-only surface during this phase.

| Tool                     | Known Risk                                              | Test Priority |
| ------------------------ | ------------------------------------------------------- | ------------- |
| `execute_sandbox_code`   | V8 sandbox timeout, `forge.api.*` endpoint availability | P0            |
| `scan_structural_brain`  | Missing `.AppForge/structural-brain.json`               | P1            |
| `analyze_codebase`       | Large project recursion depth                           | P1            |
| `analyze_coverage`       | Missing `.feature` files path                           | P2            |
| `export_navigation_map`  | No prior `discover` run (cache miss)                    | P2            |
| `extract_navigation_map` | Feature file parsing on malformed Gherkin               | P2            |

### Tier D — Project Setup & Config

| Tool                 | Known Risk                                         | Test Priority |
| -------------------- | -------------------------------------------------- | ------------- |
| `setup_project`      | Appium + Android SDK prerequisite gaps             | P1            |
| `check_appium_ready` | No device / emulator connected                     | P1            |
| `check_environment`  | Platform-specific (Windows vs macOS) path handling | P1            |
| `manage_config`      | `inject_app` with non-existent build path          | P1            |
| `inject_app_build`   | Missing `.apk`/`.ipa` file path                    | P2            |
| `repair_project`     | Idempotency on healthy project                     | P2            |
| `upgrade_project`    | Locked native module conflicts                     | P2            |

### Tier E — Knowledge, Reporting & Utilities

| Tool                         | Known Risk                                     | Test Priority |
| ---------------------------- | ---------------------------------------------- | ------------- |
| `train_on_example`           | Duplicate handling + LearningService file lock | P2            |
| `export_team_knowledge`      | Missing knowledge JSON file                    | P2            |
| `export_bug_report`          | Android crash stack vs JS stack format         | P3            |
| `generate_ci_workflow`       | Jenkins vs GitHub YAML differences             | P3            |
| `generate_test_data_factory` | Faker.js schema validation                     | P3            |
| `suggest_refactorings`       | God Node files flagged as refactor targets     | P3            |
| `summarize_suite`            | Empty suite / no `.feature` files              | P3            |
| `manage_users`               | Missing `users.{env}.json` file                | P3            |

---

## Phase 3 — Cross-Cutting Hardening (Both Servers)

These issues affect both servers and should be fixed once as patterns.

### H1 — Null Safety Audit

**Pattern:** Services return `undefined` when data is missing; callers assume it's always present.

- Audit all `service.getSomething()` call sites — add null coalescence or early-exit guards.
- **Files at risk:** `TestGenerationService`, `SelfHealingService`, `LearningService`

### H2 — Error Taxonomy Unification

**Goal:** Replace all `throw new Error('...')` with typed, structured errors.

- **GS-05** (AppForge) + equivalent in TestForge
- Use `McpErrorCode` enum: `SESSION_TIMEOUT`, `FILE_NOT_FOUND`, `SCHEMA_VALIDATION_FAILED`
- Tool handlers return graceful degradation, not stack traces

### H3 — Retry Engine for Transient Failures

**Goal:** Wrap Appium starts, file writes, network calls in retry-with-backoff.

- **GS-06** (AppForge) + integrate in TestForge's `PlaywrightSessionService`
- Max 3 attempts, exponential backoff, jitter

### H4 — Binary File Guard

**Goal:** Prevent reading `.apk`, `.png`, `.ipa` as text — burns tokens silently.

- **GS-04** (AppForge) + mirror in TestForge's `SandboxExecutionService`
- Magic-byte sniff on first 64KB

### H5 — Max-Turns Guard in Self-Healing Loops

**Goal:** Cap self-heal loops at 3 attempts in both servers.

- **GS-12** (AppForge) already speced. Apply same guard to TestForge's `validate_and_write`
- After 3 failures → return structured `MAX_ATTEMPTS_REACHED` response

### H6 — Tool Output Verbosity (Minimal Echoes)

**Goal:** All tools should acknowledge in ≤10 words, not repeat input params.

- **GS-08** (AppForge) already speced. Audit all TestForge tool descriptions.
- **Format Parity:** TestForge will follow the **AppForge "Gold Standard"** format for descriptions (Title, Trigger, Action, Returns, Next, Cost, Errors, Output Instructions).
- This directly reduces token consumption per session and improves agent reliability.

---

## Execution Order

```
Week 1: TestForge P0+P1 tools (Tiers A+B)
Week 2: AppForge P0+P1 tools (Tiers A+B)
Week 3: Both servers P2 (Tiers C+D)
Week 4: Cross-cutting hardening H1–H6 + P3 polish
```

### Session Template (Per Tool)

Each tool hardening session follows this structure:

1. **Read** the tool handler + backing service (targeted grep, not full file read)
2. **Identify** the 3 most likely failure modes (null input, missing file, bad state)
3. **Break it** — call with each failure input
4. **Patch** — minimal fix only
5. **Verify** — re-run, confirm stable
6. **Log** — `train_on_example` with pattern + fix

---

## Done Criteria

The phase is complete when:

- [ ] Every P0/P1 tool in both servers has been break-tested and all failures fixed
- [ ] Every P2 tool has been break-tested; known failures documented or fixed
- [ ] Error taxonomy (H2) unified in both servers — no raw `throw new Error`
- [ ] Retry engine (H3) applied to all session-start and file-write operations
- [ ] Binary file guard (H4) active on both servers
- [ ] Max-turns guard (H5) capped at 3 in both healing loops
- [ ] `train_on_example` called after every non-trivial fix
- [ ] Both servers build with `0 TypeScript errors`
- [ ] A "stress test" session can run 10 tools sequentially on a real project without crash

---

## Out of Scope (Explicitly Deferred)

- Multi-tenancy / AsyncLocalStorage scoping (poc.md Phase 2)
- GS-09 Sparse Action Map (new capability)
- GS-10 JIT OS Skills (new capability)
- GS-15 Structural Brain new features
- Cloudflare tunnel / horizontal scaling
- Any new tool additions to either server
