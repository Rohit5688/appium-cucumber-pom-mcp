---
title: "🛠️ Tool Description Standard"
---

**Version**: 1.0  
**Date**: 2026-04-10  
**Purpose**: Standardized format for LLM-optimized tool descriptions

---

## 📐 Format Specification

All tool descriptions MUST follow this structured format:

```
TRIGGER: <When to call this tool>
RETURNS: <Output schema>
NEXT: <Suggested follow-up tools>
COST: <Token/time cost estimate>
ERROR_HANDLING: <How errors are surfaced>
```

### Field Definitions

#### **TRIGGER**
- **Purpose**: Tells the LLM *when* to invoke this tool
- **Format**: Clear, action-based trigger conditions
- **Examples**:
  - ✅ "User requests test creation OR coverage gap identified"
  - ✅ "Test failure with 'element not found' error"
  - ❌ "This tool creates tests" (too vague)

#### **RETURNS**
- **Purpose**: Defines exact output schema
- **Format**: TypeScript-style schema or JSON example
- **Examples**:
  - ✅ `{ prompt: string, suggestedSteps: Step[] }`
  - ✅ `{ candidates: Array<{selector, confidence, strategy}> }`
  - ❌ "Returns data" (not specific enough)

#### **NEXT**
- **Purpose**: Guides the LLM to next logical tool call
- **Format**: Conditional list of follow-up tools
- **Examples**:
  - ✅ `If candidates.length > 0 → verify_selector | If verified → Update page object`
  - ✅ `Always call validate_and_write after LLM generates code`
  - ❌ "Use other tools" (not actionable)

#### **COST**
- **Purpose**: Helps LLM prioritize tool calls based on resource usage
- **Format**: `Low | Medium | High` with reasoning
- **Categories**:
  - **Low**: <50 tokens, no execution, fast (e.g., reading config)
  - **Medium**: 50-500 tokens, file reads, parsing (e.g., analyze codebase)
  - **High**: >500 tokens, process execution, network calls (e.g., run tests)
- **Examples**:
  - ✅ `Low (parses XML, no device interaction)`
  - ✅ `High (executes 2-hour test suite, returns full logs)`
  - ❌ "Fast" (not quantified)

#### **ERROR_HANDLING**
- **Purpose**: Tells LLM what exceptions to expect
- **Format**: McpError types and recovery strategies
- **Examples**:
  - ✅ `Throws McpError if XML is invalid | Recovery: call inspect_ui_hierarchy`
  - ✅ `Returns { found: false } if session not active | NEXT: start_appium_session`
  - ❌ "May fail" (not actionable)

---

## 📝 Complete Example

### **Tool**: `self_heal_test`

```
TRIGGER: Test failure with "element not found" OR selector broken after app update
RETURNS: { candidates: Array<{selector, confidence, strategy}>, promptForLLM: string }
NEXT: 
  - If candidates.length > 0 → verify_selector to confirm
  - If verified → Update page object with new selector
  - If candidates.length === 0 → inspect_ui_hierarchy to see current screen
COST: Low (parses XML, no device interaction)
ERROR_HANDLING: Throws McpError if XML is invalid or no elements match fuzzy search
```

---

## 🎯 Migration Checklist

When updating a tool description:

- [ ] Extract current "when to use" logic into TRIGGER section
- [ ] Document return type in RETURNS (from code or JSDoc)
- [ ] Map workflow dependencies into NEXT section
- [ ] Estimate COST based on operations performed
- [ ] Document error paths in ERROR_HANDLING
- [ ] Remove vague language ("helps", "useful", "allows")
- [ ] Test description by having LLM read it cold (does it know when/how to use?)

---

## 🚫 Anti-Patterns to Avoid

### ❌ Vague Descriptions
```
"This tool helps with testing"
→ No TRIGGER, no RETURNS, no actionable info
```

### ❌ Implementation Details Instead of Intent
```
"Reads mcp-config.json and parses capabilities object"
→ Should be: "TRIGGER: Need device/app configuration for test execution"
```

### ❌ Missing Cost Information
```
"COST: Fast"
→ Should be: "COST: Medium (reads 5-10 files, parses AST, ~200 tokens)"
```

### ❌ Circular NEXT Logic
```
"NEXT: Call any related tool"
→ Should be: "NEXT: If success → run_cucumber_test | If validation fails → fix errors manually"
```

---

## 📊 Priority Order for Tool Updates

Update tools in this order to maximize LLM effectiveness:

### **Tier 1: Critical Path Tools** (Update First)
1. `execute_sandbox_code` — Most frequently used, need clear API docs
2. `generate_cucumber_pom` — Core workflow entry point
3. `start_appium_session` — Session management foundation
4. `inspect_ui_hierarchy` — Debug/inspection workhorse
5. `run_cucumber_test` — Test execution loop

### **Tier 2: High-Impact Tools**
6. `self_heal_test` — Complex decision tree
7. `validate_and_write` — Critical validation step
8. `check_environment` — Pre-flight checks
9. `manage_config` — Configuration gateway
10. `workflow_guide` — Navigation aid

### **Tier 3: Specialized Tools** (Update as Time Permits)
- Analysis tools: `audit_mobile_locators`, `suggest_refactorings`, `analyze_coverage`
- Maintenance tools: `upgrade_project`, `repair_project`, `train_on_example`
- Utility tools: `export_bug_report`, `generate_ci_workflow`, `summarize_suite`

---

## 🧪 Validation Test

After updating a description, test with this prompt to an LLM:

```
Given this tool description:
[PASTE DESCRIPTION]

Answer:
1. When should I call this tool?
2. What does it return?
3. What should I do after calling it?
4. How expensive is it to run?
5. What errors might I see?
```

If the LLM answers incorrectly, the description needs revision.

---

## 📚 Additional Resources

- **Tool Audit Report**: `docs/issue/pipeline/TOOL_AUDIT_REPORT.md`
- **Independent Tool Analysis**: `docs/issue/pipeline/INDEPENDENT_TOOL_ANALYSIS.md`
- **Error System Reference**: `src/types/ErrorSystem.ts`
- **Workflow Orchestration**: `docs/Workflows.md`

---

**Enforcement**: All new tools MUST use this format. Existing tools will be migrated per the priority order above.