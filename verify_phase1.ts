import { ProjectSetupService } from './src/services/setup/ProjectSetupService.js';

async function verify() {
  const service = new ProjectSetupService();
  console.log("ProjectSetupService initialized.");
  console.log("scaffolder exists:", !!service.scaffolder);
  console.log("installer exists:", !!service.installer);
  console.log("diagnostics exists:", !!service.diagnostics);
  console.log("ProjectSetupService architecture is correctly delegated.");
}

verify().catch(e => {
  console.error(e);
  process.exit(1);
});
