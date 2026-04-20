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
