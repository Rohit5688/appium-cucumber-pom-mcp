import fs from 'fs';
import path from 'path';
import { TestGenerationService } from '../src/services/TestGenerationService.js';
import { McpConfigService } from '../src/services/McpConfigService.js';

/**
 * POC THREE-WAY GENERATOR
 * Comparing Baseline (Rules), Few-Shot (Pattern), and Hybrid (Rules + Pattern + CoT).
 */

async function runThreeWayPoc() {
    const projectRoot = path.resolve('./examples/sample-appium-project');
    const testDescription = "User updates profile details like name to 'John Doe' and email to 'john@example.com'. After update, verify we are back on profile summary screen.";
    
    // Default config mock
    const config = {
        mobile: { defaultPlatform: 'android' },
        paths: { featuresRoot: 'src/features', pagesRoot: 'src/pages', stepsRoot: 'src/step-definitions' },
        currentEnvironment: 'local'
    } as any;

    // Mock analysis result
    const analysis = {
        architecturePattern: 'pom',
        detectedPaths: { featuresRoot: 'src/features', pagesRoot: 'src/pages', stepsRoot: 'src/step-definitions' },
        existingStepDefinitions: [
            { file: 'src/step-definitions/sample.steps.ts', steps: [
                { type: 'Given', pattern: 'the app is launched' },
                { type: 'When', pattern: 'I enter username {string} and password {string}' },
                { type: 'When', pattern: 'I tap the login button' },
                { type: 'Then', pattern: 'I should see the home screen' }
            ]}
        ],
        existingPageObjects: [
            { path: 'src/pages/MobileLoginPage.ts', publicMethods: ['enterCredentials', 'tapLogin', 'isAt', 'isVisible'] }
        ],
        conflicts: [], importAliases: {}, yamlLocatorFiles: []
    } as any;

    const generator = new TestGenerationService();

    // 1. PROMPT A: BASELINE (Existing Rule-Based Logic)
    const promptA = await generator.generateAppiumPrompt(projectRoot, testDescription, config, analysis);

    // Common Few-Shot Example
    const fewShotTemplate = `
### REFERENCE PATTERN: THE BDD TRIAD (GOLD STANDARD)
- Feature File (sample.feature): @smoke logic.
- Page Object (MobileLoginPage.ts): Private locators, standard methods.
- Step Definition (sample.steps.ts): PO instantiation inside steps.
(See full content in POC strategy docs)
`;

    // 2. PROMPT B: FEW-SHOT ONLY (Minimal Rules, Heavy Pattern)
    const promptB = `
You are an expert Mobile Automation Engineer.
Generate code for: "${testDescription}"

${fewShotTemplate}

OUTPUT ONLY the JSON expected by the Appium MCP server (filesToCreate, filesToUpdate, jsonPageObjects).
`;

    // 3. PROMPT C: HYBRID (Rules + Pattern + Chain of Thought)
    const chainOfThought = `
## 🧠 MANDATORY THINKING CHAIN
Before returning the JSON:
1. Identify existing steps vs new steps.
2. Identify existing Page Methods vs new ones.
3. Ensure locators match the accessibility-id (~id) style shown in the example.
`;
    const promptC = promptA.replace("You are an expert", "## ROLE\nYou are a Principal Architect. " + chainOfThought)
                            .replace("## REQUIRED SCENARIO COVERAGE", fewShotTemplate + "\n## REQUIRED SCENARIO COVERAGE");

    // SAVE PROMPTS
    const results = { promptA, promptB, promptC };
    fs.writeFileSync('./scratch/poc_three_way_prompts.json', JSON.stringify(results, null, 2));
    console.log("Three-Way Prompts Generated. Results saved to ./scratch/poc_three_way_prompts.json");
}

runThreeWayPoc().catch(console.error);
