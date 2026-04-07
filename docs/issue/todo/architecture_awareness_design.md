<!-- review and think practically and logically the need of requirement, focus on reusability to achieve what is intended rather than trying to create everything from scratch -->

# 🏛️ Native Architectural Design: Structural Awareness & Outcome-Based Logic


**Status**: PROPOSAL / DESIGN PHASE  
**Context**: This document specifies how to re-implement the core logic of "Graphify" and "Anton" as native, dependency-free features within **AppForge** and **TestForge**.

---

## 1. The "Structural Brain" (Graphify Logic)
The goal is to move from "Discovery-on-Demand" to "Pre-flight AI Awareness."

### 🔧 Native Implementation
- **AST Mapping Service**: Re-use the existing `ts-morph` within `CodebaseAnalyzerService` to build a global dependency map.
- **God Node Scoring**: Calculate "Degree Centrality" (which files are the most-connected hubs). 
- **Persistence**: Store the map as a lightning-fast JSON in `.AppForge/structural-brain.json`.
- **Pre-flight Injection**: When an AI task starts (e.g. `generate_test`), the MCP server automatically reads this map and injects a "God Node Warning" or "Architectural Map" into the LLM's system prompt.

### 📈 Metrics to Re-implement
| Metric | Description | Value for User |
|--------|-------------|----------------|
| **Centrality** | How many other parts of the app depend on this file? | Identify files that are "too big to fail." |
| **Cohesion** | Ratio of Page Object methods vs. unique locators used. | Identify "Junk Drawer" files that need refactoring. |
| **Clusters** | Groupings of services based on import proximity. | Understand functional domains without reading code. |

---

1.  **XML Context**: Capture the live device's XML hierarchy. (Think about token and context size)
2.  **Structural Context**: Read the `structural-brain.json`.
3.  **Conflict Check**: If the user's Gherkin says "Accept Terms" but the XML shows only a "Cancel" button, the AI flags the requirement as "Robustness Failure" before it wastes tokens coding.

---

## 3. Aesthetic & Execution Strategy
- **Visibility**: Analysis results are the primary focus. Live screen execution during "Scratchpad" trials is an optional toggle (defaulting to "Background" for token efficiency).
- **Tool Awareness**: Every AppForge tool will be "Self-Aware" of the structural brain. If a tool is called on a "God Node", it will automatically provide a warning: *"Warning: You are modifying a fundamental project hub."*

---
*Created by Antigravity AI Assistant*
