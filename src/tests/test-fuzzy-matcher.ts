import { StringMatcher } from '../utils/StringMatcher.js';

// Test 1: Quote normalization
const result1 = StringMatcher.findMatch(
  "const name = 'test'",
  'const name = "test"'
);
console.assert(result1.found === true, 'Test 1 failed');
console.log('Test 1 passed: Quote normalization works');

// Test 2: Whitespace normalization
const result2 = StringMatcher.findMatch(
  "if(true){",
  "if (true) {"
);
console.assert(result2.found === true, 'Test 2 failed');
console.log('Test 2 passed: Whitespace normalization works');

// Test 3: Fuzzy replace
const content = 'const value = "hello";';
const replaced = StringMatcher.fuzzyReplace(
  "const value = 'hello'",
  "const value = 'world'",
  content
);
console.assert(replaced.modified === true, 'Test 3 failed: not modified');
console.assert(replaced.content.includes('world'), 'Test 3 failed: content mismatch');
console.log('Test 3 passed: Fuzzy replace works');

// Test 4: No match
const result4 = StringMatcher.findMatch('nonexistent', content);
console.assert(result4.found === false, 'Test 4 failed');
console.log('Test 4 passed: Correctly identifies no match');
