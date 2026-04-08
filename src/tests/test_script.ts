import { ShellSecurityEngine } from '../utils/ShellSecurityEngine.js';

// Test 1: Clean package name — should pass
const r1 = ShellSecurityEngine.validatePackageName('com.example.app');
console.assert(r1.safe, 'Test 1 failed: Clean package name should be safe');

// Test 2: Injection in package name — should fail
const r2 = ShellSecurityEngine.validatePackageName('com.example.app; rm -rf /');
console.assert(!r2.safe, 'Test 2 failed: Injection should be detected');
console.assert(r2.violations.length > 0, 'Test 2 failed: Should have violations');

// Test 3: Command substitution — should fail
const r3 = ShellSecurityEngine.validateArgs(['adb', '$(whoami)']);
console.assert(!r3.safe, 'Test 3 failed: Command substitution should be detected');

// Test 4: Sanitize for shell
const sanitized = ShellSecurityEngine.sanitizeForShell("it's a test");
console.assert(sanitized === "'it'\\''s a test'", 'Test 4 failed: Quote escaping wrong');

console.log('All ShellSecurityEngine tests passed!');
