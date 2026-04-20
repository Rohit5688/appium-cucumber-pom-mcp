import fs from 'fs';

const p = 'src/services/setup/ProjectScaffolder.ts';
let code = fs.readFileSync(p, 'utf-8');

// Replace imports and constructor
code = code.replace(
  `export class ProjectScaffolder {\n  constructor(protected mcpConfigService: McpConfigService) {}`,
  `import { ConfigTemplateManager } from './ConfigTemplateManager.js';
import { DocScaffolder } from './DocScaffolder.js';
import { TestScaffolder } from './TestScaffolder.js';
import { UtilTemplateWriter } from './UtilTemplateWriter.js';
import { WdioConfigBuilder } from './WdioConfigBuilder.js';

export class ProjectScaffolder {
  constructor(
     protected mcpConfigService: McpConfigService,
     protected configMgr: ConfigTemplateManager,
     protected docScaffolder: DocScaffolder,
     protected testScaffolder: TestScaffolder,
     protected utilWriter: UtilTemplateWriter,
     protected wdioBuilder: WdioConfigBuilder
  ) {}`
);

const replacements = {
  'this.generateConfigTemplate': 'this.configMgr.generateConfigTemplate',
  'this.scaffoldPackageJson': 'this.configMgr.scaffoldPackageJson',
  'this.scaffoldTsConfig': 'this.configMgr.scaffoldTsConfig',
  'this.scaffoldCucumberConfig': 'this.configMgr.scaffoldCucumberConfig',
  'this.scaffoldGitignore': 'this.configMgr.scaffoldGitignore',

  'this.scaffoldWdioConfig': 'this.wdioBuilder.scaffoldWdioConfig',
  'this.scaffoldWdioSharedConfig': 'this.wdioBuilder.scaffoldWdioSharedConfig',
  'this.scaffoldWdioAndroidConfig': 'this.wdioBuilder.scaffoldWdioAndroidConfig',
  'this.scaffoldWdioIosConfig': 'this.wdioBuilder.scaffoldWdioIosConfig',

  'this.scaffoldSampleFeature': 'this.testScaffolder.scaffoldSampleFeature',
  'this.scaffoldSampleSteps': 'this.testScaffolder.scaffoldSampleSteps',
  'this.scaffoldHooks': 'this.testScaffolder.scaffoldHooks',
  'this.scaffoldBasePage': 'this.testScaffolder.scaffoldBasePage',
  'this.scaffoldLoginPage': 'this.testScaffolder.scaffoldLoginPage',
  'this.scaffoldLocatorUtils': 'this.testScaffolder.scaffoldLocatorUtils',

  'this.scaffoldMobileGestures': 'this.utilWriter.scaffoldMobileGestures',
  'this.scaffoldMockServer': 'this.utilWriter.scaffoldMockServer',
  'this.scaffoldAppiumDriver': 'this.utilWriter.scaffoldAppiumDriver',
  'this.scaffoldActionUtils': 'this.utilWriter.scaffoldActionUtils',
  'this.scaffoldGestureUtils': 'this.utilWriter.scaffoldGestureUtils',
  'this.scaffoldWaitUtils': 'this.utilWriter.scaffoldWaitUtils',
  'this.scaffoldAssertionUtils': 'this.utilWriter.scaffoldAssertionUtils',
  'this.scaffoldTestContext': 'this.utilWriter.scaffoldTestContext',
  'this.scaffoldDataUtils': 'this.utilWriter.scaffoldDataUtils',
  'this.scaffoldMockScenarios': 'this.utilWriter.scaffoldMockScenarios',

  'this.scaffoldMcpConfigReference': 'this.docScaffolder.scaffoldMcpConfigReference',
  'this.scaffoldPromptCheatbook': 'this.docScaffolder.scaffoldPromptCheatbook',
  'this.scaffoldMcpDocs': 'this.docScaffolder.scaffoldMcpDocs',
};

for (const [from, to] of Object.entries(replacements)) {
  code = code.split(from).join(to);
}

fs.writeFileSync(p, code);
console.log('ProjectScaffolder patched!');
