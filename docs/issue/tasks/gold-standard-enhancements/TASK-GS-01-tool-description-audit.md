# TASK-GS-01 — Tool Description Audit (<2048 Character Limit)

**Status**: TODO  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — foundational task  
**Build check**: `npm run build` in `/Users/rsakhawalkar/forge/AppForge`

---

## Context (No Prior Chat Needed)

The MCP SDK enforces a strict **2048 character limit** on tool descriptions. Any description exceeding this limit will be truncated by the Claude Code client during evaluation, leading to:
- Unclear tool usage by the LLM
- Failed evaluation scores (TASK-46)
- Incomplete instructions reaching the agent

Current AppForge tools have descriptions ranging from 500 to 3500+ characters. Several tools exceed the 2048 limit.

**Target**: All tool descriptions must be ≤2048 characters while retaining essential usage information.

---

## What to Change

### File: `/Users/rsakhawalkar/forge/AppForge/src/index.ts`

Audit every tool registration and trim descriptions that exceed 2048 characters.

#### Step 1 — Identify Tools Exceeding Limit

Search for all tool descriptions in `index.ts`. Tools likely exceeding 2048 chars:
- `generate_cucumber_pom` (currently ~3200 chars with examples)
- `self_heal_test` (currently ~2800 chars with multi-step guide)
- `analyze_codebase` (currently ~2600 chars with detailed output format)
- `generate_ci_workflow` (currently ~2400 chars with platform options)
- `run_cucumber_test` (currently ~2300 chars with execution details)

#### Step 2 — Trim Strategy (Preserve Core Information)

For each tool exceeding 2048 chars, apply these trimming rules:

**Keep (Essential)**:
1. What the tool does (1-2 sentences)
2. Required parameters and their types
3. When to use this tool vs. alternatives
4. Critical warnings (e.g., "requires active session")
5. Expected output format (compact summary)

**Remove (Non-Essential)**:
1. Verbose examples (replace with 1 compact example)
2. Duplicate information from parameter descriptions
3. Lengthy "Best Practices" sections (move to docs if needed)
4. Historical context ("Previously this tool...")
5. Multiple scenario walkthroughs

**Example Transformation**:

**Before (3200 chars)**:
```typescript
description: `Generate Cucumber Page Object Model files with step definitions.

This tool creates a complete test automation structure for a mobile screen:
- Page Object class with selectors
- Step definition file with Gherkin mappings
- Helper utilities for common actions

WHEN TO USE:
Use this after inspecting the UI hierarchy with inspect_ui_hierarchy.
Do not use if the screen already has a Page Object.
Use migrate_test if converting existing tests.

PARAMETERS:
- screenName: The name of the mobile screen (e.g., "LoginScreen")
  Should match the screen you inspected.
  Use PascalCase naming convention.
  Examples: "LoginScreen", "ProductDetailScreen", "CheckoutFlow"

[...continues for 3200 characters with extensive examples...]`
```

**After (1950 chars)**:
```typescript
description: `Generate Cucumber Page Object Model (POM) files with step definitions for a mobile screen.

Creates: Page Object class with selectors, step definition file, helper utilities.

WHEN TO USE: After inspecting UI with inspect_ui_hierarchy. Do not use if Page Object exists (use migrate_test instead).

PARAMETERS:
- screenName (required): Screen name in PascalCase (e.g., "LoginScreen")
- uiHierarchy (required): XML from inspect_ui_hierarchy or JSON action map
- testScenario (required): User story in Gherkin Given/When/Then format

SELECTOR PRIORITY: accessibility-id > resource-id > xpath (last resort)

OUTPUT: Creates files in src/pages/ and src/steps/. Returns file paths and validation results.

REQUIREMENTS: Active Appium session not needed, but mcp-config.json must exist.

EXAMPLE:
screenName: "LoginScreen"
testScenario: "Given I am on login screen\nWhen I enter credentials\nThen I see dashboard"

WARNING: Overwrites existing files with same screenName. Use version control.`
```

#### Step 3 — Verify Character Counts

After trimming each tool, verify the count:

```typescript
function getCharCount(desc: string): number {
  return desc.length;
}

// Before committing, manually check each description:
console.log('generate_cucumber_pom:', getCharCount(generatePomDescription));
// Must output: <= 2048
```

#### Step 4 — Tools Requiring Trimming

Based on typical patterns, focus on these tools (verify actual counts first):

1. **generate_cucumber_pom** — Trim examples, consolidate parameter docs
2. **self_heal_test** — Remove multi-step walkthrough, keep algorithm summary
3. **analyze_codebase** — Simplify output format description
4. **generate_ci_workflow** — Remove platform comparison table
5. **run_cucumber_test** — Consolidate execution options
6. **start_appium_session** — Trim capability examples
7. **inspect_ui_hierarchy** — Simplify XML format explanation
8. **workflow_guide** — Condense workflow examples

---

## Verification

1. Run this command to check all description lengths:
   ```bash
   grep -A 50 'description:' src/index.ts | grep -E '`$' -B 50 | wc -c
   ```

2. Manual verification:
   - Copy each description
   - Paste into character counter
   - Confirm ≤2048

3. Run `npm run build` — must pass with zero errors

4. Test one tool manually to ensure description still makes sense:
   ```bash
   # In MCP client, call a tool and verify description is clear
   ```

---

## Done Criteria

- [ ] All tool descriptions audited for character count
- [ ] Every description ≤2048 characters
- [ ] Essential information retained (what, when, parameters, output)
- [ ] Non-essential verbosity removed
- [ ] `npm run build` passes with zero errors
- [ ] At least one tool tested to verify description clarity
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Preserve accuracy over verbosity** — better to be concise and correct than verbose and truncated
- **Parameter descriptions count toward limit** — keep them brief
- **Move detailed guides to docs/** if trimming makes descriptions unclear
- **This is a release blocker** — evaluation harness requires this