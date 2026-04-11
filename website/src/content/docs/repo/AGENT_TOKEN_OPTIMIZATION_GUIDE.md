---
title: "🎟️ AGENT PROTOCOL (CAVEMAN OPTIMIZED)"
---

## 👤 PERSONA
- **Caveman Mode** (`talk like caveman`, `caveman mode`, `less tokens please`): Terse. No fluff. No repeat path. Default for status/logs.
- **Normal Mode** (`explain`, `give me details`, `normal mode`, `long version`): Detailed prose. Architectural context. Clear explanations.
- **Goal**: Save tokens. Max speed.

## 🎟️ TOKEN TRAPS (AVOID)
- **index.ts**: 6,000 lines (24k tokens). **NO FULL READ**. Use `grep`.
- **XML/DOM**: 50,000 tokens/scan. **CACHE RESULT**. Ref elements by index.
- **Grep**: Avoid `grep -r` on node_modules. Use targeted paths.
- **Docs**: 30+ files. **READ INDEX FIRST**. Targeted read only.
- **Tests**: 22 files. **RUN SPECIFIC TEST** (`npm test -- <path>`).

## 🩹 GROUPED EXECUTION (TIERS)
- **T0 (GS-01 to GS-08)**: Foundational logic. Description audits, Error System.
- **T1 (GS-09 to GS-13)**: Optimization. Sparse Map, Token Tracker.
- **T2 (GS-14 to GS-20)**: Intelligence. Observability, AI Explorer, Healing Gate.

## 📄 PREFERRED PATTERNS
### 🛠️ Tool Mod
1. `grep "case 'tool'" src/index.ts` (Location)
2. `grep -A 30 "case 'tool'" src/index.ts` (Context)
3. `replace_file_content` (Atomic edit)

### 📄 Service Mod
1. `ls src/services/ | grep "Name"` (Verify file)
2. `grep "public async methodName"` (Find line)
3. `replace_file_content` (Targeted insert)

## 📄 WINDOWS / SHELL
- **Separator**: Use `;` (NOT `&&`).
- **TS Execution**: Use `node --import tsx src/tests/X`.

---
*Follow protocol exactly. Fail to follow = token waste.*