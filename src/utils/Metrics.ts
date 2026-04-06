/**
 * AppForge Performance Metrics
 * Tracks tool invocation counts, success/failure rates, and timing.
 * Dumps summary on process exit.
 */

interface ToolMetric {
  invocations: number;
  failures: number;
  totalDurationMs: number;
  lastInvokedAt: string;
}

export class Metrics {
  private static tools: Record<string, ToolMetric> = {};

  static recordStart(toolName: string): () => void {
    const start = Date.now();
    if (!Metrics.tools[toolName]) {
      Metrics.tools[toolName] = { invocations: 0, failures: 0, totalDurationMs: 0, lastInvokedAt: '' };
    }
    Metrics.tools[toolName].invocations++;
    Metrics.tools[toolName].lastInvokedAt = new Date().toISOString();

    return () => {
      const duration = Date.now() - start;
      Metrics.tools[toolName].totalDurationMs += duration;
    };
  }

  static recordFailure(toolName: string): void {
    if (Metrics.tools[toolName]) {
      Metrics.tools[toolName].failures++;
    }
  }

  static getSummary(): Record<string, ToolMetric & { avgDurationMs: number; successRate: string }> {
    const summary: any = {};
    for (const [tool, m] of Object.entries(Metrics.tools)) {
      summary[tool] = {
        ...m,
        avgDurationMs: m.invocations > 0 ? Math.round(m.totalDurationMs / m.invocations) : 0,
        successRate: m.invocations > 0
          ? `${(((m.invocations - m.failures) / m.invocations) * 100).toFixed(1)}%`
          : 'N/A'
      };
    }
    return summary;
  }

  static registerShutdownHook(): void {
    const dump = () => {
      const summary = Metrics.getSummary();
      if (Object.keys(summary).length > 0) {
        process.stderr.write('\n[AppForge Metrics]\n' + JSON.stringify(summary, null, 2) + '\n');
      }
    };
    process.on('exit', dump);
    process.on('SIGINT', () => { dump(); process.exit(0); });
    process.on('SIGTERM', () => { dump(); process.exit(0); });
  }
}
