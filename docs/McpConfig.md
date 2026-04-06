# ⚙️ AppForge Configuration Guide

The `mcp-config.json` file dictates project-level rules for test generation, execution, and mobile device capabilities. The AI reads this file to understand the environment parameters it must operate under.

---

## 🏗️ Core Project Configuration

| Field | Expected Values | Description |
| :--- | :--- | :--- |
| `$schema` | `string` | Link to the local `.AppForge/configSchema.json` for IDE autocompletion. |
| `version` | `"1.1.0"` | Configuration schema version for auto-migrations. |
| `project.language` | `"typescript"` | The programming language used. |
| `project.testFramework`| `"cucumber"` | The test orchestration framework. |
| `project.client` | `"webdriverio-appium"` | The underlying automation driver. |
| `project.executionCommand` | `string` | The command to run tests (e.g. `npx wdio run wdio.conf.ts`). |
| `environments` | `["staging", "prod", "local"]` | Array of test environment names for dynamic swapping. |
| `currentEnvironment` | `"staging"`, `"prod"`, etc. | The active string environment currently under test. Defaults to the first array item. |

**Example:**
```json
{
  "version": "1.1.0",
  "project": {
    "language": "typescript",
    "testFramework": "cucumber",
    "client": "webdriverio-appium",
    "executionCommand": "npm run test:android"
  },
  "environments": ["local", "staging", "prod"],
  "currentEnvironment": "staging"
}
```

---

## 📱 Mobile Profiles: `mobile` and `builds`

Define your physical devices, emulators, cloud grids, and active app builds.

| Field | Expected Values | Description |
| :--- | :--- | :--- |
| `mobile.defaultPlatform` | `"Android"`, `"iOS"`, `"both"` | The primary OS tested. "both" scaffolds a multi-config workspace. |
| `mobile.capabilitiesProfiles` | `Record<string, object>` | Named mapping of Appium W3C capabilities (e.g., `"pixel8"`, `"iphone15"`). |
| `mobile.cloud` | `object` | Specifies cloud provider (`"browserstack"`, `"saucelabs"`, `"none"`) and credentials. |
| `builds` | `Record<string, BuildProfile>` | Named objects containing `appPath`, `bundleId`, `serverUrl`, and `env`. |
| `activeBuild` | key from `builds` | Injects the active build's `appPath` instantly across all capability profiles. |

**Example:**
```json
"mobile": {
  "defaultPlatform": "Android",
  "capabilitiesProfiles": {
    "pixel_8_local": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "emulator-5554"
    }
  },
  "cloud": {
    "provider": "browserstack",
    "username": "${BS_USER}",
    "accessKey": "${BS_KEY}"
  }
},
"builds": {
  "release_v2": {
    "appPath": "./apps/release-v2.0.apk",
    "env": "prod"
  }
},
"activeBuild": "release_v2"
```

> [!TIP]
> **Environment Variables**: You can use `${VAR_NAME}` syntax inside your profiles. The MCP server automatically resolves these from your `.env` file!

---

## 📂 Path Conventions

Directory mapping for the AppForge structural generators and AST analyzers.

| Field | Expected Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `paths.featuresRoot` | `string` | `"features"` | Location of `.feature` Gherkin files. |
| `paths.pagesRoot` | `string` | `"pages"` | Location of Page Object classes. |
| `paths.stepsRoot` | `string` | `"step-definitions"` | Location of Step Definitions. |
| `paths.utilsRoot` | `string` | `"utils"` | Location of helper utilities. |
| `paths.testDataRoot` | `string` | `"src/test-data"` | Location of generated user profiles / mocks. |
| `paths.reportsRoot` | `string` | `"reports"` | Dump directory for test outputs. |
| `tsconfigPath` | `"tsconfig.json"`, `null` | `null` | Absolute or relative path to override TypeScript compilation limits during generation checks. |

**Example:**
```json
"paths": {
  "featuresRoot": "src/features",
  "pagesRoot": "src/screens",
  "stepsRoot": "src/steps"
},
"tsconfigPath": "tsconfig.mobile.json"
```

---

## ✍️ Code Generation: `codegen`

Rules controlling how the `generate_cucumber_pom` tool writes code.

| Field | Expected Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `codegen.basePageStrategy` | `"extend"`, `"compose"`, `"custom"` | `"extend"` | "extend" forces class inheritance (extends BasePage). |
| `codegen.gherkinStyle` | `"strict"`, `"flexible"` | `"strict"` | "strict" enforces exact Given/When/Then patterns. |
| `codegen.namingConvention.pageObjectSuffix`| `"Page"`, `"Screen"`, `"Flow"`, `"Component"` | `"Page"` | How classes are generated/named (e.g., LoginScreen vs LoginPage). |
| `codegen.namingConvention.caseStyle`| `"PascalCase"`, `"camelCase"` | `"PascalCase"` | Case format of the file names. |
| `codegen.tagTaxonomy` | `["@smoke", "@regression"]` | `[]` | Strict tag dictionary the LLM is restricted to using on feature scenarios. |
| `codegen.generateFiles` | `"full"`, `"feature-steps"`, `"feature-only"` | `"full"` | Determines which components the generator bootstraps. |
| `codegen.customWrapperPackage` | `string`, `null` | `null` | External NPM package to import Page Object roots from, bypassing local BasePage. |

**Example:**
```json
"codegen": {
  "basePageStrategy": "extend",
  "gherkinStyle": "strict",
  "tagTaxonomy": ["@smoke", "@p0", "@ios-only"],
  "generateFiles": "full",
  "namingConvention": {
    "pageObjectSuffix": "Screen",
    "caseStyle": "PascalCase"
  }
}
```

---

## ⏱️ Execution Timeouts & Reporting

| Field | Expected Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `execution.timeoutMs` | `number` | `1800000` | Hard cap (ms) for the entire test subprocess. Max 2 hours (7200000ms). |
| `execution.reportPath` | `string` | `undefined` | Optional explicit path string pointing to test report JSON outputs. |
| `timeouts.elementWait` | `number` | `10000` | Global implicit wait (ms) for element locators inside WaitUtils. |
| `timeouts.scenarioTimeout` | `number` | `60000` | Cucumber limit per single scenario block. |
| `timeouts.appiumPort` | `number` | `4723` | Active port used for local driver connections. |
| `timeouts.xmlCacheTtlMinutes`| `number` | `5` | Lifespan for stored XML UI hierarchies allowing rapid self-healing without requesting XML twice. |
| `reporting.format` | `"html"`, `"allure"`, `"junit"`, `"none"` | `"html"` | Active reporting formatter pipeline. |
| `reporting.screenshotOn` | `"failure"`, `"always"`, `"never"` | `"failure"` | Triggers automated capture payloads back into reports. |

---

## 🩹 Self Healing & Diagnostics

| Field | Expected Values | Default | Description |
| :--- | :--- | :--- | :--- |
| `reuse.locatorOrder` | `string[]` | `["accessibility id"]`| Priority cascade used by CodeGen to pick selectors. |
| `selfHeal.confidenceThreshold` | `0.0` - `1.0` | `0.7` | Minimum fuzzy match score required to accept healed locator. |
| `selfHeal.maxCandidates` | `number` | `3` | Maximum amount of proposed locators presented during heal. |
| `selfHeal.autoApply` | `true`, `false` | `false` | If true, intelligently applies highest-ranked heal automatically based on threshold. |

**Example:**
```json
"reuse": {
  "locatorOrder": ["accessibility id", "resource-id", "xpath"]
},
"selfHeal": {
  "confidenceThreshold": 0.85,
  "maxCandidates": 3,
  "autoApply": false
}
```

---

## 🔌 Advanced Workflows: `projectExtensions` & `credentials`

These objects allow you to dynamically feed global contexts or external schema validators into the AI without typing long interactive prompts.

| Field | Expected Values | Description |
| :--- | :--- | :--- |
| `projectExtensions` | `Array<object>` | Instructs tools to auto-inject specific files (like remote config definitions) into AI prompts. Requires `name`, `description`, `path`, and `injectInto` (`generate`, `analyze`, `heal`, `run`, `check`) targets. |
| `credentials.strategy` | `"per-env-files"`, `"role-env-matrix"`, `"unified-key"`, `"custom"` | Dictates how the `manage_users` tool scaffolds typed user models securely. |
| `credentials.file` | `string` | Path override for credentials. Default: `credentials/users.json`. |
| `credentials.schemaHint` | `string` | If `"custom"` strategy is active, provide an instruction hint explaining the schema structure so the AI respects it. |

**Example:**
```json
"projectExtensions": [
  {
    "name": "A11y Dict",
    "description": "Company-wide accessibility label mappings",
    "path": "shared/a11y-dictionary.yaml",
    "format": "yaml",
    "injectInto": ["generate", "heal"],
    "required": false
  }
],
"credentials": {
  "strategy": "per-env-files",
  "file": "credentials/users.json"
}
```
