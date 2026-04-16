# 🚀 Token Optimizer (Turbo Mode)

The Token Optimizer (`execute_sandbox_code`) allows the AI to run JavaScript snippets inside a secure V8 sandbox on the MCP server, reducing token consumption by up to 98% for large-scale codebase analysis.

---

## 🌩️ Technical Architecture

Instead of the LLM requesting massive JSON payloads (like full codebase hierarchies), it writes a targeted script that runs locally. The script processes the data on your machine and returns only the relevant snippet or metric.

### Data Flow Comparison

| Operation | Classic Mode (tokens) | Turbo Mode (tokens) | Savings |
| :--- | :--- | :--- | :--- |
| Count step definitions | ~8,000 | ~100 | **98.7%** |
| Extract config keys | ~2,000 | ~80 | **96%** |
| Filter log files | ~5,000 | ~150 | **97%** |

---

## 🛠️ Sandbox API Reference

Scripts have access to the `forge.api` object, which provides non-blocking access to the project:

| Method | Returns | Description |
| :--- | :--- | :--- |
| `forge.api.analyzeCodebase(root)` | `Object` | AST analysis of steps and pages. |
| `forge.api.listFiles(root, glob)` | `string[]`| **[NEW]** Fast file listing. |
| `forge.api.searchFiles(root, pattern)`| `Object[]` | **[NEW]** Fast regex search across files. |
| `forge.api.parseAST(filePath)` | `Object` | **[NEW]** Direct morph-analysis of a single file. |
| `forge.api.getConfig(root)` | `Object` | Parsed `mcp-config.json`. |
| `forge.api.readFile(filePath)` | `string` | Safe data read. |

---

## 🔒 Security Model

The sandbox isolates execution inside a hardened Node.js `vm.Script` context:

- **Resource Limits**: 10-second hard timeout; 128MB memory cap.
- **Context Isolation**: No access to `globalThis`, `process`, or `require`.
- **Stateless**: Every call creates a fresh V8 context; no state leaks between requests.
- **Path Guard**: Filesystem access is strictly limited to the `projectRoot` declared in `mcp-config.json`.

---

## 💡 Example: Finding "God Nodes"

The AI can find highly-complex files without reading them:

```javascript
const files = await forge.api.listFiles('.', '**/*.ts');
const results = [];
for (const file of files) {
  const ast = await forge.api.parseAST(file);
  if (ast.methodCount > 20) {
    results.push({ file, count: ast.methodCount });
  }
}
return results; // Only returns the list of complex files.
```
