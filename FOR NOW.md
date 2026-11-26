# FOR NOW

Temporary changes that should be undone later. Remove an entry once it's reverted.

## AI chat (Duck.ai / "Lychee AI") is switched off
Added 2026-11-26 at the user's request ("for now make duckai not accessible").

- `src/main.js`: `const BLOCK_DUCK_AI = true;` blocks duck.ai and DuckDuckGo's chat pages (`ia=chat`, `/chat`), showing the "Lychee AI is turned off" page instead. Set it to `false` to undo.
- `src/skins/duckduckgo.css`: the "AI chat is switched off for now" block hides the Ask/Duck.ai buttons. Delete that block to undo.
- `src/pages/error.js`: the `ai-off` page can stay; it's only shown while the block is on.

Search Assist (the AI summary box on results pages) is NOT blocked.
