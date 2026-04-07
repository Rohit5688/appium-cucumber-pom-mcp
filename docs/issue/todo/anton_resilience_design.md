# Technical Spec: Anton Resilience & Stateful Healing

This document outlines the "Anton-Style" resilience patterns to be integrated into the AppForge framework.

## 1. Stateful Sandbox (Persistent Execution)
Currently, `SandboxEngine.ts` is stateless (each execution is a new context). We will transition to a **Persistent Context** model.

### 🔧 Native Implementation
- **Worker Registry**: A singleton that maps `sessionId` to a running `worker_thread`.
- **Notebook State**: Variables, imports, and function definitions persist between `execute_sandbox_code` calls.
- **Lifecycle**: Contexts are automatically destroyed after 10 minutes of inactivity or upon session closure.

---

## 2. The "3-Strike" Healing Loop (Multi-Path Fallback)
When `SelfHealingService` detects a broken locator, it will no longer suggest a single fix. It will execute a background trial loop:

1. **Path A (Preferred)**: Try the first candidate fix (e.g., Accessibility ID).
2. **Path B (Contextual)**: If Path A fails, try a text-match / fuzzy strategy inside the sandbox.
3. **Path C (Structural)**: If Path B fails, use a full XPath/Tree traversal.

**Outcome**: The user is only presented with the **Verified Path**.

---

## 3. Incremental Clarification Protocol
Ported from Anton's `prompts.py`, this protocol prevents the AI from "Guess-Coding."

### 📝 Guidelines
- **Ambiguity Detection**: Compare the user's natural language (e.g. "click the login button") with the structural brain.
- **Query Turn**: If >1 matching element exists, or if the element is missing, return a `CLARIFICATION_REQUIRED` code.
- **Constraint**: Ask exactly **1–3 targeted questions**. Do NOT dump a list of 20 questions.

---

## 4. Post-Task "Learning" Extraction
Every successful task must conclude with a "Knowledge Extraction" step.
- **Action**: The `LearningService` scans the task logs for "Gotchas."
- **Storage**: Append reusable lessons to `.AppForge/learning-registry.json`.
- **Example**: "Field 'Username' on Samsung S24 requires a 500ms delay after typing."
