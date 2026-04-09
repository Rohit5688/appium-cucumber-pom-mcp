# TASK-35 — Add `CHARACTER_LIMIT` Truncation to Large-Output Tools

**Status**: DONE
**Effort**: Small (~25 min)
**Depends on**: Nothing — standalone, do this first
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Several tools can return responses large enough to flood the LLM context window and cause
silent hallucinations. There is currently no safety ceiling. This task adds a 25,000-character
hard cap with a truncation message and a tip telling the LLM how to get less data.

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

---

## What to Change

### Step 1 — Add the constant

Find the top of `src/index.ts`, after the import block. Add this line before the
`class AppForgeServer` declaration:

```typescript
const CHARACTER_LIMIT = 25_000;
```

---

### Step 2 — Add `truncate()` helper inside `AppForgeServer`

Inside the `AppForgeServer` class, near the existing `textResult()` private helper,
add this new method:

```typescript
private truncate(text: string, tip?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const suffix = tip
    ? `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. Tip: ${tip}]`
    : `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars]`;
  return text.slice(0, CHARACTER_LIMIT) + suffix;
}
```

---

### Step 3 — Apply to `inspect_ui_hierarchy`

Find the `case "inspect_ui_hierarchy":` block. The final return currently does:
```typescript
return this.textResult(JSON.stringify(result, null, 2));
```

Replace with:
```typescript
const text = this.truncate(
  JSON.stringify(result, null, 2),
  "pass xmlDump with a specific subtree to reduce output size"
);
return this.textResult(text);
```

---

### Step 4 — Apply to `analyze_codebase`

Find `case "analyze_codebase":`. The final return currently does:
```typescript
return this.textResult(JSON.stringify(result, null, 2));
```

Replace with:
```typescript
return this.textResult(
  this.truncate(JSON.stringify(result, null, 2), "use execute_sandbox_code for targeted analysis")
);
```

---

### Step 5 — Apply to `execute_sandbox_code`

Find the sandbox success path. It builds a `parts` array and joins it.
Wrap the final joined string before it's returned:

```typescript
const joined = parts.join('\n\n');
return this.textResult(this.truncate(joined, "narrow your script's return value to reduce output"));
```

---

### Step 6 — Apply to `run_cucumber_test`

Find `case "run_cucumber_test":`. The final return builds a body object then returns it.
Wrap the serialized body:

```typescript
const body = this.truncate(
  JSON.stringify({ ...result, hint }, null, 2),
  "use tags argument to scope the run to fewer scenarios"
);
return this.textResult(body);
```

---

### Step 7 — Apply to `check_environment`

Find `case "check_environment":`. The final return builds a JSON object.
Wrap it:

```typescript
const body = this.truncate(JSON.stringify({ summary: report.summary, data: { ready: report.ready, failCount, warnCount }, hint }, null, 2));
return this.textResult(body);
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `CHARACTER_LIMIT` in `src/index.ts` — must appear at least 6 times
   (constant declaration + 5 tool wrappings).
3. Search for `truncate(` — must appear 5 times (once per tool).

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `CHARACTER_LIMIT = 25_000` constant declared at top of file
- [x] `truncate()` private method added to `AppForgeServer` class
- [x] All 5 tools wrapped: `inspect_ui_hierarchy`, `analyze_codebase`, `execute_sandbox_code`, `run_cucumber_test`, `check_environment`
- [x] Change `Status` above to `DONE`
