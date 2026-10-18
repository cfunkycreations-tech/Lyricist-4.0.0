---
name: pro-tips
description: Proactively tell Chris about Claude Code slash commands and features that would speed up Lyricist Pro work. Use at session start, after long stretches of work, when context is getting big, when a task repeats, or whenever a command would save him time or tokens.
---

# Pro Tips

Chris builds Lyricist Pro from his phone. He doesn't know most Claude Code commands exist. Your job: speak up, ONE line, the moment a command would help. Never lecture. Never explain why. Name the command and what it does for him right now.

## Format

`Tip: /command — what it does for you now.` One line. Max one tip per reply. Skip if he already used it this session or said no.

## Trigger → tip

| Situation | Tip |
|---|---|
| Long session, lots of back and forth | `/compact` — shrinks the chat so I keep working without losing the thread. He can't see context on mobile, so offer this on his behalf. |
| Switching to a totally new task | `/clear` — fresh start, zero stale baggage. |
| He wonders about usage, cost or limits | `/usage` — shows where the limits are going. |
| Context getting heavy | `/context` — shows what is eating the window. |
| Hard design or multi-file change | `/plan` — I plan first, he approves, then I build. |
| Wrong turn or bad edit | `/rewind` — roll the chat and files back to an earlier point. |
| Coming back to old work | `/resume` — reopen a previous session. |
| Quality matters (releases, big PRs) | `/review` and `/security-review` — second pair of eyes on the diff. |
| Wants a stronger second opinion | `/advisor` — a bigger model checks my work. |
| Token burn too high | `/model` — pick a cheaper or stronger model per task; `/fast` for quicker output. |
| Same instructions repeated 2+ times | Save them as a skill (like this one) or in CLAUDE.md; `/memory` edits CLAUDE.md. |
| Repeating task on a timer (check PR, check CI) | `/loop` or `/schedule` — runs it for him on a schedule. |
| Big search/research across the repo | `/agents` — hand it to a sub-agent so the main chat stays small. |
| External tool wanted (GitHub, Modal, etc.) | `/mcp` — connect or check connectors. |
| Annoying permission prompts | `/permissions` — pre-approve safe commands. |
| Something feels broken in Claude Code itself | `/doctor` — diagnoses the install. |
| Wants to save a conversation | `/export` — dumps the chat to a file. |
| Working across two folders | `/add-dir` — lets me see another folder. |
| Wants to know what exists | `/help`, and `/skills` to list skills. |

## Rules

- Be proactive: don't wait for him to ask what's available.
- If unsure a command still exists or what it's called now, check with the `claude-code-guide` agent before telling him. Don't guess.
- On a fresh session's first reply, give the single most useful tip for the task at hand.
- Same tip never twice in a session.
- Profanity from him is normal. Stay short. No apologies, no explaining failures.
- Update the table when he discovers a command that belongs here.
