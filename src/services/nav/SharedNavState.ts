import { NavigationGraph } from '../../types/NavigationTypes.js';

export class SharedNavState {
  public graph: NavigationGraph;
  public graphPath: string = '';
  public mapSource: 'static' | 'live' | 'seed' = 'static';
  public fileToSignatures: Record<string, string[]> = {};
  
  constructor() {
    this.graph = {
      nodes: new Map(),
      entryPoints: [],
      lastUpdated: new Date()
    };
  }
}
