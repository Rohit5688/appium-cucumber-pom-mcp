import { AuditLocatorService } from './src/services/AuditLocatorService.js';
import { McpConfigService } from './src/services/McpConfigService.js';
import path from 'path';

async function verify() {
  const service = new AuditLocatorService();
  console.log("AuditLocatorService initialized.");
  console.log("yamlParser exists:", !!service.yamlParser);
  console.log("tsParser exists:", !!service.tsParser);
  console.log("reportGenerator exists:", !!service.reportGenerator);

  // We can just verify it doesn't crash on an empty dir
  const projectRoot = path.resolve('dummy-verification-project2');
  const report = await service.audit(projectRoot);
  console.log("Total locators found in empty project:", report.totalLocators);
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
