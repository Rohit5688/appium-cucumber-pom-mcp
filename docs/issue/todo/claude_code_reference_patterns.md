# Research: Improving AppForge with Claude Code Patterns

This document tracks how we can leverage the **Claude Code codebase** (accessed via `claude-code-explorer` MCP server) as a "Reference Library" to improve AppForge's agentic performance, reliability, and precision.

## 🎯 Goal
Improve AppForge services by mimicking high-performing agentic patterns from Anthropic's own CLI tool.

---

## 🏗️ 1. Infrastructure & Service Architecture
How can we manage complex states better?

- **Service Pooling**: Compare our `NavigationGraphService` pooling (TASK-45) with Claude Code's internal state management. 
- **Graceful Degradation**: How does Claude Code handle "unresponsive" contexts? We should implement their "Fail Soft" logic into our `SelfHealingService`.
- **Memory Management**: See how their internal `index.ts` or main control logic wires together multiple high-memory services.

## 🛠️ 2. High-Precision Tool Design
How can our tools give the agent better feedback?

- **Error Response Schemas**: Research how Claude Code tools return error objects that the LLM can *action* immediately (rather than just generic strings).
- **Output Truncation Heuristics**: Our `CHARACTER_LIMIT = 25_000` is a good start. How does Claude Code handle massive terminal outputs or long file reads? Can we adapt their "intelligent summary" approach for our UI hierarchy scans?
- **Idempotency**: Study how they ensure file writes are safe when re-running commands.

## 📝 3. Agentic Prompt Engineering 
The "Prompt-First" Rule (Universal Protocol #3).

- **"Step-by-Step" Logic**: Compare our `workflow_guide.ts` instructions with their internal slash command prompts (e.g. `/commit`, `/review`).
- **Constraint Enforcement**: How do they prevent the agent from "inventing" new dependencies? We can use these same system-prompt phrases in our `TestGenerationService`.
- **Instruction Serialization**: Claude Code is excellent at breaking down large tasks. We can study their internal prompts to improve our "State-Machine Micro-Prompting" (Phase 4).

## ✂️ 4. Surgical File Editing
Universal Protocol #10 (Diff-Based Token Editing).

- **Regex Precision**: If Claude Code uses a regex-based `Replace` or `Patch` mechanism, we can study it to make our `FileWriterService` and `validate_and_write` more robust.
- **Dependency Tracking**: How does Claude Code ensure that editing one file doesn't break imports in another? We can build a similar "Impact Analysis" service for AppForge.

---

## 🔍 Exploration Ideas (Next Steps)
1. **Tool Check**: Use `mcp_claude-code-explorer_list_tools` to see which tools handle local files.
2. **Prompt Audit**: Use `mcp_claude-code-explorer_get_command_source(commandName='review')` to see their internal system prompt for code analysis.
3. **Architecture Check**: Run `mcp_claude-code-explorer_get_architecture` to understand how they serialize agent thoughts.
