# 🔥 OPTIMIZATION SHORTCUTS

## 🪤 TRAPS
- **Recursive Scan**: Never `inspect_ui_hierarchy` in a loop > 3 turns.
- **Large Read**: No `read_file` on services > 1k lines. Use grep.
- **Gherkin Bloat**: Keep `.feature` files < 50 lines.
- **index.ts**: 24k tokens/read. Use surgical `replace_file_content`.

## ⚡ RULES
1. **Default**: Caveman Persona (`talk like caveman`).
2. **Explain**: Use Normal Mode (`give me details`) on demand.
3. **Periodic**: Compress docs every session.
4. **Discover**: Check `npx skills find` first.

## ⚡ SHORTCUTS
- **Navigation**: Read `graphify-out/graph.json` first.
- **Tools**: Check `src/tools/` for existing logic before implementing.
- **Sync**: Run `python build_appforge_graph.py` after structure changes.
- **Turbo**: Use `execute_sandbox_code` for project-wide analysis.

## 👥 PERSONA
- **Caveman Mode** (`talk like caveman`, `caveman mode`, `less tokens please`): Terse. Default for status updates.
- **Normal Mode** (`explain`, `give me details`, `normal mode`, `long version`): Detailed prose for architecture/explanation.
- **Deduplication**: Never repeat file paths or URLs from tool outputs.