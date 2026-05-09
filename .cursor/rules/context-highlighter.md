# Context Highlighter — Cursor Rules

These rules apply to all agents running in this workspace.

## Knowledge Base

This project includes a personal knowledge base of highlights captured from the web, documents, and other tools. Before running any task, check if a relevant context feed exists.

## Agent Feeds

- **Chief of Staff**: `highlights/by-agent/cos.md`

Always read the relevant agent feed before executing a task. Reference specific highlights in your output where relevant.

## File Conventions

- Highlights are markdown files — never modify them directly, they are append-only
- Agent definitions live in `agents/` — read these to understand the agent's role
- Templates live in `templates/` — use these as the basis for structured outputs

## Output Style

- Be concise and scannable
- Group by theme where possible
- Flag time-sensitive items clearly
- Reference source highlights when making recommendations
