import fs from 'fs';
import path from 'path';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../types/NavigationTypes.js';
import { McpConfigService } from '../services/config/McpConfigService.js';
import { SharedNavState } from '../services/nav/SharedNavState.js';

export class MermaidExporter {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) {}

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }

    /**
     * Exports the navigation graph as a Mermaid diagram string.
     * Output can be pasted directly into any Markdown file or Mermaid renderer.
     */
    public exportMermaidDiagram(projectRoot: string): string {
        const nodes = Array.from(this.graph.nodes.values()) as NavigationNode[];
        if (nodes.length === 0) {
          return '```mermaid\ngraph TD\n  A[No navigation data recorded yet]\n```';
        }

        const lines: string[] = ['```mermaid', 'graph TD'];
        const sanitize = (name: string) =>
                  name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
        for (const node of nodes) {
          const fromId = sanitize(node.screen);
          const fromLabel = node.screen;
          lines.push(`  ${fromId}["${fromLabel}"]`);

          for (const edge of node.connections) {
            const toId = sanitize(edge.targetScreen);
            const toLabel = edge.targetScreen;
            const triggerId = edge.triggerElement?.id || edge.triggerElement?.accessibilityId || edge.triggerElement?.text || 'element';
            const actionLabel = `${edge.action}: ${triggerId.substring(0, 20)}`;
            const confidence = Math.round(edge.confidence * 100);
            lines.push(`  ${toId}["${toLabel}"]`);
            lines.push(`  ${fromId} -->|"${actionLabel} (${confidence}%)"| ${toId}`);
          }
        }

        lines.push('```');
        return lines.join('\n');
    }

    public addGraphNode(fromScreen: string, toScreen: string, action: NavigationEdge): void {
        if (!this.graph.nodes.has(fromScreen)) {
          this.graph.nodes.set(fromScreen, {
            screen: fromScreen,
            elements: [],
            connections: [],
            visitCount: 0,
            lastVisited: new Date(),
            screenSignature: ''
          });
        }

        if (!this.graph.nodes.has(toScreen)) {
          this.graph.nodes.set(toScreen, {
            screen: toScreen,
            elements: [],
            connections: [],
            visitCount: 0,
            lastVisited: new Date(),
            screenSignature: ''
          });
        }

        const fromNode = this.graph.nodes.get(fromScreen)!;
        const existingConnection = fromNode.connections.find((c: NavigationEdge) => c.targetScreen === toScreen);
        if (!existingConnection) {
          fromNode.connections.push(action);
        }
    }
}