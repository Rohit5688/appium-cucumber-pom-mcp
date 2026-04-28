# Maestro → AppForge Reuse Opportunities
**Source**: Full read of `C:\Users\Rohit\mcp\maestro\maestro-cli\src\main\java\maestro\cli\mcp\`
**Status**: Validated against actual Maestro source code. Not speculation.

---

## Priority 1 — Rich Tool Descriptions *(Zero-code, Critical LLM Impact)*

**Maestro source**: `InspectScreenTool.kt` lines 14–29

Maestro bakes **agent guidance directly into the tool description** — not in a separate guide:
```
"Always copy txt values verbatim; never author them from a screenshot — common source of
hallucinated strings (e.g. a heart icon looks like 'Favorite' in a screenshot but has no text)."

"text: matcher is full-string regex IGNORE_CASE — partial strings do NOT match.
text: 'RNR 352' misses 'RNR 352 - Expo Launch with Cedric van Putten'. Use 'RNR 352.*'."

"Map a11y to text: when authoring selectors; never pass a11y as a selector key."
```

**AppForge current state**: `inspect_ui_hierarchy` description = 6 lines of TRIGGER/RETURNS/COST.
Equivalent guidance is absent — LLM has to guess or fail.

**Action**: Add to `inspect_ui_hierarchy` description:
1. "Copy `accessibilityId` / `text` values verbatim from output — never infer from a screenshot"
2. "Use `~accessibilityId` first. `text=` in WebdriverIO is a substring match — prefer exact strings"
3. "Re-inspect after every tap/navigation — never guess the next screen"

---

## Priority 2 — Atomicity Guidance in `workflow_guide` *(Zero-code, Critical LLM Impact)*

**Maestro source**: `McpServer.kt` INSTRUCTIONS line 41
```
"Prefer one full flow over many single-command calls."
```

This single line prevents the biggest class of hiccups: LLM making inspect→tap→inspect→tap
micro-cycles instead of writing one complete test.

**AppForge current state**: `workflow_guide.ts` has step-by-step sequences but no "prefer
atomic tests over repeated inspect+tap cycles" guidance. `create_test_atomically` exists but
isn't surfaced as the **preferred** pattern.

**Action**: Add to `workflow_guide.ts` write_test workflow section:
```
PREFER: one generate_cucumber_pom → validate_and_write → run_cucumber_test cycle.
AVOID: repeated inspect_ui_hierarchy → tap → inspect round trips — each adds latency
and state drift. One atomic test beats ten micro-calls.
```

---

## Priority 3 — Schema-Driven `hasNonDefaultValues` Pruning *(Medium Effort)*

**Maestro source**: `ViewHierarchyFormatters.kt` lines 318–346

Maestro checks **every attribute against platform-specific schema defaults** before keeping a node:
```kotlin
val defaultValue = defaults[attr]     // from Android/iOS schema
val isNonDefault = when (defaultValue) {
    is String  -> value != defaultValue
    is Boolean -> value.toBooleanStrictOrNull() != defaultValue
    else       -> !value.isNullOrBlank()
}
```
A `LinearLayout` with `enabled=true` (default), `clickable=false` (default), no text, no rid →
**discarded completely**, children promoted. This removes entire layers of invisible structure.

**AppForge current state**: `buildCompactFromRaw` in `MobileSmartTreeService.ts` prunes
zero-size and attribute-empty nodes but without schema-driven default comparison.
E.g., a node with only `enabled="true"` still passes through.

**Action**: Update `buildCompactFromRaw` to compare against `ANDROID_COMPACT_SCHEMA.defaults`
and `IOS_COMPACT_SCHEMA.defaults`. This closes the gap to Maestro's pruning fidelity.

---

## Priority 4 — Positional Selector Hints When No Good Locator Exists

**Maestro source**: `InspectScreenTool.kt` description line 21
```
"tapOn / assertVisible accept text, id, index, and position matchers
(below, above, leftOf, rightOf)."
```
Maestro explicitly tells the LLM about spatial selectors as an alternative when text/id are absent.

**AppForge current state**: `rankLocators()` ranks `accessibilityId > resourceId > text > xpath`
but when all are absent, it falls to xpath with no spatial alternative offered.

**Action**: When `rankLocators()` would only yield xpath, append a spatial hint:
```
⚠️ No stable locator found. Bounds: [x1,y1][x2,y2].
   Try: $('~ParentContainer').getChildByIndex(n) or coordinate tap.
```

---

## Priority 5 — YAML Output Format for Token Efficiency

**Maestro source**: `ViewHierarchyFormatters.kt` lines 177–200

Maestro supports **YAML output** for the hierarchy in addition to JSON.
YAML is ~30% smaller than compact JSON for deeply nested trees — no braces, no quotes on keys.

```yaml
---
ui_schema:
  platform: android
  abbreviations: {b: bounds, txt: text}
elements:
  - b: "[0,0][1080,200]"
    txt: "Login"
    clickable: true
    c:
      - txt: "Username"
```

**AppForge current state**: `format:"compact"` outputs JSON only.

**Action**: Add `format:"yaml"` to `inspect_ui_hierarchy`. Implement a recursive YAML
serializer in `MobileSmartTreeService.ts` (no external dep — simple indent-based writer).

---

## Priority 6 — LLM-Level Evals Framework

**Maestro source**: `README.md` lines 41–45
```yaml
# maestro-evals.yaml
- scenario: "inspect then tap login"
  tool: inspect_screen
  assert_llm_uses_output: true
```
Maestro runs **end-to-end LLM evals** — not just unit tests. Tests that the LLM can correctly
call the tool AND use the output appropriately.

**AppForge current state**: `ExecutionService.issue15.test.ts` tests service layer only.
No validation that an LLM can successfully navigate the tools to build a working selector.

**Action**: Create `docs/appforge-evals.yaml` with 5 scenarios:
- "Given this XML dump, identify best locator for Login button"
- "Given this heal failure + XML, apply `self_heal_test` and pick correct candidate"
- "Given a broken selector, complete full heal cycle to a passing test"

---

## Priority 7 — CSV Output for Tabular Analysis

**Maestro source**: `ViewHierarchyFormatters.kt` lines 95–153

Maestro keeps a compact CSV format with `parent_id` column:
```
id,depth,bounds,text,resource_id,accessibility,...,parent_id
0,0,"[9,22][402,874]",,,,"Demo App",,,,1,,,,,
3,1,"[330,768][386,824]",,fabAddIcon,"Increment",,,,,1,,,,,0
```
Useful when the LLM needs to do tabular analysis ("find all clickable elements at depth 2")
without parsing a JSON tree.

**AppForge current state**: `dehydratedText` from `buildSparseMap()` is a freeform text table
without `parent_id` — no structural parent-child tracking.

**Action (low priority)**: Add `format:"csv"` to `inspect_ui_hierarchy` outputting compact
CSV with `parent_id` column. Low effort addition to the existing `buildCompactTree` pipeline.

---

## Summary — Prioritized by Effort vs. Impact

| # | Opportunity | Effort | Impact |
| :- | :--- | :--- | :--- |
| 1 | Rich tool descriptions (anti-hallucination, selector rules) | 🟢 Low — text edit | 🔴 Critical |
| 2 | Atomicity guidance in `workflow_guide` | 🟢 Low — text edit | 🔴 Critical |
| 3 | Schema-driven `hasNonDefaultValues` pruning | 🟡 Medium — code | 🟠 High |
| 4 | Positional selector hints in `rankLocators` | 🟢 Low — code | 🟡 Medium |
| 5 | YAML output format | 🟡 Medium — code | 🟡 Medium |
| 6 | LLM-level evals framework | 🟡 Medium — YAML | 🟠 High |
| 7 | CSV output format | 🟢 Low — code | 🟢 Low |

**Immediate wins (no code required)**: Items 1 + 2.
These are pure description text changes that directly improve LLM behavior on every call.

---

*Validated from Maestro source — April 28, 2026*
