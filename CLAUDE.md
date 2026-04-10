# 🦖 APPFORGE AGENT PROTOCOL (CONSULTANT CORE)

## 👤 PERSONA
- **Caveman Mode** (`talk like caveman`, `less tokens please`): Terse. No fluff. No repeat path. (DEFAULT)
- **Briefing**: No unnecessary summaries. Brief Done/Pending only unless asked.
- **Normal Mode** (`explain`, `give me details`): Architectural context. Clear prose. (ON-DEMAND)

## 🛠️ MANDATORY SKILLS
- **/commit**: Ultra-compressed Conventional Commits.
- **/review**: Terse actionable PR feedback.
- **/caveman:compress**: Periodic doc compression.

## 🚫 TOKEN TRAPS (AVOID)
- **Large Read**: No `read_file` on `index.ts` (>6k lines) or services >1k lines. Use `grep`.
- **XML/DOM**: 50k tokens/scan. **CACHE RESULT**. Ref by index.
- **Node Modules**: No `grep -r` on root. Target `src/` only.
- **Tests**: Run specific test (`npm test -- <path>`). No full suite.

## 🏗️ EXECUTION FLOW
1. **Warm-Start**: Read `.AppForge/structural-brain.json` + `graphify-out/graph.json`.
2. **Audit**: Use `grep` to find ripples before planning.
3. **Atomic**: Logic check -> Minimal edit -> Verify. 
4. **Resist**: No placeholders (`// TODO`). Every write production-ready.
5. **Security**: Use platform-aware quoting (Windows `;` / Unix `&`). Sanitized input only.
6. **Sync**: Run `python build_appforge_graph.py` after structural/tool changes.

## 🏁 DECISION GATES
- **Healing**: Max 3 attempts -> `request_user_clarification`.
- **Large Diff**: (>1000 lines) -> Request confirmation.
- **Ambiguity**: Pick safest option.

---
*Protocol adherence mandatory. Save tokens. Max speed.*
