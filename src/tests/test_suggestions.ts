import { FileSuggester } from '../utils/FileSuggester.js';

// Test 1: Different extension
const suggestions = FileSuggester.suggest('./src/index.js');
const tsMatch = suggestions.find(s => s.path.endsWith('index.ts'));
console.assert(tsMatch !== undefined, 'Should suggest .ts version');
console.log('Test 1 passed: Extension suggestion works');

// Test 2: Format output
const formatted = FileSuggester.enhanceError('./src/index.js');
console.assert(formatted.includes('Did you mean?'), 'Should include Did you mean?');
console.log('Test 2 passed:', formatted);
