# Few-Shot Chain Prompting Technique - Comprehensive Analysis for LLM Code Generation

## Executive Summary

This document analyzes the **Few-Shot Chain Prompting** technique specifically designed for test automation code generation. This novel approach combines two powerful prompt engineering methods:

1. **Few-Shot Learning** - providing carefully selected examples
2. **Chain-of-Thought (CoT)** - structuring prompts to guide logical reasoning steps

The technique was introduced in the IEEE research paper "Cypress Copilot: Development of an AI Assistant for Boosting Productivity and Transforming Web Application Testing" and implemented in both Cypress Copilot and Playwright Copilot VS Code extensions.

---

## 1. Core Concept

### What is Few-Shot Chain Prompting?

Few-Shot Chain Prompting is a hybrid prompt engineering technique that:

- **Provides the LLM with carefully selected examples** (few-shot learning) of input scenarios and their corresponding outputs
- **Structures prompts to guide the model through a logical sequence of reasoning steps** (chain-of-thought)
- **Combines these techniques** to enhance the model's ability to handle complex, multi-step code generation tasks

### Key Components

```
Few-Shot Chain = Few-Shot Examples + Chain-of-Thought Reasoning
```

**Component 1: Few-Shot Examples**

- Demonstrates input-output patterns
- Shows 2-5 carefully curated examples
- Includes diverse scenarios covering the problem space

**Component 2: Chain-of-Thought**

- Breaks down complex tasks into sequential steps
- Shows intermediate reasoning, not just final answers
- Guides the model through logical progression

---

## 2. Why This Technique Was Developed

### Problem Statement

QA engineers face significant challenges:

- **30-40% of time** spent writing and maintaining test automation code
- High syntax error rates with standard prompting
- Inconsistent code quality and maintainability
- Difficulty generating code that follows best practices

### Traditional Approach Limitations

**Zero-Shot Prompting:**

- High error rate (36% syntax errors with GPT-4-Turbo)
- Incomplete method implementations
- Poor adherence to design patterns

**Basic Few-Shot Prompting:**

- Better than zero-shot but still inconsistent
- Lacks reasoning guidance for complex tasks

**GitHub Copilot (baseline):**

- 24% syntax error rate
- Limited context understanding for BDD scenarios

---

## 3. How Few-Shot Chain Prompting Works

### The Workflow

```
User Input (BDD Scenario)
    ↓
System Constructs Prompt with:
  - Task Description
  - Few-Shot Examples (with reasoning)
  - Current Scenario
    ↓
LLM Processes with Chain-of-Thought
    ↓
Generated Code Output
```

### Step-by-Step Process

**Step 1: User Input**

- Users input BDD (Behavior Driven Development) scenarios written in Gherkin language
- Example: "Given the user is on the login page, When the user enters valid credentials, Then the user should be redirected to the dashboard"

**Step 2: Prompt Construction**
The system constructs specialized prompts that include:

- Clear task definition
- 2-5 carefully selected few-shot examples
- Each example shows:
  - Input BDD scenario
  - Step-by-step reasoning process
  - Final code output (step definitions + Page Object Model)
- Current scenario to process

**Step 3: Chain-of-Thought Reasoning**
For each example, the reasoning chain shows:

- Analysis of the scenario structure
- Identification of required methods
- Application of design patterns
- Best practices to follow

**Step 4: Code Generation**

- LLM generates production-ready code
- Follows demonstrated patterns and reasoning
- Implements best practices from examples

---

## 4. Detailed Example Structure

### Example Format

````markdown
### Example 1: Login Scenario

**Input (BDD Scenario):**

```gherkin
Scenario: User logs in with valid credentials
  Given the user is on the login page
  When the user enters valid credentials
  Then the user should be redirected to the dashboard
```
````

**Reasoning Chain:**

1. Analyze scenario structure:
   - Given step → Navigation/setup action
   - When step → User interaction
   - Then step → Verification/assertion

2. Identify required Page Object methods:
   - navigateToLogin()
   - enterCredentials(username, password)
   - verifyDashboardVisible()

3. Apply design patterns:
   - Page Object Model for element locators
   - Async/await for asynchronous operations
   - Clear method naming conventions

4. Best practices to implement:
   - Use data-testid selectors for stability
   - Separate concerns (PO from step definitions)
   - Include proper error handling

**Output (Step Definitions):**

```javascript
import { Given, When, Then } from "@cucumber/cucumber";
import { LoginPage } from "../pages/LoginPage";

let loginPage;

Given("the user is on the login page", async function () {
  loginPage = new LoginPage(this.page);
  await loginPage.navigate();
});

When("the user enters valid credentials", async function () {
  await loginPage.enterUsername("testuser@example.com");
  await loginPage.enterPassword("SecurePass123");
  await loginPage.clickLoginButton();
});

Then("the user should be redirected to the dashboard", async function () {
  await loginPage.verifyDashboardRedirect();
});
```

**Output (Page Object Model):**

```javascript
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('[data-testid="username-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.dashboardHeading = page.locator('[data-testid="dashboard-heading"]');
  }

  async navigate() {
    await this.page.goto("/login");
  }

  async enterUsername(username) {
    await this.usernameInput.fill(username);
  }

  async enterPassword(password) {
    await this.passwordInput.fill(password);
  }

  async clickLoginButton() {
    await this.loginButton.click();
  }

  async verifyDashboardRedirect() {
    await this.dashboardHeading.waitFor({ state: "visible" });
    expect(await this.dashboardHeading.textContent()).toContain("Dashboard");
  }
}
```

```

---

## 5. Implementation in Cypress/Playwright Copilot

### System Architecture

```

VS Code Extension
↓
User Inputs BDD Scenario
↓
Extension Constructs Few-Shot Chain Prompt
↓
Sends to GPT-4o API
↓
Receives Generated Code
↓
Displays in Preview Panel
↓
User Reviews/Copies Code

````

### Prompt Template Structure (Inferred)

```javascript
const systemPrompt = `
You are an expert test automation engineer specializing in ${framework} (Cypress/Playwright)
with BDD methodology. Generate high-quality, production-ready code following best practices.

## Task
Generate step definitions and Page Object Model code for the provided BDD scenario.

## Requirements
- Use async/await for asynchronous operations
- Follow Page Object Model design pattern
- Use stable locator strategies (data-testid preferred)
- Include proper error handling
- Write clean, maintainable code

## Examples
${fewShotExamples} // 2-5 examples with reasoning chains

## Your Task
Analyze the following BDD scenario and generate the code:

${userScenario}

Think through this step by step:
1. Analyze the scenario structure
2. Identify required Page Object methods
3. Apply appropriate design patterns
4. Generate step definitions
5. Generate Page Object Model class
`;
````

### Key Configuration

- **Model**: GPT-4o (best performance for this task)
- **Examples**: 2-5 diverse scenarios covering common patterns
- **Temperature**: Likely 0.2-0.4 (for consistency)
- **Token Limit**: Sufficient for examples + generated code

---

## 6. Measured Results & Performance

### Syntax Error Reduction

| Approach                    | Syntax Error Rate |
| --------------------------- | ----------------- |
| GPT-4-Turbo (Zero-Shot)     | 36%               |
| GPT-4o (Zero-Shot)          | 32%               |
| GitHub Copilot (Zero-Shot)  | 24%               |
| **GPT-4o (Few-Shot Chain)** | **8%**            |

**Improvement**: 75% reduction in syntax errors vs. zero-shot approaches

### Code Quality Metrics

**Completeness:**

- Significantly higher proportion of required methods correctly implemented
- Functional test code vs. partial implementations

**Accuracy:**

- Strong syntactical correctness
- Adherence to best practices
- Proper use of design patterns

**Maintainability:**

- Rated **8.2/10** by senior Dev/QA engineers
- Clear structure
- Reduced redundancy
- Self-documenting code

**Productivity:**

- **65% reduction** in test automation development time
- More comprehensive test coverage
- Faster iterations

---

## 7. Prompt Engineering Principles Applied

### Few-Shot Learning Principles

1. **Example Selection**
   - Diverse scenarios covering the problem space
   - Different complexity levels
   - Common patterns in the domain

2. **Example Quality**
   - Complete, working code examples
   - Follow established best practices
   - Include edge cases

3. **Example Quantity**
   - 2-5 examples (diminishing returns after 5)
   - Not too many (token efficiency)
   - Not too few (pattern recognition)

### Chain-of-Thought Principles

1. **Step-by-Step Reasoning**
   - Break down complex tasks
   - Show intermediate thinking
   - Make reasoning explicit

2. **Structured Approach**
   - Consistent reasoning format
   - Logical progression
   - Clear transitions

3. **Domain-Specific Knowledge**
   - Test automation best practices
   - Framework-specific patterns
   - BDD methodology

---

## 8. Comparison with Other Techniques

### Zero-Shot Prompting

```
Prompt: "Generate Playwright test code for this BDD scenario: [scenario]"
```

**Pros:**

- Simple, quick to implement
- No examples needed

**Cons:**

- High error rate (32-36%)
- Inconsistent quality
- Limited context understanding

---

### Basic Few-Shot Prompting

```
Prompt:
"Here are examples:
Example 1: [input] → [output]
Example 2: [input] → [output]

Now generate for: [new scenario]"
```

**Pros:**

- Shows patterns
- Better than zero-shot

**Cons:**

- No reasoning guidance
- Still prone to errors
- Missing intermediate steps

---

### Few-Shot Chain Prompting (This Technique)

```
Prompt:
"Example 1:
Input: [scenario]
Reasoning:
  Step 1: Analyze structure...
  Step 2: Identify methods...
  Step 3: Apply patterns...
Output: [code]

Example 2: [similar structure]

Now for your scenario:
Input: [new scenario]
Let's think step by step..."
```

**Pros:**

- ✓ Low error rate (8%)
- ✓ High code quality
- ✓ Consistent patterns
- ✓ Reasoning transparency
- ✓ Best practices adherence

**Cons:**

- Requires careful example curation
- More tokens used
- Initial setup effort

---

## 9. Best Practices for Implementation

### Example Selection Guidelines

1. **Diversity**
   - Cover different scenario types (CRUD, navigation, validation)
   - Include both simple and complex examples
   - Vary the number of steps

2. **Quality**
   - Use production-quality code
   - Follow team/industry standards
   - Include error handling

3. **Relevance**
   - Match target framework (Cypress/Playwright)
   - Align with team conventions
   - Reflect real use cases

### Prompt Construction

1. **Clear Instructions**
   - Define the task explicitly
   - Specify output format
   - List requirements

2. **Structured Examples**
   - Consistent formatting
   - Clear input/output separation
   - Explicit reasoning steps

3. **Context Provision**
   - Framework version
   - Language (JavaScript/TypeScript)
   - Design patterns in use

### Optimization Strategies

1. **Token Efficiency**
   - Remove redundant text
   - Compress examples while maintaining clarity
   - Use concise reasoning steps

2. **Dynamic Example Selection**
   - Match examples to scenario type
   - Retrieve most relevant from example pool
   - Adapt based on complexity

3. **Iterative Refinement**
   - Test with real scenarios
   - Measure error rates
   - Update examples based on failures

---

## 10. Code Generation for LLM Integration

### Template for LLM System Prompt

```javascript
const FEW_SHOT_CHAIN_SYSTEM_PROMPT = `
You are an expert ${FRAMEWORK} test automation engineer with deep expertise in BDD methodology 
and the Page Object Model design pattern.

## Your Task
Generate production-ready test automation code for BDD scenarios.

## Output Requirements
1. Step definition file with proper imports and async/await
2. Page Object Model class with well-structured methods
3. Use stable locators (data-testid, role-based selectors)
4. Include proper error handling and assertions
5. Follow ${FRAMEWORK} best practices

## Reasoning Approach
For each scenario, think through:
1. **Analyze Structure**: Identify Given/When/Then steps and their purpose
2. **Identify Methods**: Determine required Page Object methods
3. **Apply Patterns**: Use POM, async/await, proper assertions
4. **Generate Code**: Write clean, maintainable code

## Examples

### Example 1: User Authentication
**Input:**
\`\`\`gherkin
Scenario: Successful login
  Given I am on the login page
  When I enter valid credentials
  Then I should see the dashboard
\`\`\`

**Reasoning:**
- Given step: Navigation → create navigate() method
- When step: User input → create enterCredentials() method  
- Then step: Verification → create verifyDashboard() method
- Apply: POM pattern, data-testid selectors, async/await

**Step Definitions:**
\`\`\`javascript
import { Given, When, Then } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';

Given('I am on the login page', async function() {
  this.loginPage = new LoginPage(this.page);
  await this.loginPage.navigate();
});

When('I enter valid credentials', async function() {
  await this.loginPage.login('user@test.com', 'password123');
});

Then('I should see the dashboard', async function() {
  await this.loginPage.verifyDashboardVisible();
});
\`\`\`

**Page Object:**
\`\`\`javascript
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email"]');
    this.passwordInput = page.locator('[data-testid="password"]');
    this.loginButton = page.locator('[data-testid="login-btn"]');
  }

  async navigate() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async verifyDashboardVisible() {
    await this.page.waitForURL('/dashboard');
  }
}
\`\`\`

### Example 2: Form Submission
[Another complete example...]

### Example 3: Data Validation
[Another complete example...]

## Now Process This Scenario

**Input:**
\`\`\`gherkin
${USER_SCENARIO}
\`\`\`

**Your Reasoning:**
Think step by step following the pattern above.

**Generated Code:**
Provide the step definitions and Page Object Model.
`;
```

### Implementation Code Template

````javascript
class FewShotChainCodeGenerator {
  constructor(apiKey, model = "gpt-4o") {
    this.apiKey = apiKey;
    this.model = model;
    this.examples = this.loadExamples();
  }

  loadExamples() {
    // Load 3-5 curated examples with reasoning chains
    return [
      {
        scenario: "...",
        reasoning: "...",
        stepDefinitions: "...",
        pageObject: "...",
      },
      // More examples...
    ];
  }

  constructPrompt(userScenario, framework = "playwright") {
    const systemPrompt = this.buildSystemPrompt(framework);
    const examplesText = this.formatExamples();

    return {
      system: systemPrompt,
      user: `
## Current Scenario
${userScenario}

Generate the code following the same reasoning pattern as the examples.
Think step by step before generating the code.
`,
    };
  }

  async generate(bddScenario, framework = "playwright") {
    const prompt = this.constructPrompt(bddScenario, framework);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.3, // Low for consistency
        max_tokens: 2000,
      }),
    });

    const data = await response.json();
    return this.parseGeneratedCode(data.choices[0].message.content);
  }

  parseGeneratedCode(content) {
    // Extract step definitions and page object from response
    const stepDefMatch = content.match(/```javascript\n([\s\S]*?)```/);
    const pageObjectMatch = content.match(/```javascript\n([\s\S]*?)```/g)[1];

    return {
      stepDefinitions: stepDefMatch ? stepDefMatch[1] : "",
      pageObject: pageObjectMatch
        ? pageObjectMatch.replace(/```javascript\n|```/g, "")
        : "",
      fullResponse: content,
    };
  }
}

// Usage
const generator = new FewShotChainCodeGenerator(OPENAI_API_KEY);

const bddScenario = `
Scenario: User adds item to cart
  Given I am on the product page
  When I click the add to cart button
  Then the item should appear in my cart
`;

const result = await generator.generate(bddScenario, "playwright");
console.log(result.stepDefinitions);
console.log(result.pageObject);
````

---

## 11. Adaptation for Different Frameworks

### For Cypress

```javascript
// Adjust examples to Cypress syntax
const cypressExample = {
  stepDefinitions: `
import { Given, When, Then } from 'cypress-cucumber-preprocessor/steps';

Given('I am on the login page', () => {
  cy.visit('/login');
});

When('I enter valid credentials', () => {
  cy.get('[data-testid="email"]').type('user@test.com');
  cy.get('[data-testid="password"]').type('password123');
  cy.get('[data-testid="login-btn"]').click();
});

Then('I should see the dashboard', () => {
  cy.url().should('include', '/dashboard');
});
`,
  pageObject: `
// Cypress uses commands instead of POM typically
Cypress.Commands.add('login', (email, password) => {
  cy.get('[data-testid="email"]').type(email);
  cy.get('[data-testid="password"]').type(password);
  cy.get('[data-testid="login-btn"]').click();
});
`,
};
```

### For Playwright (TypeScript)

```typescript
// TypeScript version with stronger typing
const playwrightTSExample = {
  stepDefinitions: `
import { Given, When, Then } from '@cucumber/cucumber';
import { LoginPage } from '../pages/LoginPage';
import { Page } from '@playwright/test';

let loginPage: LoginPage;

Given('I am on the login page', async function(this: { page: Page }) {
  loginPage = new LoginPage(this.page);
  await loginPage.navigate();
});
`,
  pageObject: `
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email"]');
    this.passwordInput = page.locator('[data-testid="password"]');
    this.loginButton = page.locator('[data-testid="login-btn"]');
  }

  async navigate(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}
`,
};
```

---

## 12. Advanced Techniques

### Dynamic Example Selection

```javascript
class DynamicExampleSelector {
  constructor(examplePool) {
    this.examplePool = examplePool; // Large set of categorized examples
  }

  selectRelevantExamples(scenario, count = 3) {
    // Analyze scenario characteristics
    const features = this.extractFeatures(scenario);

    // Find most similar examples
    const scored = this.examplePool.map((ex) => ({
      example: ex,
      score: this.calculateSimilarity(features, ex.features),
    }));

    // Return top N most relevant
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((item) => item.example);
  }

  extractFeatures(scenario) {
    return {
      stepCount: scenario
        .split("\n")
        .filter((l) => l.trim().match(/^(Given|When|Then)/)).length,
      hasAuthentication: /login|sign in|authenticate/i.test(scenario),
      hasForm: /submit|fill|enter/i.test(scenario),
      hasNavigation: /navigate|visit|go to/i.test(scenario),
      hasAssertion: /should|verify|expect/i.test(scenario),
    };
  }

  calculateSimilarity(features1, features2) {
    // Simple similarity score
    let score = 0;
    for (const key in features1) {
      if (features1[key] === features2[key]) score++;
    }
    return score;
  }
}
```

### Self-Consistency with Few-Shot Chain

```javascript
async function generateWithSelfConsistency(scenario, iterations = 3) {
  const results = [];

  // Generate multiple solutions
  for (let i = 0; i < iterations; i++) {
    const result = await generator.generate(scenario);
    results.push(result);
  }

  // Find most consistent solution
  const mostConsistent = findMostConsistentCode(results);
  return mostConsistent;
}

function findMostConsistentCode(results) {
  // Compare structure, method names, patterns
  // Return the most frequently occurring pattern
  // Or merge best practices from all results
}
```

### Negative Examples (Error Avoidance)

```javascript
const negativeExample = {
  scenario: "User login",
  incorrectReasoning: "Use hardcoded waits and fragile selectors",
  incorrectCode: `
// DON'T DO THIS
cy.wait(5000); // Hardcoded wait
cy.get('div > div > input').type('user'); // Fragile selector
`,
  correctReasoning: "Use smart waits and stable selectors",
  correctCode: `
// DO THIS
cy.get('[data-testid="username"]').type('user'); // Stable selector
cy.get('[data-testid="login-btn"]').click(); // No hardcoded waits
`,
};
```

---

## 13. Evaluation & Monitoring

### Quality Metrics to Track

```javascript
class CodeQualityEvaluator {
  evaluate(generatedCode) {
    return {
      syntaxErrors: this.checkSyntax(generatedCode),
      completeness: this.checkCompleteness(generatedCode),
      bestPractices: this.checkBestPractices(generatedCode),
      maintainability: this.scoreMaintainability(generatedCode),
    };
  }

  checkSyntax(code) {
    // Run through linter/parser
    // Count syntax errors
  }

  checkCompleteness(code) {
    // Verify all required methods present
    // Check for async/await consistency
    // Validate imports
  }

  checkBestPractices(code) {
    // Check for:
    // - Stable selectors (data-testid)
    // - No hardcoded waits
    // - Proper error handling
    // - POM pattern usage
  }

  scoreMaintainability(code) {
    // Cyclomatic complexity
    // Method length
    // Naming conventions
    // Code duplication
  }
}
```

### A/B Testing Prompts

```javascript
async function comparePromptVersions(scenarios) {
  const versionA = await testWithPromptVersion("v1", scenarios);
  const versionB = await testWithPromptVersion("v2", scenarios);

  console.log("Version A Error Rate:", versionA.errorRate);
  console.log("Version B Error Rate:", versionB.errorRate);

  return versionA.errorRate < versionB.errorRate ? "v1" : "v2";
}
```

---

## 14. Future Enhancements

### Research Directions

1. **Automated Example Curation**
   - Auto-CoT style automation for test domain
   - Cluster test scenarios by type
   - Generate reasoning chains automatically

2. **Multimodal Chain-of-Thought**
   - Include screenshots of UI
   - Visual reasoning for element identification
   - Enhanced context for complex scenarios

3. **Self-Healing Test Generation**
   - Generate resilient selectors
   - Multiple fallback strategies
   - Adaptive locator patterns

4. **Cross-Framework Translation**
   - Translate between Cypress ↔ Playwright
   - Maintain reasoning across frameworks
   - Framework-agnostic patterns

---

## 15. Key Takeaways for LLM Implementation

### Do's ✓

1. **Include 2-5 high-quality examples** with complete reasoning chains
2. **Show intermediate steps** in the reasoning process
3. **Use diverse examples** covering different scenario types
4. **Match examples to target framework** (Cypress/Playwright)
5. **Keep reasoning structured** and consistent across examples
6. **Test and iterate** on example selection
7. **Measure error rates** to validate improvements

### Don'ts ✗

1. **Don't skip the reasoning chain** - it's critical for quality
2. **Don't use too many examples** (>8) - diminishing returns
3. **Don't use poor quality examples** - garbage in, garbage out
4. **Don't forget to update examples** as best practices evolve
5. **Don't ignore framework differences** between Cypress/Playwright
6. **Don't use generic examples** - make them domain-specific

---

## 16. References & Resources

### Academic Papers

- IEEE Access: "Cypress Copilot: Development of an AI Assistant for Boosting Productivity and Transforming Web Application Testing" (DOI: 10.1109/ACCESS.2024.3521407)
- Wei et al. (2022): "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models"
- Zhang et al. (2022): "Automatic Chain of Thought Prompting in Large Language Models"

### Implementation Examples

- Cypress Copilot: https://github.com/OptimizeAIHub/Cypress-Copilot
- Playwright Copilot: https://github.com/OptimizeAIHub/Playwright-Copilot
- VS Code Marketplace: Cypress Copilot extension

### Prompt Engineering Guides

- Prompt Engineering Guide: https://www.promptingguide.ai/
- Few-Shot Prompting: https://www.promptingguide.ai/techniques/fewshot
- Chain-of-Thought: https://www.promptingguide.ai/techniques/cot

---

## Conclusion

Few-Shot Chain Prompting represents a significant advancement in AI-assisted test automation. By combining carefully curated examples with structured reasoning, it achieves:

- **75% reduction in syntax errors** (from 32% to 8%)
- **65% faster development time**
- **8.2/10 maintainability score** from senior engineers
- **Production-ready code** with minimal manual edits

This technique can be adapted for any LLM-based code generation task by:

1. Curating domain-specific examples
2. Structuring reasoning chains for the task
3. Iteratively refining based on output quality

The key insight: **Show the model how to think, not just what to produce.**
