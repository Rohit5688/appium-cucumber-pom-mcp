# TASK-GS-23 — Agent Routing (Multi-Model Task Complexity Routing)

**Status**: TODO (Low Priority — Implement After Tier 0-2 Complete)  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — standalone configuration service  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Not all tasks require the most expensive LLM model. AppForge operations fall into clear complexity tiers:

| Task Complexity | Example Operations | Appropriate Model |
|:----------------|:-------------------|:------------------|
| **Simple** | File read, format check, list files | claude-haiku-3 |
| **Medium** | Selector healing, step generation | claude-sonnet-3.5 |
| **Complex** | Full POM generation, code analysis | claude-opus-4 / sonnet |

Without routing, every operation uses the most expensive model. Routing can reduce costs by 60-70% for simple operations.

**Solution**: Create `AgentRoutingService` that classifies tool calls and returns the recommended model identifier. The actual model selection is handled by the MCP client (this service just provides recommendations).

**Important limitation**: The MCP server cannot directly switch models — it can only *recommend* the appropriate model in its response metadata. The LLM client/IDE must honor these recommendations. This is a soft advisory system.

---

## What to Create

### File: `src/services/AgentRoutingService.ts` (NEW)

```typescript
/**
 * Task complexity classification for model routing.
 */
export type TaskComplexity = 'simple' | 'medium' | 'complex';

/**
 * Model routing recommendation.
 */
export interface RoutingRecommendation {
  toolName: string;
  complexity: TaskComplexity;
  recommendedModel: string;
  reason: string;
  estimatedTokens: number;
}

/**
 * AgentRoutingService — classifies tool calls by complexity and recommends
 * the most cost-effective LLM model.
 *
 * NOTE: This service RECOMMENDS models but cannot enforce selection.
 * The MCP client/IDE must honor the recommendation.
 * Recommendations are included in tool response metadata.
 */
export class AgentRoutingService {
  private static instance: AgentRoutingService;

  // ─── Model identifiers (update these to match your LLM provider) ──────────

  private readonly MODELS = {
    simple: 'claude-haiku-3-5',     // Cheapest — for mechanical tasks
    medium: 'claude-sonnet-3-5',    // Balanced — for reasoning tasks
    complex: 'claude-opus-4',       // Most capable — for synthesis tasks
  } as const;

  // ─── Tool complexity map ──────────────────────────────────────────────────

  /**
   * Maps tool names to their baseline complexity.
   * This is the starting point before dynamic factors are applied.
   */
  private readonly TOOL_COMPLEXITY: Record<string, TaskComplexity> = {
    // Simple — mechanical, well-defined tasks
    'read_file':                  'simple',
    'list_directory':             'simple',
    'check_appium_ready':         'simple',
    'get_token_budget':           'simple',
    'scan_structural_brain':      'simple',
    'get_session_info':           'simple',
    'check_config':               'simple',

    // Medium — require reasoning but follow patterns
    'verify_selector':            'medium',
    'self_heal_test':             'medium',
    'generate_step_definitions':  'medium',
    'audit_locators':             'medium',
    'check_ci_workflow':          'medium',
    'inspect_ui_hierarchy':       'medium',
    'write_file':                 'medium',

    // Complex — creative synthesis, large context reasoning
    'generate_cucumber_pom':      'complex',
    'analyze_codebase':           'complex',
    'generate_ci_workflow':       'complex',
    'migrate_test':               'complex',
    'setup_project_structure':    'complex',
    'request_user_clarification': 'medium',
  };

  public static getInstance(): AgentRoutingService {
    if (!AgentRoutingService.instance) {
      AgentRoutingService.instance = new AgentRoutingService();
    }
    return AgentRoutingService.instance;
  }

  /**
   * Classifies a tool call and returns a routing recommendation.
   *
   * Dynamic factors that can up-grade complexity:
   * - Large input (>10KB) → medium→complex
   * - Multiple files involved → +1 tier
   * - Healing attempt > 1 → medium
   */
  public classify(
    toolName: string,
    args: Record<string, any> = {}
  ): RoutingRecommendation {
    let complexity = this.TOOL_COMPLEXITY[toolName] ?? 'medium';

    // Dynamic upgrades
    const inputSize = JSON.stringify(args).length;
    if (inputSize > 10_000 && complexity === 'simple') {
      complexity = 'medium';
    }
    if (inputSize > 50_000 && complexity === 'medium') {
      complexity = 'complex';
    }

    // Self-healing with attempt count > 1 → needs reasoning
    if (toolName === 'self_heal_test' && (args.attemptNumber ?? 1) > 1) {
      complexity = 'complex';
    }

    const estimatedTokens = this.estimateTokens(inputSize, complexity);

    return {
      toolName,
      complexity,
      recommendedModel: this.MODELS[complexity],
      reason: this.buildReason(toolName, complexity, inputSize),
      estimatedTokens,
    };
  }

  /**
   * Returns a formatted routing hint for inclusion in tool responses.
   * Clients that support model switching can use this to optimize cost.
   */
  public formatRoutingHint(recommendation: RoutingRecommendation): string {
    const complexityIcon = { simple: '💚', medium: '💛', complex: '🔴' }[recommendation.complexity];
    return [
      `[Routing] ${complexityIcon} ${recommendation.complexity.toUpperCase()} task`,
      `Recommended model: ${recommendation.recommendedModel}`,
      `Estimated tokens: ~${recommendation.estimatedTokens.toLocaleString()}`,
    ].join(' | ');
  }

  /**
   * Batch-classifies a list of planned operations and returns the
   * recommended model for the most complex task in the batch.
   */
  public classifyBatch(
    plannedTools: Array<{ toolName: string; args?: Record<string, any> }>
  ): { overallComplexity: TaskComplexity; recommendedModel: string } {
    const recommendations = plannedTools.map(t => this.classify(t.toolName, t.args ?? {}));
    const hasComplex = recommendations.some(r => r.complexity === 'complex');
    const hasMedium = recommendations.some(r => r.complexity === 'medium');

    const overallComplexity: TaskComplexity = hasComplex ? 'complex' : hasMedium ? 'medium' : 'simple';

    return {
      overallComplexity,
      recommendedModel: this.MODELS[overallComplexity],
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private estimateTokens(inputSizeBytes: number, complexity: TaskComplexity): number {
    const baseTokens = { simple: 500, medium: 2000, complex: 8000 }[complexity];
    const inputTokens = Math.ceil(inputSizeBytes / 4);
    return baseTokens + inputTokens;
  }

  private buildReason(toolName: string, complexity: TaskComplexity, inputSize: number): string {
    if (inputSize > 50_000) return `Large input (${(inputSize / 1024).toFixed(0)}KB) upgraded to complex`;
    if (complexity === 'simple') return 'Mechanical operation with predictable output';
    if (complexity === 'medium') return 'Requires pattern matching and locator reasoning';
    return 'Creative synthesis or large-context analysis required';
  }
}
```

---

## What to Update

### File: `src/index.ts`

Add routing hints to tool responses (optional — only if client supports it):

```typescript
import { AgentRoutingService } from './services/AgentRoutingService';

// In the tool dispatch handler, after result is built:
const router = AgentRoutingService.getInstance();
const recommendation = router.classify(toolName, args ?? {});

// Include hint in response for capable clients
if (result && Array.isArray(result.content)) {
  const hint = router.formatRoutingHint(recommendation);
  // Append as a subtle metadata note (only for non-error results)
  if (!result.isError && recommendation.complexity !== 'complex') {
    result.content.push({ type: 'text', text: `\n<!-- ${hint} -->` });
  }
}
```

### Add `get_routing_recommendation` tool (optional debugging tool)

```typescript
{
  name: 'get_routing_recommendation',
  description: `Returns the recommended LLM model for a given planned operation. Use to check cost classification before running expensive tools.`,
  inputSchema: {
    type: 'object',
    properties: {
      toolName: { type: 'string', description: 'The tool you plan to call' },
      estimatedInputSize: { type: 'number', description: 'Estimated input size in bytes' }
    },
    required: ['toolName']
  }
}

case 'get_routing_recommendation': {
  const recommendation = AgentRoutingService.getInstance().classify(
    args.toolName,
    { _size: args.estimatedInputSize ?? 0 }
  );
  const router = AgentRoutingService.getInstance();
  return { content: [{ type: 'text', text: router.formatRoutingHint(recommendation) }] };
}
```

---

## Verification

1. Run `npm run build` — must pass

2. Test classification:
   ```typescript
   import { AgentRoutingService } from './src/services/AgentRoutingService';

   const router = AgentRoutingService.getInstance();

   const simple = router.classify('read_file', {});
   console.assert(simple.complexity === 'simple', 'read_file should be simple');

   const complex = router.classify('generate_cucumber_pom', { uiHierarchy: 'x'.repeat(60_000) });
   console.assert(complex.complexity === 'complex', 'Large generate should be complex');

   console.log('Routing tests passed');
   console.log('Recommendation:', simple.recommendedModel, '→', complex.recommendedModel);
   ```

---

## Done Criteria

- [ ] `AgentRoutingService.ts` created with `classify()`, `classifyBatch()`, `formatRoutingHint()`
- [ ] Tool complexity map covers all 33 AppForge tools
- [ ] Dynamic upscaling based on input size works
- [ ] Routing hint format is compact and parseable
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Advisory only** — model recommendations cannot be enforced by the MCP server; this is metadata only
- **Update model names** — the model identifiers in `MODELS` are examples; update to match actual deployed model names
- **Tool map is manual** — the `TOOL_COMPLEXITY` map must be kept in sync as new tools are added
- **Batch use case** — `classifyBatch()` is most useful for planning sessions where agents pre-evaluate complexity before starting work
