---
title: "🔰 AppForge Onboarding & Configuration Guide"
---

This guide provides the essential "First Contact" prompts and a configuration questionnaire to ensure the MCP tool is perfectly aligned with your project's unique mobile architecture.

---

## 1. The "First Contact" Prompts

When you connect this MCP to your AI assistant (e.g., Claude Desktop, Cursor, Antigravity), use these prompts sequentially to establish a solid foundation.

### Step 1: Smart Mobile Discovery
> "I want to integrate this MCP with my existing mobile project. Run `analyze_codebase` on `/your/project/path` to discover my existing Android and iOS Page Objects, step definitions, and environment configurations. If you find any existing `wdio.conf.ts` or `mcp-config.json` files, tell me how we can reuse them instead of creating new ones."

### Ongoing Development
- [ ] Run `npm run lint` regularly.
- [ ] Maintain 100% pass rate in the **Gold Standard Evaluation Harness** (`docs/evaluation/`).
- [ ] Run the evaluation suite before EVERY merge or ship action.
- [ ] Update `appforge_evaluation.xml` when adding new tools.
- [ ] Check `docs/issues.md` for current blockers.

### Step 2: Environment Readiness Check
> "Check my environment using `check_environment`. Ensure the Appium server is reachable and tell me if I need to install any missing Android SDKs or iOS drivers. If my emulator isn't booted, please provide the exact command to start it."

### Step 3: Adaptive Upgrading & Environments
> "Run `upgrade_project` to incrementally align my directory structure with the newest AppForge capabilities. Ensure my `mcp-config.json` is synced, set up `MobileGestures.ts`, and confirm my test environments (like `staging` or `prod`) are properly mapped via the new `currentEnvironment` architecture."

### Step 4: Token Optimization & Sandbox Setup
> "Check if the token-optimized code mode is functioning correctly. Use `execute_sandbox_code` to locally read my `mcp-config.json`, extract the `version` and the active testing `environments`, and return only those details instead of printing the whole file into the chat."

---

## 2. `mcp-config.json` Questionnaire

Before finalizing your setup, review this questionnaire. These values control how the AI thinks and writes mobile code for your team.

| Configuration Field | Your Decision | Example / Guide |
| :--- | :--- | :--- |
| **`defaultPlatform`** | Which OS do we test by default? | `"Android"`, `"iOS"`, or `"both"` (for dual-platform POMs). |
| **`capabilitiesProfiles`** | What devices are in your lab? | `{ "pixel8": { ... }, "iphone15": { ... } }` |
| **`locatorOrder`** | Which locators do we trust? | `["accessibility id", "resource-id", "xpath"]` |
| **`paths`** | Where should files be saved? | `{ "featuresRoot": "features", "pagesRoot": "pages", ... }` |
| **`credentials.strategy`** | How do we securely handle logins? | `"per-env-files"`, `"role-env-matrix"`, or `"custom"`. |
| **`environments`** | What are your target network pipelines? | `["local", "staging", "prod"]` |
| **`codegen.tagTaxonomy`**| What test tags are permitted in Gherkin?| `["@smoke", "@regression", "@p0"]` |

---

## 3. The "Native First" Enforcement Rule

To prevent the AI from "taking shortcuts" (like using fragile XPaths in steps), always include this in your session instructions:

> "**ENFORCEMENT**: You must use the Page Object Model pattern. Every UI interaction must be encapsulated in a Page class method. Step definitions MUST NOT call `$(selector).click()` directly; they must call `await loginPage.submitForm()` or equivalents. Prioritize `accessibility id` (~ID) for all new locators to ensure cross-platform stability."

---

## 4. Why Use `MobileGestures.ts`?
The tool scaffolds a specialized `MobileGestures.ts` file. Instead of telling the AI to *"Swipe up using W3C actions"*, simply say:
> *"Use the `MobileGestures` utility to scroll until the 'Sign Out' button is visible."*

This ensures the generated code is clean, reusable, and handles the low-level coordinate math for you.