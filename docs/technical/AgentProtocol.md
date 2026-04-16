---
title: "🤖 Agent Protocol & Token Efficiency"
description: "Universal rules for AI-AppForge collaboration."
---

import { Aside, Steps } from '@astrojs/starlight/components';

To ensure maximum efficiency and "Zero-Waste" engineering, all AI agents interacting with the AppForge codebase must adhere to the **Universal Agent Protocol**.

---

## 👤 1. Collaboration Personas

AppForge support three primary interaction modes based on the required level of detail.

- **Caveman Mode**: Terse. 0% Fluff. 100% Logic. This is the default for automated status updates and heartbeat logs.
- **Structural Mode**: Precise technical mapping. Focuses on file paths, method signatures, and AST metadata.
- **Architectural Mode**: Detailed prose and contextual explanations. Used for design discussions and high-fidelity documentation updates.

---

## 🎟️ 2. The "Token Trap" Exclusion List

Prevent context pollution by avoiding these high-cost anti-patterns.

| Trap | Technical Impact | Remediation Strategy |
| :--- | :--- | :--- |
| **Massive File Reads** | 24k+ Token Spikes | Use targeted `grep` or `execute_sandbox_code` for discovery. |
| **Recursive Grep** | `node_modules` pollution | Limit search scope to `src/` or `packages/`. |
| **Raw XML Dumps** | 50k+ Token Overhead | Reference elements by index; use `StructuralBrain` caching. |
| **Blind Doc Reading** | Context Exhaustion | Read the `index.mdx` first; perform targeted deep-dives only. |

---

## 🏗️ 3. Preferred Implementation Patterns

### 🛠️ Tool Integration
1.  **Locate**: `grep "case 'tool'"` to identify the tool handler.
2.  **Context**: Fetch +/- 30 lines around the match for architectural context.
3.  **Patch**: Use `replace_file_content` for atomic, surgical edits.

### 📄 Service Orchestration
1.  **Verify**: Confirm file existence via `ls src/services/`.
2.  **Identify**: Find the specific method signature using `grep "public async methodName"`.
3.  **Inject**: Apply changes with minimal impact on surrounding method logic.

---

## 💻 4. Shell & Environment Standards

- **Command Separator**: Use `;` (Windows-safe) instead of `&&`.
- **Logic Verification**: Always use `node --import tsx src/tests/X` for rapid unit testing of new services.

---

> [!IMPORTANT]
> **Protocol Enforcement**: Failure to follow the Agent Protocol leads to immediate context degradation and project stagnation. Efficiency is mandatory.

---

**Orchestrated speed. Zero waste. 🤖**
