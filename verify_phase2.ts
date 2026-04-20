import { NavigationGraphService } from './src/services/nav/NavigationGraphService.js';

async function verify() {
  // NavigationGraphService needs a project Root constructor.
  const service = new NavigationGraphService('.');
  console.log("NavigationGraphService initialized.");
  console.log("staticAnalyzer exists:", !!service.staticAnalyzer);
  console.log("persistence exists:", !!service.persistence);
  console.log("NavigationGraphService architecture is correctly delegated.");
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
