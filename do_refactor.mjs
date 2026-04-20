import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("src/services/ProjectSetupService.ts");
const sourceFile = project.getSourceFileOrThrow("src/services/ProjectSetupService.ts");
const cls = sourceFile.getClassOrThrow("ProjectSetupService");

const destDir = "src/services/setup";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const plan = {
  ProjectScaffolder: ['setup', 'scanConfigureMe', 'previewSetup', 'upgrade', 'previewUpgrade', 'repair', 'upgradeFromConfig'],
  ConfigTemplateManager: ['scaffoldPackageJson', 'scaffoldTsConfig', 'scaffoldCucumberConfig', 'scaffoldMcpConfig', 'scaffoldGitignore', 'generateConfigTemplate'],
  WdioConfigBuilder: ['scaffoldWdioConfig', 'scaffoldWdioSharedConfig', 'scaffoldWdioAndroidConfig', 'scaffoldWdioIosConfig'],
  TestScaffolder: ['scaffoldSampleFeature', 'scaffoldSampleSteps', 'scaffoldHooks', 'scaffoldBasePage', 'scaffoldLoginPage', 'scaffoldLocatorUtils'],
  UtilTemplateWriter: ['scaffoldMobileGestures', 'scaffoldMockServer', 'scaffoldAppiumDriver', 'scaffoldActionUtils', 'scaffoldGestureUtils', 'scaffoldWaitUtils', 'scaffoldAssertionUtils', 'scaffoldTestContext', 'scaffoldDataUtils', 'scaffoldMockScenarios'],
  DocScaffolder: ['scaffoldMcpConfigReference', 'scaffoldPromptCheatbook', 'scaffoldMcpDocs']
};

const baseImports = `import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpConfigService, McpConfig } from '../McpConfigService.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
`;

const commonMethods = [];
if (cls.getMethod('writeIfNotExists')) commonMethods.push(cls.getMethod('writeIfNotExists').getStructure());
if (cls.getMethod('copyDirRecursive')) commonMethods.push(cls.getMethod('copyDirRecursive').getStructure());

for (const [className, methodNames] of Object.entries(plan)) {
  const sf = project.createSourceFile(`src/services/setup/${className}.ts`, baseImports + `\n\nexport class ${className} {\n  constructor(protected mcpConfigService: McpConfigService) {}\n}`, { overwrite: true });
  const newCls = sf.getClassOrThrow(className);

  // Add the common methods so that "this.writeIfNotExists" still resolves natively
  for (const mStructure of commonMethods) {
    newCls.addMethod(mStructure);
  }

  for (const mName of methodNames) {
    const method = cls.getMethod(mName);
    if (method) {
      // Modify structure: ensure it's public so the facade can call it
      let structure = method.getStructure();
      structure.scope = "public"; 
      newCls.addMethod(structure);
    } else {
      console.log("Method not found:", mName);
    }
  }
  
  sf.saveSync();
  console.log(`Created ${className}.ts`);
}

console.log("Delegate files generated.");
