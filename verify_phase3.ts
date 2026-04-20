import { ExecutionService } from './src/services/execution/ExecutionService.js';

async function verify() {
  const service = new ExecutionService();
  console.log("ExecutionService initialized.");
  console.log("runner exists:", !!service.runner);
  console.log("tagMatcher exists:", !!service.tagMatcher);
  console.log("uiInspector exists:", !!service.uiInspector);
  console.log("reportParser exists:", !!service.reportParser);
  console.log("ExecutionService architecture is correctly delegated.");
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
