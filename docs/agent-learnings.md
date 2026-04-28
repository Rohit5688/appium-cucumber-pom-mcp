# AppForge — Agent Learnings (Tier 2)
> Codebase-specific gotchas, patterns, and decisions for THIS repo only.
> General patterns → Tier 1 KI. Generation fixes → Tier 3 train_on_example.

---

## 2026-04-28 — Maestro MCP Teardown + Compact Tree Implementation

### GOD NODE: `MobileSmartTreeService` — edit surgically
- Singleton via `getInstance()`. Used by `UiHierarchyInspector`, `ContextManager`, test files.
- New public methods added: `buildCompactTree()`. All private helpers prefixed `compact*` or `raw*` to avoid collisions with existing `buildSparseMap` helpers.
- Cache key prefix `"compact:"` prevents collision with existing `buildSparseMap` cache keys.

### BUG FIXED: XML regex only caught self-closing tags
Old regex: `/<([A-Za-z.]+)\s([^>]*?)\/>/g` — missed `<Tag>...</Tag>` container forms.
New: `parseXmlToTree()` stack-based parser handles both. Lives in `MobileSmartTreeService`.

### RETURN TYPE GAP: `inspectHierarchy` did not expose `platform`
`UiHierarchyInspector.inspectHierarchy` determines platform internally but never returned it.
Any caller doing `(result as any).platform` would silently get `undefined`.
**Fix**: `platform: 'android' | 'ios'` added to return type and all 3 return sites in `UiHierarchyInspector.ts`.

### PROXY PATTERN: `ExecutionService` is a thin pass-through
`ExecutionService.inspectHierarchy()` is a 1-line delegate to `uiInspector.inspectHierarchy()`.
Return type is inferred — no explicit typing needed there. TypeScript resolves it automatically.

### Logger already uses stderr — no stdout hygiene work needed
`Logger.ts` line 47: `process.stderr.write(...)`. Channel is clean. Do not add a claimMcpStdout shim.

### How to call compact tree from MCP
```json
{ "tool": "inspect_ui_hierarchy", "args": { "format": "compact" } }
```
Internally sets `includeRawXml=true`, fetches XML, calls `MobileSmartTreeService.getInstance().buildCompactTree(xml, platform)`.
Falls back to default table mode if `rawXml` is absent (e.g., stepHints native-query early-exit path).

### `diff_ui_state.ts` has its own fingerprint-based XML parser
Do NOT route it through `MobileSmartTreeService`. It is intentionally a zero-dependency, stateless regex fingerprinter. Keep it separate.

---

## 2026-04-28 — Maestro Reuse Analysis + ImageContent + Description Enrichment

### CRITICAL GAP FIXED: Screenshots were never sent to the LLM
`inspect_ui_hierarchy` stored screenshots to disk and returned only `screenshotPath`.
LLMs cannot open file paths — the screenshot was effectively invisible.
**Fix**: Added `textAndImageResult()` to `_helpers.ts`. Returns `TextContent + ImageContent` in one response.
Used in `inspect_ui_hierarchy` (table mode) and `self_heal_test`.
`generate_cucumber_pom` was NOT changed — it passes screenshot as generation prompt context, not for agent vision.

### NEW HELPER: `textAndImageResult(text, screenshotBase64?, structured?)`
- Location: `src/tools/_helpers.ts`
- Gracefully degrades to text-only if `screenshotBase64` is undefined/empty.
- MCP `mimeType: "image/png"` — Maestro converts to JPEG but we keep PNG (already small enough).

### TOOL DESCRIPTION = FIRST-CLASS AGENT INSTRUCTION
Maestro's `inspect_screen` description is 16 lines of hard agent rules (anti-hallucination, selector mapping, regex matching).
AppForge's `inspect_ui_hierarchy` was 6 lines. Now enriched with:
1. Copy accessibilityId/text VERBATIM (never infer from screenshot)
2. Use `~accessibilityId` first — `text=` in WebdriverIO is substring match
3. Re-inspect after every tap/navigation — never guess next screen
4. `format:'compact'` reminder

### ATOMICITY RULE ADDED to `workflow_guide.ts`
Added to `write_test.description`:
> "ATOMICITY RULE: PREFER one generate_cucumber_pom → validate_and_write → run_cucumber_test cycle.
> AVOID repeated inspect_ui_hierarchy → tap → inspect round trips."
Also added re-inspect reminder to `inspect_device` step 2 `onSuccess`.

### REMAINING BACKLOG (from maestro-reuse-opportunities.md)
| # | Item | Effort |
|---|------|--------|
| 3 | Schema-driven `hasNonDefaultValues` pruning in `buildCompactFromRaw` | Medium |
| 4 | Positional selector hints in `rankLocators` when no stable locator exists | Low |
| 5 | `format:"yaml"` output mode | Medium |
| 6 | LLM-level evals framework (`docs/appforge-evals.yaml`) | Medium |
| 7 | `format:"csv"` with parent_id | Low |

Full details: `docs/maestro-reuse-opportunities.md`
Full validation: `docs/maestro-mcp-analysis.md`

---

## 2026-04-28 — Full Ripple Audit (Post-Medium-Tasks)

### BUG FIXED: ImageContent was never sent in live mode
`inspect_ui_hierarchy.ts` line 189 was calling `textAndImageResult(text, args.screenshotBase64, ...)`.
`args.screenshotBase64` is a caller-supplied param — in live session mode it is always `undefined`.
`UiHierarchyInspector` captured the screenshot internally but discarded the base64 (only stored path).
**Fix**: Added `screenshotBase64?: string` to `UiHierarchyInspector.inspectHierarchy()` return type.
Now returns `screenshotBase64: screenshot || undefined` alongside `screenshotPath`.
Consumer updated to `result.screenshotBase64 || args.screenshotBase64` (covers both live + offline).

### AUDIT PASS — All hooks confirmed ✅

| Change | File | Status |
|---|---|---|
| `textAndImageResult` defined | `_helpers.ts` L12 | ✅ |
| `textAndImageResult` used in table mode | `inspect_ui_hierarchy.ts` L189 | ✅ fixed |
| `textAndImageResult` used in self_heal | `self_heal_test.ts` L128 | ✅ |
| `buildCompactTree` defined + called | `MobileSmartTreeService.ts` L334, `inspect_ui_hierarchy.ts` L168 | ✅ |
| `buildCompactYaml` defined + called | `MobileSmartTreeService.ts` L457, `inspect_ui_hierarchy.ts` L179 | ✅ |
| `compactHasContent(attrs, platform)` signature | `MobileSmartTreeService.ts` L408 | ✅ |
| `compactHasContent` call site passes platform | `MobileSmartTreeService.ts` L383 | ✅ |
| `format:"yaml"` in enum | `inspect_ui_hierarchy.ts` L89 | ✅ |
| `needRawXml` includes yaml | `inspect_ui_hierarchy.ts` L127 | ✅ |
| yaml routing block present | `inspect_ui_hierarchy.ts` L176 | ✅ |
| `platform` in return type | `UiHierarchyInspector.ts` L31 | ✅ |
| `platform` in both return sites | `UiHierarchyInspector.ts` L66, L125 | ✅ |
| `screenshotBase64` in return type | `UiHierarchyInspector.ts` L26 | ✅ fixed |
| Atomicity rule in workflow_guide | `workflow_guide.ts` L41 | ✅ |
| Re-inspect mandate | `inspect_ui_hierarchy.ts` L76, `workflow_guide.ts` L119 | ✅ |
