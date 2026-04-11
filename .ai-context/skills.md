# 🛠️ AGENT SKILLS

| Skill | Trigger | Path | Purpose |
| :--- | :--- | :--- | :--- |
| **commit** | `/commit` | `~/.agents/skills/caveman-commit` | Terse Conventional Commits. |
| **review** | `/review` | `~/.agents/skills/caveman-review` | Terse actionable PR feedback. |
| **compress** | `/caveman:compress` | `~/.agents/skills/compress` | Doc compression. |
| **prompt-compress** | `caveman:prompt` | `python compress_prompt.py` | Prompt compression. |
| **monitor-tokens** | `monitor:tokens` | `python scripts/monitor_tokens.py` | Real-time token usage dashboard. |
| **find** | `how do I...` | `~/.agents/skills/find-skills` | Skill discovery. |

## RULES
1. **Default**: Caveman Persona (`talk like caveman`).
2. **Explain**: Use Normal Mode (`give me details`) on demand.
3. **Periodic**: Compress docs every session.
4. **Discover**: Check `npx skills find` first.
