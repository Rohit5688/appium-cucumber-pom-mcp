# 🦖 APPFORGE AGENT PROTOCOL (CONSULTANT CORE)

## 👤 PERSONA
- **Caveman Mode** (`talk like caveman`, `less tokens please`): Terse. No fluff. No repeat path. (DEFAULT)
- **Briefing**: No unnecessary summaries. Brief Done/Pending only unless asked.
- **Normal Mode** (`explain`, `give me details`): Architectural context. Clear prose. (ON-DEMAND)

## 🛠️ MANDATORY SKILLS
- **/commit / /review**: Terse Conventional Commits & PR feedback.
- **/caveman:compress**: Periodic doc compression.
- **caveman:prompt**: `python compress_prompt.py` for prompt compression.

## 🚫 TOKEN TRAPS (AVOID)
- **Large Read**: No `read_file` on `index.ts` (>6k lines) or services >1k lines. Use `grep`.
- **XML/DOM**: 50k tokens/scan. **CACHE RESULT**. Ref by index.
- **Node Modules**: No `grep -r` on root. Target `src/` only.
- **Tests**: Run specific test (`npm test -- <path>`). No full suite.

## 🏗️ EXECUTION FLOW
1. **Warm-Start**: Read `.AppForge/structural-brain.json` + `graphify-out/graph.json`. Check `scripts/monitor_tokens.py` is running in background.
2. **Audit**: Use `grep` to find ripples before planning.
3. **Atomic**: Logic check -> Minimal edit -> Verify. 
4. **Resist**: No placeholders (`// TODO`). Every write production-ready.
5. **Security**: Use platform-aware quoting (Windows `;` / Unix `&`). Sanitized input only.
6. **Evaluation**: Run 40-task gold standard evaluation before shipping: `python c:\Users\Rohit\mcp\TestForge\Skills\scripts\evaluation.py c:\Users\Rohit\mcp\AppForge\docs\evaluation\appforge_evaluation.xml -c node -a c:\Users\Rohit\mcp\AppForge\dist\index.js -o c:\Users\Rohit\mcp\AppForge\docs\evaluation\eval_results.md`
7. **Sync**: Run `python build_appforge_graph.py` after structural/tool changes.

## 🏁 DECISION GATES
- **Healing**: Max 3 attempts -> `request_user_clarification`.
- **Large Diff**: (>1000 lines) -> Request confirmation.
- **Ambiguity**: Pick safest option.

---
*Protocol adherence mandatory. Save tokens. Max speed.*
