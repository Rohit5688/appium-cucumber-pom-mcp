import { McpConfigService } from '../config/McpConfigService.js';
import { ProjectScaffolder } from './ProjectScaffolder.js';
import { ConfigTemplateManager } from './ConfigTemplateManager.js';
import { DocScaffolder } from './DocScaffolder.js';
import { TestScaffolder } from './TestScaffolder.js';
import { UtilTemplateWriter } from './UtilTemplateWriter.js';
import { WdioConfigBuilder } from './WdioConfigBuilder.js';

export class ProjectSetupService {
  private readonly configMgr: ConfigTemplateManager;
  private readonly docScaffolder: DocScaffolder;
  private readonly testScaffolder: TestScaffolder;
  private readonly utilWriter: UtilTemplateWriter;
  private readonly wdioBuilder: WdioConfigBuilder;
  private readonly scaffolder: ProjectScaffolder;

  constructor(
    private readonly mcpConfigService: McpConfigService = new McpConfigService()
  ) {
    this.configMgr = new ConfigTemplateManager(this.mcpConfigService);
    this.docScaffolder = new DocScaffolder(this.mcpConfigService);
    this.testScaffolder = new TestScaffolder(this.mcpConfigService);
    this.utilWriter = new UtilTemplateWriter(this.mcpConfigService);
    this.wdioBuilder = new WdioConfigBuilder(this.mcpConfigService);
    
    this.scaffolder = new ProjectScaffolder(
      this.mcpConfigService,
      this.configMgr,
      this.docScaffolder,
      this.testScaffolder,
      this.utilWriter,
      this.wdioBuilder
    );
  }

  public async setup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
    return this.scaffolder.setup(projectRoot, platform, appName);
  }

  public scanConfigureMe(projectRoot: string): string[] {
    return this.scaffolder.scanConfigureMe(projectRoot);
  }

  public async previewSetup(projectRoot: string, platform: string = 'android', appName: string = 'MyMobileApp'): Promise<string> {
    return this.scaffolder.previewSetup(projectRoot, platform, appName);
  }

  public async upgrade(projectRoot: string, preview: boolean = false): Promise<string> {
    return this.scaffolder.upgrade(projectRoot, preview);
  }

  public async previewUpgrade(projectRoot: string) {
    return this.scaffolder.previewUpgrade(projectRoot);
  }

  public async repair(projectRoot: string, platform: string = 'android') {
    return this.scaffolder.repair(projectRoot, platform);
  }

  public async upgradeFromConfig(projectRoot: string, preview: boolean = false): Promise<string> {
    return this.scaffolder.upgradeFromConfig(projectRoot, preview);
  }
}
