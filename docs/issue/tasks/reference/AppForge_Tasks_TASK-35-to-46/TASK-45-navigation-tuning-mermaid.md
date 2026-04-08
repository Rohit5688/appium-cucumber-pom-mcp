# TASK-45 — Navigation Tuning + Mermaid Export (TASK-34)

**Status**: DONE
**Effort**: Medium (~2 hours)
**Depends on**: Nothing — standalone (but `NavigationGraphService` must exist from prior work)
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

The `NavigationGraphService` stores a map of screens and how to navigate between them.
Three improvements: (1) token clipping so large app graphs don't flood context,
(2) better prompt language for step reuse, (3) a Mermaid diagram export for
human visualization. All changes are in two files.

---

## Fix 1 — Token Clipping in `TestGenerationService`

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

Find where `NavigationGraphService.exportAsPromptContext()` result is injected
into the generation prompt. It currently appends the full context string.
Add a length guard:

```typescript
const navContext = this.navigationService.exportAsPromptContext(projectRoot);

const MAX_NAV_TOKENS = 1000; // ~4000 chars
let clippedNavContext = navContext;
if (navContext.length > MAX_NAV_TOKENS * 4) {
  clippedNavContext = navContext.slice(0, MAX_NAV_TOKENS * 4) +
    '\n\n*(Additional navigation paths truncated — use inspect_ui_hierarchy on the specific screen you need)*';
}

// Inject clippedNavContext into prompt, not full navContext
```

---

## Fix 2 — Improved Step Reuse Prompt Language

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

Find the section of the generation prompt that tells the LLM to reuse existing
steps. Replace vague language with numbered instructions:

```typescript
// BEFORE (something like):
"Reuse existing steps where possible."

// AFTER:
`## Navigation & Step Reuse Instructions

STEP 1 — IDENTIFY TARGET SCREEN: Determine which screen the test ends on.
STEP 2 — CHECK KNOWN NAVIGATION: If the navigation map above contains a path to
  that screen, use the exact Given/When steps listed for that path. Do not invent
  new navigation steps.
STEP 3 — CHECK EXISTING STEP DEFINITIONS: Before writing any new When/Then step,
  search the existingSteps list above. If a step matches (even partially), reuse
  it with the exact same wording — do not paraphrase.
STEP 4 — ONLY THEN ADD NEW STEPS: If no existing step covers the needed action,
  define a new step following the project's naming convention.`
```

---

## Fix 3 — Add `exportMermaidDiagram()` to `NavigationGraphService`

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\NavigationGraphService.ts`

Add this method to the class:

```typescript
/**
 * Exports the navigation graph as a Mermaid diagram string.
 * Output can be pasted directly into any Markdown file or Mermaid renderer.
 */
public exportMermaidDiagram(projectRoot: string): string {
  const graph = this.getGraph(projectRoot);
  const nodes = Object.values(graph.nodes);

  if (nodes.length === 0) {
    return '```mermaid\ngraph TD\n  A[No navigation data recorded yet]\n```';
  }

  const lines: string[] = ['```mermaid', 'graph TD'];

  // Sanitize screen names for Mermaid node IDs (no spaces or special chars)
  const sanitize = (name: string) =>
    name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');

  for (const node of nodes) {
    const fromId = sanitize(node.screen);
    const fromLabel = node.screen;
    lines.push(`  ${fromId}["${fromLabel}"]`);

    for (const edge of node.connections) {
      const toId = sanitize(edge.targetScreen);
      const toLabel = edge.targetScreen;
      const actionLabel = `${edge.action}: ${edge.triggerElement.slice(0, 20)}`;
      const confidence = Math.round(edge.confidence * 100);
      lines.push(`  ${toId}["${toLabel}"]`);
      lines.push(`  ${fromId} -->|"${actionLabel} (${confidence}%)"| ${toId}`);
    }
  }

  lines.push('```');
  return lines.join('\n');
}
```

---

## Fix 4 — Add `export_navigation_map` tool (new tool)

**File**: `c:\Users\Rohit\mcp\AppForge\src\tools\export_navigation_map.ts`
(or add inline in `index.ts` if not yet refactored)

```typescript
this.server.registerTool(
  "export_navigation_map",
  {
    title: "Export Navigation Map",
    description: "VISUALIZE APP NAVIGATION. Returns the known screen navigation graph as a Mermaid diagram. Use to understand what screens AppForge has explored and how to navigate between them. Also shows visit counts and confidence scores for each path. Returns: Mermaid diagram string.",
    inputSchema: z.object({ projectRoot: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async (args) => {
    const diagram = this.navigationService.exportMermaidDiagram(args.projectRoot);
    const knownScreens = this.navigationService.getKnownScreens(args.projectRoot);
    return this.textResult(
      `## App Navigation Map\n\nKnown screens: ${knownScreens.length}\n\n${diagram}\n\n` +
      `*Use start_appium_session + inspect_ui_hierarchy to explore more screens and build the map.*`
    );
  }
);
```

Also add it to `workflow_guide` if the `write_test` workflow doesn't already
mention inspecting the navigation map before generating tests.

---

## Fix 5 — Add JSDoc to `NavigationGraphService` interfaces

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\NavigationGraphService.ts`

Add JSDoc to the core interfaces so the LLM understands the schema when reading
the code:

```typescript
/**
 * Represents a single screen in the app's navigation graph.
 * Built automatically as inspect_ui_hierarchy is called during live sessions.
 */
export interface NavigationNode { ... }

/**
 * Represents a navigation action from one screen to another.
 * confidence increases each time the same navigation is successfully repeated.
 */
export interface NavigationEdge { ... }
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. `NavigationGraphService` has `exportMermaidDiagram()` method.
3. `TestGenerationService` has token length guard on nav context injection.
4. `export_navigation_map` tool registered and returns Mermaid output.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `exportMermaidDiagram()` added to `NavigationGraphService`
- [x] Navigation context in generation prompt clipped at ~4000 chars with truncation notice
- [x] Step reuse prompt uses numbered STEP 1/2/3/4 instructions
- [x] `export_navigation_map` tool registered
- [x] JSDoc added to `NavigationNode` and `NavigationEdge` interfaces
- [x] Change `Status` above to `DONE`
