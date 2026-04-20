import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ElementInfo, NavigationEdge, NavigationNode, NavigationGraph, NavigationPath, NavigationStep } from '../../types/NavigationTypes.js';
import { McpConfigService } from '../config/McpConfigService.js';
import { SharedNavState } from './SharedNavState.js';


export class XmlElementParser {
  constructor(protected state: SharedNavState, protected mcpConfigService: McpConfigService, protected facade: any) {}

  get graph() { return this.state.graph; }
  set graph(v) { this.state.graph = v; }
  get graphPath() { return this.state.graphPath; }
  set graphPath(v) { this.state.graphPath = v; }
  get mapSource() { return this.state.mapSource; }
  set mapSource(v) { this.state.mapSource = v; }
  get fileToSignatures() { return this.state.fileToSignatures; }
  set fileToSignatures(v) { this.state.fileToSignatures = v; }

    public extractElementsFromXml(screenXml: string): ElementInfo[] {
        const elements: ElementInfo[] = [];
        const elementRegex = /<(\w+)[^>]*>/g;
        let match;
        while ((match = elementRegex.exec(screenXml)) !== null) {
          const attrs = this.parseAttributes(match[0]);
          if (attrs['resource-id'] || attrs['text'] || attrs['accessibility-id']) {
            elements.push({
              id: attrs['resource-id'],
              text: attrs['text'],
              accessibilityId: attrs['accessibility-id'],
              className: attrs['class']
            });
          }
        }

        return elements;
    }

    public parseAttributes(elementTag: string): Record<string, string> {
        const attrs: Record<string, string> = {};
        const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(elementTag)) !== null) {
          attrs[match[1]] = match[2];
        }

        return attrs;
    }

    public extractStableElements(screenXml: string): ElementInfo[] {
        const elements = this.extractElementsFromXml(screenXml);
        return elements.filter(el => el.id || el.accessibilityId);
    }

    public generateScreenSignature(screenXml: string): string {
        const stableElements = this.extractStableElements(screenXml);
        return JSON.stringify(stableElements).slice(0, 64);
    }

    public inferScreenName(elements: ElementInfo[], signature: string): string {
        for (const element of elements) {
          if (element.id) {
            const parts = element.id.split(/[:./]/);
            for (const part of parts) {
              if (part.toLowerCase().includes('screen') || part.toLowerCase().includes('page')) {
                return this.normalizeScreenName(part);
              }
            }
          }
        }

        return `Screen_${signature.slice(0, 8)}`;
    }

    public normalizeScreenName(name: string): string {
        return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    public mergeElements(existing: ElementInfo[], newElements: ElementInfo[]): ElementInfo[] {
        const merged = [...existing];
        for (const newEl of newElements) {
          const exists = merged.some(el => 
            el.id === newEl.id || el.accessibilityId === newEl.accessibilityId
          );
          if (!exists) {
            merged.push(newEl);
          }
        }

        return merged;
    }
}