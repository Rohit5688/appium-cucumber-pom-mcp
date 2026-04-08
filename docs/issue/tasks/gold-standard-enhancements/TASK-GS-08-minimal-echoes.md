# TASK-GS-08 — Minimal Echoes (Prevent Redundant LLM Responses)

**Status**: DONE  
**Effort**: Small (~45 min)  
**Depends on**: GS-01 (Tool Description Audit) — do after trimming to 2048 chars  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

When LLMs receive tool results, they often narrate what they just did before proceeding:

> "I have successfully updated the file at `/path/to/LoginPage.ts`. The file now contains the updated selector for the login button. I will now proceed to run the test..."

This verbosity:
- Wastes 50-200 tokens per tool call
- In a 30-step session, adds ~3000-6000 tokens of purely redundant text
- Slows down the conversation for the user
- Can push important content out of the context window

**Solution**: Add a brief `OUTPUT INSTRUCTIONS` block in each tool description telling the LLM to acknowledge briefly and move on.

---

## What to Update

### File: `src/index.ts`

Find every tool `description` field and append the following OUTPUT INSTRUCTIONS block. This must fit within the 2048-char limit (done in GS-01 first).

#### Standard OUTPUT INSTRUCTIONS block to append to each tool:

```
OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.
```

**Character cost**: ~150 chars — ensure each tool stays ≤2048 after adding this.

---

### Tools to update (all 33 tools):

Apply this pattern to every tool description. Identify each tool by searching for `name:` in the tool registration block.

**Example transformation** for `generate_cucumber_pom`:

```typescript
// Before:
description: `Generate Cucumber Page Object Model (POM) files...
[...existing content...]`

// After:
description: `Generate Cucumber Page Object Model (POM) files...
[...existing content, trimmed to allow room...]

OUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge (≤10 words), then proceed.`
```

---

### High-priority tools (these are most verbose in practice):

| Tool Name | Current Pattern | Fix |
|:----------|:----------------|:----|
| `generate_cucumber_pom` | LLM explains all files created | Add OUTPUT INSTRUCTIONS |
| `self_heal_test` | LLM narrates each healing step | Add OUTPUT INSTRUCTIONS |
| `inspect_ui_hierarchy` | LLM summarizes the XML it just returned | Add OUTPUT INSTRUCTIONS |
| `run_cucumber_test` | LLM repeats test results already in output | Add OUTPUT INSTRUCTIONS |
| `read_file` | LLM reads entire file back in response | Add OUTPUT INSTRUCTIONS |
| `write_file` | LLM confirms what it wrote in detail | Add OUTPUT INSTRUCTIONS |
| `start_appium_session` | LLM confirms all capabilities | Add OUTPUT INSTRUCTIONS |
| `analyze_codebase` | LLM narrates entire analysis output | Add OUTPUT INSTRUCTIONS |

---

## Implementation Steps

### Step 1 — Verify post-GS-01 char counts

Run this to see current description lengths:
```bash
node -e "
const src = require('fs').readFileSync('./src/index.ts', 'utf-8');
const matches = [...src.matchAll(/description:\s*\`([\s\S]*?)\`/g)];
matches.forEach((m, i) => console.log('Tool', i+1, ':', m[1].length, 'chars'));
"
```

### Step 2 — Add OUTPUT INSTRUCTIONS

For each tool description, append the instruction block ensuring total stays ≤2048 chars.

If a tool is at 1900 chars, trim more from the body to make room for the OUTPUT INSTRUCTIONS block.

### Step 3 — Verify all still ≤2048

Re-run the script from Step 1 to confirm all lengths.

---

## Verification

1. Run `npm run build` — must pass

2. Manual test (using MCP client or evaluate mode):
   - Call `inspect_ui_hierarchy`  
   - Verify LLM response is short (not a re-narration of the XML)
   - Call `generate_cucumber_pom`  
   - Verify LLM says something like "Files created. Proceeding." not a full description of what was created

3. Estimate token savings with before/after comparison:
   - Before: Count words in a typical 5-tool session transcript
   - After: Same session should have 30-50% fewer words in assistant messages

---

## Done Criteria

- [x] All tool descriptions have OUTPUT INSTRUCTIONS appended
- [x] All tool descriptions remain ≤2048 chars after addition
- [x] No tool loses critical usage information (check each manually)
- [x] `npm run build` passes with zero errors
- [x] At least 3 tools manually tested to confirm shorter responses
- [x] Change `Status` above to `DONE`

---

## Notes

- **This is the cheapest token optimization** — ~150 chars of instruction saves 50-200 tokens per tool call
- **Order matters** — do GS-01 first to establish baseline char counts, then add OUTPUT INSTRUCTIONS
- **Don't remove all context** — the LLM needs some feedback to know if an operation succeeded or failed
- **Failure paths should still be verbose** — only silence success narration, not error details
