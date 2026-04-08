import { FileGuard } from '../utils/FileGuard.js';
import * as fs from 'fs';

// Test 1: TypeScript file should be text
const tsResult = FileGuard.isBinary('./src/index.ts');
console.assert(tsResult.binary === false, 'Test 1 failed: .ts should be text');
console.log('Test 1 passed: .ts recognized as text');

// Test 2: .png extension should be binary (fast path)
const pngResult = FileGuard.isBinary('./some-file.png');
console.assert(pngResult.binary === true, 'Test 2 failed: .png should be binary');
console.log('Test 2 passed: .png extension recognized as binary');

// Test 3: JSON file should be text
const jsonResult = FileGuard.isBinary('./package.json');
console.assert(jsonResult.binary === false, 'Test 3 failed: .json should be text');
console.log('Test 3 passed: .json recognized as text');

console.log('All FileGuard tests passed!');
