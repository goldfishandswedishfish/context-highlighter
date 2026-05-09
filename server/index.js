// Context Highlighter — Local Sync Server
// Runs on localhost:3747, bridges Chrome extension to ~/context-highlighter

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3747;
const BASE = path.join(__dirname, "..");

// ── Helpers ───────────────────────────────────────────

function ensureFile(filePath, defaultContent = "") {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultContent, "utf8");
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatHighlightBlock(highlight) {
  const date = new Date(highlight.createdAt).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });
  return [
    `## ${date}`,
    `**Theme:** ${highlight.theme || "Untagged"}`,
    highlight.agent ? `**Agent:** ${highlight.agent}` : null,
    `**Source:** ${highlight.url || "Unknown"}`,
    ``,
    `> ${highlight.text.replace(/\n/g, "\n> ")}`,
    ``,
    highlight.note ? `**Note:** ${highlight.note}\n` : null,
    `---\n`
  ].filter(Boolean).join("\n");
}

function appendHighlight(filePath, highlight, defaultHeader) {
  ensureFile(filePath, defaultHeader);
  const block = formatHighlightBlock(highlight);
  const content = fs.readFileSync(filePath, "utf8");
  // Insert after the comment marker
  const marker = "<!-- highlights will be appended here by the sync server -->";
  if (content.includes(marker)) {
    fs.writeFileSync(filePath, content.replace(marker, marker + "\n\n" + block), "utf8");
  } else {
    fs.appendFileSync(filePath, "\n" + block, "utf8");
  }
}

function saveHighlight(highlight) {
  const theme = highlight.theme || "Untagged";
  const themeSlug = slugify(theme);

  // 1. Write to by-theme
  const themePath = path.join(BASE, "highlights", "by-theme", `${themeSlug}.md`);
  appendHighlight(themePath, highlight,
    `# ${theme}\n\nHighlights tagged with this theme.\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`
  );

  // 2. Write to by-agent if tagged
  if (highlight.agent) {
    const agentSlug = slugify(highlight.agent);
    const agentPath = path.join(BASE, "highlights", "by-agent", `${agentSlug}.md`);
    appendHighlight(agentPath, highlight,
      `# ${highlight.agent} — Context Feed\n\nHighlights routed to this agent.\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`
    );
  }

  // 3. Append to master index
  const indexPath = path.join(BASE, "highlights", "index.md");
  ensureFile(indexPath, `# All Highlights\n\n_Master index, most recent first._\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`);
  appendHighlight(indexPath, highlight, "");

  return { success: true };
}

function getAllHighlights() {
  const indexPath = path.join(BASE, "highlights", "index.md");
  if (!fs.existsSync(indexPath)) return [];
  // Return raw markdown — the extension can parse or display as-is
  return fs.readFileSync(indexPath, "utf8");
}

function getThemes() {
  const themeDir = path.join(BASE, "highlights", "by-theme");
  if (!fs.existsSync(themeDir)) return [];
  return fs.readdirSync(themeDir)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(".md", ""));
}

function getAgents() {
  const agentDir = path.join(BASE, "agents");
  if (!fs.existsSync(agentDir)) return [];
  return fs.readdirSync(agentDir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const slug = f.replace(".md", "");
      const content = fs.readFileSync(path.join(agentDir, f), "utf8");
      const nameMatch = content.match(/^# (.+)/m);
      return { slug, name: nameMatch ? nameMatch[1] : slug };
    });
}

// ── Server ────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS — allow Chrome extension
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /agents — list available agents
  if (req.method === "GET" && url.pathname === "/agents") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getAgents()));
    return;
  }

  // GET /themes — list existing themes
  if (req.method === "GET" && url.pathname === "/themes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getThemes()));
    return;
  }

  // GET /highlights — return index
  if (req.method === "GET" && url.pathname === "/highlights") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(getAllHighlights());
    return;
  }

  // POST /highlight — save a new highlight
  if (req.method === "POST" && url.pathname === "/highlight") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const highlight = JSON.parse(body);
        highlight.createdAt = highlight.createdAt || new Date().toISOString();
        const result = saveHighlight(highlight);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /ping — health check
  if (req.method === "GET" && url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", base: BASE }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✦ Context Highlighter server running`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Knowledge base: ${BASE}\n`);
});
