import { ContextManager } from '../services/ContextManager.js';

const ctx = ContextManager.getInstance();
ctx.reset();

// Simulate 4 scans
const mockMap = (name: string, count: number) => ({
  screenSummary: `${name}: ${count} elements`,
  platform: 'android' as const,
  xmlHash: 'abc123',
  elements: Array.from({ length: count }, (_, i) => ({
    ref: `#${i + 1}`, role: 'button' as const, label: `btn-${i}`,
    locator: `~btn-${i}`, strategy: 'accessibility id' as const, states: ['clickable']
  })),
  dehydratedText: '',
  totalElements: count,
  interactiveCount: count,
});

ctx.recordScan(1, 'LoginScreen', mockMap('LoginScreen', 5));
ctx.recordScan(3, 'DashboardScreen', mockMap('DashboardScreen', 12));
ctx.recordScan(5, 'ProductListScreen', mockMap('ProductListScreen', 25));
ctx.recordScan(7, 'ProductDetailScreen', mockMap('ProductDetailScreen', 8));

const history = ctx.getCompactedHistory(7);
console.log('Compacted history:\n', history);

// Should show: LoginScreen and DashboardScreen as compacted, last 2 as "see latest"
console.assert(history.includes('(compacted)'), 'Old scans should be compacted');
console.assert(history.includes('ProductListScreen'), 'Recent scan should appear');
console.assert(history.includes('DashboardScreen'), 'DashboardScreen should appear');
console.log('ContextManager test passed');
