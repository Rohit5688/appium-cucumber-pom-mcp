# 🛠️ Continuous Integration & Bug Reporting

AppForge simplifies the transition from local development to production pipelines by automating workflow generation and standardizing failure reporting.

---

## 🏗️ 1. Automated Workflow Generation

### `generate_ci_workflow`
Instantly creates an optimized YAML pipeline for your CI/CD provider.

- **Supported Providers**: GitHub Actions, GitLab CI.
- **Platform Awareness**: Pre-configures Node.js, Appium server, and specific emulator/simulator boot sequences for Android or iOS.
- **Zero-Config**: Dynamically reads device profiles, execution commands, and report directories directly from your `mcp-config.json`.

**Prompt Example:**
> *"Generate a GitHub Actions workflow that runs my Android @smoke tests on every pull request using a local emulator."*

---

## 🐛 2. AI-Driven Bug Reporting

### `export_bug_report`
Generates a structured, Jira-ready Markdown bug report after a test failure.

**Included Context:**
- **Environment Details**: App version, platform, and device capability profile.
- **Error DNA**: The classified failure reason (e.g., `LocatorNotFound`) and the raw stack trace.
- **Visual Evidence**: Locations of the failed screenshot and Appium server logs.
- **Reproduction Steps**: The exact Gherkin scenario that triggered the failure.

**Prompt Example:**
> *"The 'Checkout' test failed. Use `export_bug_report` to create a ticket description including the screenshot and reproduction steps."*

---

## 🧪 3. Cloud Grid Integration

AppForge is designed for seamless integration with mobile cloud providers like **BrowserStack** or **SauceLabs**.

1.  **Credentials**: Use `manage_config(operation='set_credentials')` to store your API keys securely in the `.env` file.
2.  **Profiles**: Add a named profile in `mobile.capabilitiesProfiles` with the cloud provider's hub URL.
3.  **Active Environment**: Set `currentEnvironment` to `staging` or `prod` to auto-switch to cloud capabilities during CI runs.

---

## 📈 4. Quality Auditing

### `analyze_coverage`
Parses your existing `.feature` files to identify gaps in your test suite. It suggests new scenarios for:
- **Negative Paths**: Error handling and boundary conditions.
- **A11y Gaps**: Missing accessibility labels for TalkBack/VoiceOver.
- **Edge cases**: Network loss, interrupted sessions, and low battery scenarios.
