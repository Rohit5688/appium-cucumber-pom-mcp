import { FileStateService } from '../services/io/FileStateService.js';
import * as fs from 'fs';

const stateService = FileStateService.getInstance();
const testFile = './test-file.txt';

// Test 1: Write without read - should succeed
fs.writeFileSync(testFile, 'initial', 'utf-8');
stateService.recordWrite(testFile, 'initial');
console.log('Test 1 passed');

// Test 2: Read then write - should succeed
const content = fs.readFileSync(testFile, 'utf-8');
stateService.recordRead(testFile, content);
const validation = stateService.validateWrite(testFile);
console.assert(validation.valid === true, 'Test 2 failed');
console.log('Test 2 passed');

// Test 3: Read, external modify, write - should fail
fs.writeFileSync(testFile, 'external change', 'utf-8');
const validation2 = stateService.validateWrite(testFile);
console.assert(validation2.valid === false, 'Test 3 failed');
console.log('Test 3 passed:', validation2.reason);

// Cleanup
fs.unlinkSync(testFile);
