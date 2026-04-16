---
title: "📐 Core Architecture"
description: "Inside the AppForge orchestration engine."
---

import { Steps, Aside, Card, CardGrid, Badge } from '@astrojs/starlight/components';

AppForge is designed as a **High-Fidelity Orchestration Layer** that sits between AI agents and the underlying mobile automation infrastructure. This guide explores the internal mechanics and structural boundaries of the platform.

<div class="hero-bg-accent"></div>

---

## 🏗️ 1. The Orchestration Loop

The platform follows a strict "Observe-Think-Act" loop, ensuring that the AI agent always has a deterministic vision of the application state.

![AppForge Master Orchestration](../../../../assets/master_orchestration_2d.png)

### Architectural Phases
1.  **Extraction**: Live UI hierarchies (XML) and codebase structures are extracted with AST-awareness.
2.  **Synthesis**: Data is refined in the local V8 sandbox, removing noise and preserving semantic meaning.
3.  **Instruction**: Instructs the agent via standardized tool contracts (`MacroToolInput`).

<details>
<summary>Technical Specs: MacroToolInput Contract</summary>
The `MacroToolInput` object is the unified data schema that allows any compatible LLM to drive AppForge tools without custom prompt engineering.

```typescript
export interface MacroToolInput {
  operation: "click" | "input" | "scroll" | "wait";
  params: Record<string, any>;
  metadata: {
    screen: string;
    timestamp: number;
  };
}
```
</details>

4.  **Verification**: Every action (click, swipe, code-write) is verified against the live state before the loop completes.

---

## 🏛️ 2. Internal Module Boundaries

AppForge is built as a modular ecosystem, allowing for independent scaling of drivers, logic engines, and UI controllers.

![AppForge Internal Modules](../../../../assets/internal_modules_2d.png)

<CardGrid stagger>
    <Card title="Structural Brain" icon="random">
        The central intelligence hub. Manages the project map, learning patterns, and fuzzy-matching logic for self-healing.
    </Card>
    <Card title="Mobile Drivers" icon="setting">
        High-level abstraction of W3C Actions. Seamlessly handles Android (UiAutomator2) and iOS (XCUITest) complexity.
    </Card>
    <Card title="Sandbox Engine" icon="shield-check">
        Isolated V8 environment for secure code execution and heavy data processing.
    </Card>
    <Card title="Protocol Layer" icon="document">
        Implements the Model Context Protocol (MCP), providing the standardized interface for AI assistants.
    </Card>
</CardGrid>

---

## 📐 3. Data Sovereignty & Security

AppForge maintains a strict **Local-First** philosophy.

- **Vaulting**: Credentials and API keys are stored in a local `.env` vault and never shared with the AI.
- **Pruning**: Only anonymized, functional summaries of the application state are transmitted to the LLM.

<Aside type="caution" title="Data Boundary">
```json
// Example of Pruned XML Payload (Semantic Only)
{
  "elements": [
    { "id": "login_btn", "type": "Button", "text": "SIGN IN" },
    { "id": "user_input", "type": "EditText", "hint": "Email" }
  ]
}
```
</Aside>

- **Auditing**: Every tool call and response is logged locally for human review and compliance auditing.

---

## 🧠 4. Architectural Knowledge Audit

<details>
<summary>**Q1: Why use an MCP server instead of a direct API?**</summary>
**Answer**: MCP provides a standardized, discoverable interface for AI agents. It allows the tools (Inspect, Heal, Write) to be presented as core "capabilities" to the model, rather than just raw endpoints.
</details>

<details>
<summary>**Q2: How does AppForge handle multi-threading?**</summary>
**Master Hint**: AppForge orchestrates sessions. While Appium is generally single-threaded per session, AppForge can manage multiple parallel sessions across different device profiles concurrently.
</details>

---

:::tip[Architect's Goal]
The goal of this architecture is to minimize "Groundhog Day" engineering. By maintaining a persistent **Structural Brain**, we ensure the AI learns from every failure and repair cycles.
:::

---

**Orchestrate your architecture. 📐**
