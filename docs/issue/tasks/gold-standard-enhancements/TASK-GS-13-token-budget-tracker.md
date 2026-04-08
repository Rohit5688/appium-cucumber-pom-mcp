# TASK-GS-13 — Token Budget Tracker

**Status**: DONE  
**Effort**: Medium (~60 min)  
**Depends on**: Nothing — standalone service  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

There is currently no visibility into token consumption per session. A 30-step session might burn 500,000 tokens without any warning, making cost optimization blind.

**Goal**: Track estimated token usage per tool call, warn at thresholds, and expose a `get_token_budget` tool so agents can self-monitor.

**Note**: This uses a rough character-based estimate (`chars / 4 ≈ tokens`), which is ~85% accurate for English text. Exact tokenization requires calling the tokenizer API, which has overhead we want to avoid.

---

## What to Create

### File: `src/services/TokenBudgetService.ts` (NEW)

```typescript
/**
 * TokenBudgetService — tracks estimated token consumption per session.
 *
 * Uses character-based estimation: ~4 chars = 1 token (±15% accuracy).
 * This avoids the overhead of calling the actual tokenizer API.
 */
export class TokenBudgetService {
  private static instance: TokenBudgetService;

  /** Accumulated tokens for this session */
  private sessionTokens: number = 0;

  /** Per-tool token breakdown for reporting */
  private toolBreakdown: Map<string, { calls: number; tokens: number }> = new Map();

  /** Warning thresholds */
  private readonly WARNING_THRESHOLD = 50_000;
  private readonly CRITICAL_THRESHOLD = 150_000;

  /** Whether to emit warnings */
  private warningsEmitted: Set<string> = new Set();

  public static getInstance(): TokenBudgetService {
    if (!TokenBudgetService.instance) {
      TokenBudgetService.instance = new TokenBudgetService();
    }
    return TokenBudgetService.instance;
  }

  /**
   * Estimates token count from text content.
   * Rough approximation: 4 chars ≈ 1 token for English/code content.
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Records a tool call's token usage.
   * Call this after every tool execution.
   */
  public trackToolCall(
    toolName: string,
    inputText: string,
    outputText: string
  ): TokenUsageRecord {
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);
    const totalTokens = inputTokens + outputTokens;

    // Update session total
    this.sessionTokens += totalTokens;

    // Update per-tool breakdown
    const existing = this.toolBreakdown.get(toolName) ?? { calls: 0, tokens: 0 };
    this.toolBreakdown.set(toolName, {
      calls: existing.calls + 1,
      tokens: existing.tokens + totalTokens,
    });

    // Emit warnings at thresholds
    const warning = this.checkThresholds();

    return {
      toolName,
      inputTokens,
      outputTokens,
      totalTokens,
      sessionTotal: this.sessionTokens,
      warning,
    };
  }

  /**
   * Returns a formatted budget report for the current session.
   */
  public getBudgetReport(): TokenBudgetReport {
    const sortedTools = [...this.toolBreakdown.entries()]
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 10); // Top 10 consumers

    const statusEmoji = this.sessionTokens > this.CRITICAL_THRESHOLD
      ? '🔴'
      : this.sessionTokens > this.WARNING_THRESHOLD
      ? '🟡'
      : '🟢';

    return {
      sessionTokens: this.sessionTokens,
      estimatedCostUsd: this.estimateCost(this.sessionTokens),
      status: statusEmoji,
      warningThreshold: this.WARNING_THRESHOLD,
      criticalThreshold: this.CRITICAL_THRESHOLD,
      topConsumers: sortedTools.map(([name, data]) => ({
        toolName: name,
        calls: data.calls,
        tokens: data.tokens,
        percentage: Math.round((data.tokens / this.sessionTokens) * 100),
      })),
      formattedReport: this.formatReport(sortedTools, statusEmoji),
    };
  }

  /**
   * Resets all counters (call on new session start).
   */
  public reset(): void {
    this.sessionTokens = 0;
    this.toolBreakdown.clear();
    this.warningsEmitted.clear();
  }

  /** Returns current session token count */
  public getSessionTokens(): number {
    return this.sessionTokens;
  }

  /** Check thresholds and return warning string if exceeded */
  private checkThresholds(): string | undefined {
    if (this.sessionTokens > this.CRITICAL_THRESHOLD && !this.warningsEmitted.has('critical')) {
      this.warningsEmitted.add('critical');
      console.warn(`[AppForge] 🔴 CRITICAL: ${this.sessionTokens.toLocaleString()} tokens used this session (~$${this.estimateCost(this.sessionTokens).toFixed(3)}). Consider starting a new session to reduce costs.`);
      return `CRITICAL: ${this.sessionTokens.toLocaleString()} tokens used. High cost risk.`;
    }

    if (this.sessionTokens > this.WARNING_THRESHOLD && !this.warningsEmitted.has('warning')) {
      this.warningsEmitted.add('warning');
      console.warn(`[AppForge] 🟡 WARNING: ${this.sessionTokens.toLocaleString()} tokens used this session. Monitor usage.`);
      return `WARNING: ${this.sessionTokens.toLocaleString()} tokens used.`;
    }

    return undefined;
  }

  /** Rough cost estimate (Sonnet pricing: ~$3/M input, $15/M output — blended ~$6/M) */
  private estimateCost(tokens: number): number {
    return (tokens / 1_000_000) * 6;
  }

  private formatReport(
    topTools: [string, { calls: number; tokens: number }][],
    statusEmoji: string
  ): string {
    const lines = [
      `${statusEmoji} Token Budget Report`,
      `Session Total: ${this.sessionTokens.toLocaleString()} tokens (~$${this.estimateCost(this.sessionTokens).toFixed(3)})`,
      ``,
      `Top Token Consumers:`,
      ...topTools.map(([name, data]) =>
        `  ${name}: ${data.tokens.toLocaleString()} tokens (${data.calls} calls)`
      ),
    ];
    return lines.join('\n');
  }
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TokenUsageRecord {
  toolName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  sessionTotal: number;
  warning?: string;
}

export interface TokenBudgetReport {
  sessionTokens: number;
  estimatedCostUsd: number;
  status: string;
  warningThreshold: number;
  criticalThreshold: number;
  topConsumers: Array<{
    toolName: string;
    calls: number;
    tokens: number;
    percentage: number;
  }>;
  formattedReport: string;
}
```

---

## What to Update

### File: `src/index.ts`

#### Step 1 — Import and reset on session start

```typescript
import { TokenBudgetService } from './services/TokenBudgetService';

// In start_appium_session handler, after success:
TokenBudgetService.getInstance().reset();
```

#### Step 2 — Wrap tool call results

In the main tool dispatch loop (or individual handlers), after each tool returns a result:

```typescript
const tokenService = TokenBudgetService.getInstance();
const inputText = JSON.stringify(args ?? '');
const outputText = JSON.stringify(result ?? '');
const usage = tokenService.trackToolCall(toolName, inputText, outputText);

if (usage.warning) {
  // Append warning to response so the LLM sees it
  if (Array.isArray(result?.content)) {
    result.content.push({ type: 'text', text: `\n⚠️ ${usage.warning}` });
  }
}
```

#### Step 3 — Add `get_token_budget` tool

Register a new lightweight tool:

```typescript
{
  name: 'get_token_budget',
  description: `Returns estimated token usage for the current session. Use to check costs and identify token-heavy operations. Returns a formatted report with per-tool breakdown.

OUTPUT INSTRUCTIONS: Display the report as-is. Do not add commentary.`,
  inputSchema: { type: 'object', properties: {}, required: [] },
}

// Handler:
case 'get_token_budget': {
  const report = TokenBudgetService.getInstance().getBudgetReport();
  return {
    content: [{ type: 'text', text: report.formattedReport }]
  };
}
```

---

## Verification

1. Run: `npm run build` — must pass

2. Test estimation accuracy:
   ```typescript
   const service = TokenBudgetService.getInstance();
   const tokens = service.estimateTokens('Hello, world!'); // 13 chars → ~3 tokens
   console.assert(tokens >= 2 && tokens <= 5, 'Token estimate off');
   console.log('Token estimate test passed');
   ```

3. After a session with 5+ tool calls, call `get_token_budget` and verify:
   - Session total is non-zero
   - Top consumers list shows the most-called tools
   - Format is readable

---

## Done Criteria

- [x] `TokenBudgetService.ts` created with `trackToolCall()`, `getBudgetReport()`, `reset()`
- [x] Character-based token estimation implemented
- [x] Warning at 50K tokens, critical at 150K tokens
- [x] `TokenBudgetService.reset()` called on `start_appium_session`
- [x] `get_token_budget` tool added to `src/index.ts`
- [x] Tool calls tracked in `src/index.ts` dispatch
- [x] `npm run build` passes with zero errors
- [x] Change `Status` above to `DONE`

---

## Notes

- **Estimation is an approximation** — actual token counts depend on the specific LLM model's tokenizer; char/4 is a common heuristic that's accurate enough for warnings
- **Don't track all text** — only tool inputs/outputs; do not attempt to track the full conversation
- **Cost estimate uses blended pricing** — update `estimateCost()` if pricing model changes
- **Warning threshold (50K)** is conservative — adjust based on typical session usage patterns
