# Context Highlighter — Knowledge Base

A personal knowledge layer that captures highlights from anywhere, organizes them thematically, and feeds context to AI agents.

## How It Works

1. **Capture** — Use the Chrome extension to highlight text on any webpage. Tag it with a theme and optionally route it to an agent.
2. **Organize** — Highlights are written as markdown files, grouped by theme and by agent.
3. **Agent context** — Each agent has a dedicated feed file it reads before running tasks.

## Folder Structure

```
context-highlighter/
  highlights/
    by-theme/        ← highlights grouped by topic (e.g. Key Concepts.md)
    by-agent/        ← highlights routed to specific agents
      cos.md         ← Chief of Staff feed
  agents/
    cos.md           ← Chief of Staff definition & instructions
  templates/
    weekly-report.md ← reusable task templates
  .cursor/rules/     ← Cursor picks these up automatically
  server/
    index.js         ← local sync server (Chrome extension bridge)
```

## Adding a New Agent

1. Create `agents/<name>.md` with the agent's role and instructions
2. Create `highlights/by-agent/<name>.md` as its feed file
3. Add it as an option in the Chrome extension

## Running the Sync Server

```bash
cd server
npm install
node index.js
```

The server runs on `localhost:3747` and is the bridge between the Chrome extension and this filesystem.
