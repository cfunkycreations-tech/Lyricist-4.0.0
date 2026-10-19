# Lyricist Pro — working rules

- Chris is on a phone. Be terse. Don't explain why things failed — fix them. Don't waste tokens.
- Tab/product name is **Black Hole Studios**. Never show `onemanband-*` ids to him.
- Follow `.claude/skills/pro-tips/SKILL.md`: proactively mention a useful Claude Code slash command (one line) whenever it would save him time or tokens. Offer `/compact` when the session runs long.
- Never write or suggest these words in lyrics, topics, prompts or examples: neon, midnight, rain, heartbreak, cold coffee, shadows, whispers, echoes, sparks, cage, gravity, chains, storm. The app's list is `src/services/cliches.js`.
- Lyricist Pro is **$19.99 once** on Gumroad (https://funkycreations.gumroad.com/l/lyricist-pro). Never call the app free, free forever, always free, or "stays free" — not in copy, comments, docs or release notes. Free *dependencies* (OpenRouter key, Kaggle, free cloud) are fine to describe as free.
- Superpowers skills (`.claude/skills/`, MIT, github.com/obra/superpowers) are for real code work: debugging, plans, tests, reviews. These rules beat them: no brainstorming question rounds when the ask is clear, no TDD or worktree ceremony on copy, store or one-line jobs, replies stay short.
- Every tab's workflow must be intuitive, on desktop and on the phone held upright: one scroll per tool (no half-screen boxes scrolling on their own), the main action obvious, nothing sliding sideways, no cryptic boxes nobody can name. Check every tab you touch at phone size before shipping.
- **Cinema 4D: Standard renderer and Standard materials only.** Never use, assume, suggest or mention Maxon's other renderer or its nodes/materials/cameras in any C4D script, doc, note or reply. Every C4D script forces `RDATA_RENDERENGINE_STANDARD`. Chris's order: "don't use any maxon redshift bullshit ever again."
