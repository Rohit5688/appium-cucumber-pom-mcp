const fs = require('fs');
const path = require('path');

const tools = [
  // Tier 1 & 2
  'execute_sandbox_code',
  'generate_cucumber_pom',
  'start_appium_session',
  'inspect_ui_hierarchy',
  'run_cucumber_test',
  'self_heal_test',
  'validate_and_write',
  'check_environment',
  'manage_config',
  'workflow_guide',
  // Tier 3 - Analysis
  'audit_mobile_locators',
  'suggest_refactorings',
  'analyze_coverage',
  // Tier 3 - Maintenance
  'upgrade_project',
  'repair_project',
  'train_on_example',
  // Tier 3 - Utility
  'export_bug_report',
  'generate_ci_workflow',
  'summarize_suite'
];

console.log('\n=== Tool Description Length Verification ===\n');

let allPass = true;

for (const tool of tools) {
  const filePath = path.join(__dirname, 'src/tools', `${tool}.ts`);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract description between backticks after 'description:'
  const match = content.match(/description:\s*`([^`]+)`/s);
  
  if (match) {
    const description = match[1];
    const length = description.length;
    const status = length <= 2048 ? '✅ PASS' : '❌ FAIL';
    
    if (length > 2048) allPass = false;
    
    console.log(`${status} ${tool.padEnd(30)} ${length.toString().padStart(4)} chars`);
  } else {
    console.log(`⚠️  WARN ${tool.padEnd(30)} No description found`);
    allPass = false;
  }
}

console.log('\n' + '='.repeat(50));
console.log(allPass ? '✅ All descriptions under 2048 chars' : '❌ Some descriptions exceed limit');
console.log('='.repeat(50) + '\n');

process.exit(allPass ? 0 : 1);