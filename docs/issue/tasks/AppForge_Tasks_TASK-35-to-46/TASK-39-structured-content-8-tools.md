# TASK-39 — Add `structuredContent` to 8 Priority Tools

**Status**: DONE
**Effort**: Small (~25 min)
**Depends on**: TASK-38 must be DONE (needs `registerTool` pattern in place)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

MCP clients (Claude Code, Cursor) can parse tool responses programmatically when
`structuredContent` is returned alongside the text `content`. Currently all tools
return only text, so clients must parse JSON from a string themselves — unreliable
and error-prone. This task adds `structuredContent` to the 8 tools that return
structured JSON, with no logic changes.

**File**: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

---

## What to Change

### Step 1 — Update `textResult()` helper to accept optional structured data

Find the existing `textResult()` private method:
```typescript
private textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
```

Replace it with:
```typescript
private textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text" as const, text }] };
  if (structured) result.structuredContent = structured;
  return result;
}
```

---

### Step 2 — Add `structuredContent` to 8 tools

For each tool below, find its `registerTool` handler and update the return statement.
The pattern is the same each time: parse the JSON string back to an object and pass
it as the second argument to `textResult()`.

---

**Tool: `check_environment`**

Find the return in its handler:
```typescript
return this.textResult(body);
```

Replace with:
```typescript
return this.textResult(body, {
  summary: report.summary,
  ready: report.ready,
  failCount: report.checks.filter((c: any) => c.status === 'fail').length,
  warnCount: report.checks.filter((c: any) => c.status === 'warn').length
});
```

---

**Tool: `summarize_suite`**

Find the return in its handler. Replace with:
```typescript
const data = {
  summary: summary.plainEnglishSummary,
  total: summary.totalScenarios,
  passed: summary.passed,
  failed: summary.failed,
  skipped: summary.skipped,
  duration: summary.duration,
  failedScenarios: summary.failedScenarios,
  hint: summary.failed > 0 ? "Call self_heal_test for any failing scenarios listed above." : "Tests passed."
};
return this.textResult(JSON.stringify(data, null, 2), data);
```

---

**Tool: `run_cucumber_test`**

Find the return. Replace with:
```typescript
const data = { ...result, hint };
return this.textResult(this.truncate(JSON.stringify(data, null, 2), "use tags argument to scope the run"), data);
```

---

**Tool: `self_heal_test`**

Find the return. Replace with:
```typescript
const data = {
  candidates: healResult.instruction.alternativeSelectors || [],
  promptForLLM: healResult.prompt
};
return this.textResult(JSON.stringify(data, null, 2), data);
```

---

**Tool: `inspect_ui_hierarchy`**

Find the return. Replace with:
```typescript
const data = result;
return this.textResult(this.truncate(JSON.stringify(data, null, 2), "pass xmlDump with a specific subtree to reduce output"), data);
```

---

**Tool: `start_appium_session`**

Find the return. Replace with:
```typescript
const data = {
  sessionId: sessionInfo.sessionId,
  platform: sessionInfo.platformName,
  device: sessionInfo.deviceName,
  appPackage: sessionInfo.appPackage,
  bundleId: sessionInfo.bundleId,
  hint: `✅ Session started on ${sessionInfo.deviceName} (${sessionInfo.platformName}). NEXT: Call inspect_ui_hierarchy (no args) to fetch live XML and see what's on screen.`
};
return this.textResult(JSON.stringify(data, null, 2), data);
```

---

**Tool: `verify_selector`**

Find the return. Replace with:
```typescript
return this.textResult(JSON.stringify(verification, null, 2), verification as Record<string, unknown>);
```

---

**Tool: `audit_utils`**

Find the return. Replace with:
```typescript
const data = { msg: "🔧 Util coverage suggestions", ...result };
return this.textResult(JSON.stringify(data, null, 2), data);
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `structuredContent` — must appear in 8 places.
3. `textResult` signature must now accept optional second argument.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `textResult()` helper updated to accept optional `structured` parameter
- [ ] `structuredContent` added to all 8 priority tools
- [ ] No tool logic changed — only return statements updated
- [ ] Change `Status` above to `DONE`
