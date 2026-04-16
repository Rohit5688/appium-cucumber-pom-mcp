---
title: "🚚 Migration Strategy"
description: "Modernizing legacy automation suites with AppForge AI."
---

import { Steps, Aside, Tabs, TabItem, Card, CardGrid, Badge } from '@astrojs/starlight/components';

Transitioning from legacy frameworks to a modern, AI-powered stack is an **Architectural Upgrade**. This guide outlines how to leverage AppForge for the seamless migration of existing native mobile tests.

<div class="hero-bg-accent"></div>

---

## 🏗️ 1. Supported Source Frameworks

AppForge provides high-fidelity semantic translation for the following industry-standard environments:

| Source | Language | Driver Type |
| :--- | :--- | :--- |
| **Espresso** | Java / Kotlin | Native Android |
| **XCUITest** | Swift | Native iOS |
| **Detox** | JavaScript | React Native |

---

## 🏗️ 2. The Migration Workflow

Migration is not a simple copy-paste operation; it is an intelligent refactoring into a unified Page Object Model (POM).

<Steps>

1.  ### Source Ingestion
    Point the `migrate_test` tool to your legacy source code files.
2.  ### Semantic Translation
    AppForge identifies legacy locators (e.g., `withId()`, `accessibilityElement()`) and maps them to modern, resilient Appium strategies.
3.  ### Architectural Refactoring
    The engine encapsulates the migrated logic into a new Page Object class that inherits from `BasePage`, ensuring structural consistency.
4.  ### BDD Layering
    Shared Gherkin scenarios are drafted to wrap the code, providing human-readable oversight for the first time.

</Steps>

---

## 📑 3. Translation Parity (Side-by-Side)

Witness the transformation from legacy native code to orchestrated AppForge logic.

<Tabs>
  <TabItem label="Legacy Espresso (Java)">
    ```java
    onView(withId(R.id.email))
        .perform(typeText("user@example.com"));
    onView(withId(R.id.login_btn))
        .perform(click());
    ```
  </TabItem>
  <TabItem label="AppForge POM (TypeScript)">
    ```typescript
    // pages/LoginPage.ts
    async login(email: string) {
        await this.emailInput.setValue(email);
        await this.loginButton.click();
    }
    ```
  </TabItem>
  <TabItem label="Gherkin Spec">
    ```gherkin
    Scenario: User Account Login
      When I login with "user@example.com"
      Then I should see the "Dashboard"
    ```
  </TabItem>
</Tabs>

---

## 🧪 4. Why Migrate?

- **Zero-Maintenance Locators**: Migrated tests immediately benefit from **Atomic Self-Healing**.
- **Consolidated Codebase**: Separate Espresso and XCUITest logic can be unified into a single BDD suite for 50% less maintenance.
- **Agent Readiness**: Migrated code is optimized for AI consumption, enabling autonomous maintenance and generation features.

---

## 🧠 5. Migration Knowledge Audit

<details>
<summary>**Q1: Does AppForge support custom Espresso matchers?**</summary>
**Answer**: Yes. The semantic engine can often infer the intent of custom matchers. For complex cases, we recommend a manual audit of the generated Page Object to ensure the functional intent is preserved.
</details>

<details>
<summary>**Q2: How do I handle native system alerts during migration?**</summary>
**Pro Hint**: AppForge's `BasePage` includes cross-platform handlers for native alert interception. These will be automatically injected into your migrated Page Objects where necessary.
</details>

---

:::note[Architect's Tip]
Migration is the perfect time to audit your Accessibility implementation. If AppForge struggles to find a stable locator during migration, it's a signal to add a proper `accessibility id` to the source app.
:::

---

**Modernize your legacy. Orchestrate your future. 🚚**
