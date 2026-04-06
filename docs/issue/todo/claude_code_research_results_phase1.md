# Research Results: Claude Code Pattern Study (Phase 1)

This document detailed the technical findings from exploring the Claude Code (`claude-code-explorer`) repository. These patterns are targeted for porting into AppForge to improve agentic reliability.

---

## 🏗️ Technical Finding: The "Atomic Read-Modify-Write" Loop
**Source**: `src/tools/FileEditTool/FileEditTool.ts`

Claude Code uses a "state-aware" loop to prevent the agent from writing to files that have changed on disk, which is a major source of "brain-fog" and regressions in AppForge.

### 1. Read-State Tracking (`readFileState` Map)
*   **Pattern**: A global or session-scoped Map stores: `filePath -> { content, timestamp, isPartialView }`.
*   **Logic**: Before any write/edit, the tool calls `fs.stat` and compares the on-disk `lastWriteTime` with the stored `readTimestamp.timestamp`.
*   **Benefit**: If an external process (e.g. `npm run lint --fix`) changes a Page Object, AppForge won't blindly overwrite it. 
*   **AppForge Action**: Implement a `FileStateService` to track read/write timestamps across all tools.

### 2. High-Precision Matching (`findActualString`)
*   **Pattern**: They don't do a strict `text.includes(old_string)`. Instead, they use a utility that handles "Quote Normalization" and whitespace differences.
*   **Logic**: It treats `'` and `"` as equivalent if the surrounding context matches.
*   **Benefit**: Reduces "String not found" errors when an LLM flips between single and double quotes in a `.feature` or `.ts` file. 
*   **AppForge Action**: Update `replace_file_content` to use a regex-based "fuzzy-quote" matcher.

---

## 🛠️ Tool Design: Predictive UX & Error Remediation
**Source**: `src/Tool.ts` & `src/utils/file.ts`

### 1. Similar File Suggestions (`findSimilarFile`)
*   **Pattern**: If a file is not found (ENOENT), the tool doesn't just error. It searches the CWD for files with similar names but different extensions (e.g. `.ts` vs `.js`). 
*   **Logic**: `suggestPathUnderCwd(fullFilePath)` is called during `validateInput`.
*   **Benefit**: If an agent tries to edit `LoginPage.js` but the project uses `.ts`, it gets a helpful "Did you mean LoginPage.ts?" hint.
*   **AppForge Action**: Add a "fuzzy-searcher" to the error handler of all file-aware tools.

### 2. LSP & IDE Notification Sync
*   **Pattern**: Explicit tool calls to `LSPDiagnosticRegistry` and `notifyVscodeFileUpdated`.
*   **Logic**: After a write, the tool "clears delivered diagnostics" for that URI.
*   **Benefit**: Forces the editor to re-lint immediately, giving the agent faster feedback on syntax errors.
*   **AppForge Action**: Integrate with the user's VS Code environment (via the MCP session) to trigger a refresh after `generate_cucumber_pom`.

---

## 🚀 Priority Action Items for AppForge

| Action Item | Target Component | Effort |
| :--- | :--- | :--- |
| **Implement `FileStateTracker`** | `FileWriterService.ts` | Medium |
| **Add "Did you mean?" logic** | `ErrorHandler.ts` | Small |
| **Fuzzy-Quote Matcher** | `replace_file_content` tool | Small |
| **Auto-Directory Creation** | `FileWriteTool.ts` | Tiny |

---

## Next Exploration Targets
- `QueryEngine.ts`: Study how they stream logs and handle interactive tool loops.
- `/review` command: Extract their internal system prompt for code audits.
- `coordinator/`: See how they orchestrate multiple sub-agents.
