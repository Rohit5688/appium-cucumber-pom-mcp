# 🕵️ Maestro MCP Analysis — Validated Against Source Code
**Date**: April 28, 2026
**Validated by**: Deep source-code read of `maestro-cli/src/main/java/maestro/cli/mcp/`
**AppForge files audited**: `MobileSmartTreeService.ts`, `UiHierarchyInspector.ts`, `inspect_ui_hierarchy.ts`, `Logger.ts`, `index.ts`

---

## ✅ Validated Claims

### 1. Zero-Size Pruning
**Source**: `ViewHierarchyFormatters.kt` lines 284–287, 308–316
Elements with 0px width OR height are discarded. Their children are promoted up one level so no data is lost. **CONFIRMED.**

### 2. Alias Mapping + `ui_schema` Injection
**Source**: `ViewHierarchyFormatters.kt` lines 222–275
Full attribute names are replaced with single-letter keys (`b`=bounds, `txt`=text, `rid`=resource-id).
A `ui_schema` block is emitted alongside the data so the LLM can decode the aliases.
Token reduction: **60–80%** over raw XML. **CONFIRMED.**

### 3. Structural Skeleton (tree preserved)
**Source**: `compactTreeData()` in `ViewHierarchyFormatters.kt` lines 283–306
Maestro keeps parent-child nesting. Empty layout containers are pruned but the skeleton survives.
This lets the LLM disambiguate identical labels by parent context (e.g., "Save inside Account Settings vs. Save inside Profile"). **CONFIRMED.**

### 4. Declarative YAML + Zero-Wait Intelligence
**Source**: `RunTool.kt` uses `Orchestra.runFlow()`
The LLM writes high-level YAML (`- tapOn: "Login"`) not pixel coordinates.
The Orchestra engine auto-polls/waits for elements — no explicit `waitFor` calls needed. **CONFIRMED.**

### 5. Re-Inspection Mandate
**Source**: `McpServer.kt` INSTRUCTIONS text, line 38
`"Re-inspect after any UI change."`
⚠️ **PARTIALLY CONFIRMED** — it is *guidance in the prompt*, not a hard technical gate.
The LLM can still skip re-inspection if it decides to. The fast agent slightly oversold this as a hard enforcement.

---

## ✅ "Hiccup-Free" Navigation — How Maestro Actually Does It

This is the key question from the original session. The answer is a **3-part protocol**, all validated from source.

### Part 1 — "One full flow over many single-command calls"
**Source**: `McpServer.kt` INSTRUCTIONS, line 41
```
"Prefer one full flow over many single-command calls."
```
This is the **most important** mechanism. Instead of calling `run` once per tap (which would require a round-trip + re-inspect per step), the LLM writes a **complete YAML flow** covering the entire journey in one shot:
```yaml
- launchApp
- tapOn: "Login"
- inputText: "user@example.com"
- tapOn: "Submit"
- assertVisible: "Dashboard"
```
One `run` call. One Orchestra execution. No mid-flow MCP latency.

### Part 2 — Orchestra Engine Auto-Waits
**Source**: `RunTool.kt` line 168
```kotlin
orchestra.runFlow(commands.withEnv(finalEnv))
```
The `Orchestra` runner handles waits internally for every command. There are no explicit `waitFor` calls needed. If `tapOn: "Submit"` runs before the button appears, Orchestra retries automatically. This removes the entire class of "element not found" hiccups that happen when the LLM fires commands before the screen settles.

### Part 3 — Validated Re-Inspect After Each `run`
**Source**: `McpServer.kt` INSTRUCTIONS, line 38
```
"Re-inspect after any UI change."
```
After a `run` completes, the LLM is instructed to call `inspect_screen` to get the new screen state. This prevents the agent from "guessing" what screen it is on and keeps the navigation loop grounded.

### What Maestro's Workflow Loop Looks Like
```
list_devices
  └─► inspect_screen        ← see current state
        └─► run (full YAML) ← execute entire journey atomically
              └─► inspect_screen ← verify new state, then repeat
```
Each `run` is a complete atomic journey. The LLM never drives individual taps through MCP — it authors and submits a full script.

### AppForge Equivalent & Gap
AppForge uses Cucumber BDD where each step is an Appium call. The atomic equivalent is `create_test_atomically`, but it isn't surfaced as prominently in `workflow_guide.ts`. The `NavigationGraphService` fills the "know where you are" role, but there's no "prefer one big test over many small inspect+tap cycles" guidance for the agent.

**Action**: Update `workflow_guide.ts` `write_test` workflow description to include this guidance explicitly.

---

### 6. `claimMcpStdout` — JSON-RPC Hygiene
**Source**: `McpServer.kt` lines 63–66
Maestro captures the real `System.out` for the MCP protocol and redirects all other JVM output to `System.err`, preventing library banners from corrupting the JSON-RPC stream. **CONFIRMED.**

### 7. `cheat_sheet` Dynamic Remote API
**Source**: `CheatSheetTool.kt` line 44
Calls `https://api.copilot.mobile.dev/v2/bot/maestro-cheat-sheet` with auth.
Requires Maestro Cloud credentials — not publicly accessible. **CONFIRMED.**
The `llms.txt` at `https://docs.maestro.dev/llms.txt` is the public proxy for this knowledge.

---

## ❌ One Wrong Claim (Corrected)

### stdout Hygiene Gap — DOES NOT APPLY TO APPFORGE
The fast-agent doc said: *"AppForge lacks `claimMcpStdout`."*
**This is incorrect.**

`Logger.ts` line 47:
```typescript
process.stderr.write(JSON.stringify(entry) + '\n');
```
AppForge already routes **all** log output to `stderr`. The MCP JSON-RPC channel on `stdout` is clean. No action needed.

---

## 🐛 Bug Found (Not in Original Analysis)

### `MobileSmartTreeService` XML Regex Only Matched Self-Closing Tags
**File**: `src/services/execution/MobileSmartTreeService.ts`

The existing regex:
```typescript
const elementPattern = /\<([A-Za-z.]+)\s([^>]*?)\/>/g;
```
Only matches `<Tag ... />` (self-closing). Android Appium XML contains many container tags in the form `<Tag ...>...</Tag>`. These were silently dropped, meaning parent-context for nested elements was completely missing.

**Fixed**: new `parseXmlToTree()` method handles both forms via a stack-based parser.

---

## 5. AppForge Gap Analysis — Post-Implementation

| Feature | Maestro | AppForge (Before) | AppForge (After) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **View Context** | Compact Tree | Flat ASCII Table | `format:"compact"` = aliased JSON tree | ✅ Implemented |
| **Compression** | Aliased (`b`, `txt`) | Full Strings | `buildCompactTree()` aliases all attrs | ✅ Implemented |
| **XML Parser** | Full tree walker | Regex, self-closing only | Stack-based parser, handles containers | ✅ Fixed |
| **Platform Signal** | N/A | Not in return type | `inspectHierarchy` now returns `platform` | ✅ Fixed |
| **stdout Hygiene** | `claimMcpStdout` | Already on `stderr` | No change needed | ✅ Already correct |
| **Knowledge Base** | Dynamic Remote API | Static `workflow_guide.ts` | Remains static (acceptable for now) | ⏳ Future |

---

## 6. Files Changed in This Session

| File | Change |
| :--- | :--- |
| `src/services/execution/MobileSmartTreeService.ts` | Added `CompactNode`, `RawXmlNode`, `ANDROID_COMPACT_SCHEMA`, `IOS_COMPACT_SCHEMA`, `buildCompactTree()`, `parseXmlToTree()`, `buildCompactFromRaw()`, and helpers |
| `src/services/execution/UiHierarchyInspector.ts` | Added `platform: 'android' \| 'ios'` to return type and all return objects |
| `src/tools/inspect_ui_hierarchy.ts` | Added `format: z.enum(["table","compact"])` param; routes to `buildCompactTree()` when `format:"compact"`; forces `includeRawXml=true` internally when compact mode is active |

**Build**: `tsc --noEmit` exits 0 — zero type errors.

---

## 7. How to Use the New Compact Mode

```json
{
  "tool": "inspect_ui_hierarchy",
  "args": {
    "format": "compact"
  }
}
```

**Output shape:**
```json
{
  "ui_schema": {
    "platform": "android",
    "abbreviations": { "b": "bounds", "txt": "text", "rid": "resource-id", "c": "children" },
    "defaults": { "enabled": true, "clickable": false }
  },
  "elements": [
    {
      "b": "[0,0][1080,200]",
      "txt": "Login",
      "rid": "loginBtn",
      "clickable": true,
      "c": []
    }
  ]
}
```

---

---

## 8. Tool-by-Tool Comparison (All 4 Maestro Tools)

### `inspect_screen` vs `inspect_ui_hierarchy`

| Aspect | Maestro | AppForge |
| :--- | :--- | :--- |
| Output format | Compact aliased JSON tree | Flat ASCII table (default) / compact JSON (`format:"compact"` — new) |
| Tool description | 16 lines of agent guidance baked into the description | Short — agent must infer rules |
| Anti-hallucination rule | Explicitly stated: *"always copy `txt` verbatim; never author from screenshot"* | Not present |
| Selector mapping rule | Explicitly stated: *"map `a11y` to `text:` when authoring; never pass `a11y` as a selector key"* | Not present |
| Regex matching rule | Explicitly stated: full-string IGNORE_CASE, partial strings don't match | Not present |

**Action**: Enrich `inspect_ui_hierarchy` tool description with AppForge-equivalent anti-hallucination and selector guidance.

---

### `take_screenshot` vs AppForge screenshot handling ⚠️ CRITICAL GAP

| Aspect | Maestro | AppForge |
| :--- | :--- | :--- |
| Return type | `ImageContent` (base64 JPEG) — LLM can **see** the screen | Stores to disk, returns `screenshotPath` only |
| LLM can visually inspect | ✅ Yes — vision input to the model | ❌ No — path is useless for vision |
| Format | PNG → JPEG converted before sending (smaller payload) | PNG stored as-is |
| MCP content type | `ImageContent { data, mimeType: "image/jpeg" }` | Never returned, only `TextContent` |

**AppForge `_helpers.ts`**: No `ImageContent` helper exists — confirmed by grep.
This means the LLM running AppForge cannot use screenshots for visual grounding at all. It must rely entirely on the XML hierarchy snapshot.

**Action**: Add `imageAndTextResult()` helper to `_helpers.ts`. Return screenshot as `ImageContent` from `inspect_ui_hierarchy` when a live screenshot is available.

---

### `run` vs `run_cucumber_test` / `create_test_atomically`

| Aspect | Maestro | AppForge |
| :--- | :--- | :--- |
| Modes | 3 in one tool: inline YAML, files list, directory+tags | Split: `run_cucumber_test` (BDD tags) + `create_test_atomically` (orchestration) |
| Atomicity | Always atomic — one call, full journey | `create_test_atomically` exists but not prominently surfaced |
| Syntax validation | Built into the `run` call — no pre-check needed | Separate `validate_and_write` step required |
| Wait handling | Orchestra auto-waits internally | Appium driver waits via WebdriverIO implicit/explicit waits |

---

### `cheat_sheet` vs `workflow_guide`

| Aspect | Maestro | AppForge |
| :--- | :--- | :--- |
| Content | Dynamic — fetched from remote API per call | Static — hardcoded JSON in `workflow_guide.ts` |
| Updatable without CLI release | ✅ Yes | ❌ No — requires code change + rebuild |
| LLM guidance | Command syntax + required args + gotchas | Step-by-step workflow sequences |

---

*Validated and implemented by Antigravity — April 28, 2026*
