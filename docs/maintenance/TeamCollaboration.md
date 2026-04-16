---
title: "🤝 Team Collaboration & Governance"
description: "Orchestrating quality across complex engineering organizations."
---

import { Steps, Aside, Card, CardGrid, Badge } from '@astrojs/starlight/components';

Documentation and automation are team sports. AppForge provides the governance structure required to scale mobile quality assurance across multiple squads without technical debt.

<div class="hero-bg-accent"></div>

---

## 🏛️ 1. Unified Page Object Governance

In large teams, the biggest risk is "Locator Rot" caused by duplicate Page Objects. AppForge mitigates this through architectural centralization.

- **The Source of Truth**: All teams contribute to a shared `pages/` directory. 
- **Peer Review DNA**: Use the `export_team_knowledge` tool to generate high-fidelity summaries of existing rules before a new feature is started.

<details>
<summary>Technical Specs: Shared Rule Schema</summary>
When a squad 'trains' the AI on a new pattern, the fix is exported to a shared JSON schema that other squad agents can ingest.

```json
{
  "ruleId": "sso_handle_2024",
  "pattern": "login_screen > sso_button",
  "solution": "Wait for activity: 'com.identity.AuthActivity'"
}
```
</details>

- **Contract Enforcement**: Every Page Object must extend the central `BasePage`. This ensures that global changes (like a new driver capability) are instantly inherited by every squad.

---

## 🧠 2. The Global Knowledge Base

Capture and externalize "Tribal Knowledge" into digital DNA.

<CardGrid stagger>
    <Card title="Pattern Repository" icon="random">
        Use `train_on_example` to store specific project patterns (e.g., how to handle your custom SSO login) into the shared `StructuralBrain`.
    </Card>
    <Card title="Automation Onboarding" icon="setting">
        New team members run `analyze_codebase` on Day 1 to receive an instant, AI-driven map of the entire automation infrastructure.
    </Card>
    <Card title="Rule Consistency" icon="shield-check">
        `mcp-config.json` acts as the Governance Document, defining mandatory linting, locator strategies, and security boundaries.
    </Card>
</CardGrid>

---

## 🚀 3. Operational Protocols

Standardized workflows for high-velocity teams.

1.  **Peer-Review Protocol**: Use `analyze_codebase` during PR reviews to verify that new code uses existing utilities instead of creating redundant wrappers.
2.  **Healing Audit**: Monthly review of `healing_logic` logs to identify frequent UI breakpoints that should be addressed by the development team.
3.  **Credential Safety**: Strictly enforce `.env` usage via `set_credentials` to prevent security leaks in shared repositories.

---

## 🧠 4. Collaboration Knowledge Audit

<details>
<summary>**Q1: How do we prevent different squads from breaking each other's tests?**</summary>
**Answer**: Through the **Shared BasePage**. Any change to a core element is fixed in one place. By running the `@smoke` suite on every PR, squads get instant feedback if their changes impact global flows.
</details>

<details>
<summary>**Q2: Can we export our 'Learned Rules' to other projects?**</summary>
**Pro Hint**: Yes. The `.AppForge/mcp-learning.json` file can be shared across similar application repositories to "Warm-Start" the AI's understanding of your organization's coding standards.
</details>

---

:::tip[Master-Level Tip]
Treat your automation code with the same respect as your production app. Use the **Page Object Model** not just as a pattern, but as a contract between teams.
:::

---

**Orchestrate your team. 🤝**
