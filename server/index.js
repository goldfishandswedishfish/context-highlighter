// Context Highlighter — Local Sync Server
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3747;
const BASE = path.join(__dirname, "..");

let highlightStore = [];
const storePath = path.join(BASE, "highlights", "store.json");

function loadStore() {
  try {
    if (fs.existsSync(storePath)) highlightStore = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch { highlightStore = []; }
}

function saveStore() {
  fs.writeFileSync(storePath, JSON.stringify(highlightStore, null, 2), "utf8");
}

function ensureFile(filePath, defaultContent = "") {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, defaultContent, "utf8");
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function formatHighlightBlock(h) {
  const date = new Date(h.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  return [`## ${date}`, `**Theme:** ${h.theme || "Untagged"}`, h.agent ? `**Agent:** ${h.agent}` : null, `**Source:** ${h.url || "Unknown"}`, ``, `> ${h.text.replace(/\n/g, "\n> ")}`, ``, h.note ? `**Note:** ${h.note}\n` : null, `---\n`].filter(Boolean).join("\n");
}

function appendToMarkdown(filePath, highlight, defaultHeader) {
  ensureFile(filePath, defaultHeader);
  const block = formatHighlightBlock(highlight);
  const content = fs.readFileSync(filePath, "utf8");
  const marker = "<!-- highlights will be appended here by the sync server -->";
  if (content.includes(marker)) {
    fs.writeFileSync(filePath, content.replace(marker, marker + "\n\n" + block), "utf8");
  } else {
    fs.appendFileSync(filePath, "\n" + block, "utf8");
  }
}

function saveHighlight(highlight) {
  highlight.id = highlight.id || Date.now().toString();
  highlightStore.unshift(highlight);
  saveStore();

  const theme = highlight.theme || "Untagged";
  appendToMarkdown(path.join(BASE, "highlights", "by-theme", `${slugify(theme)}.md`), highlight, `# ${theme}\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`);
  if (highlight.agent) {
    appendToMarkdown(path.join(BASE, "highlights", "by-agent", `${slugify(highlight.agent)}.md`), highlight, `# ${highlight.agent} — Context Feed\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`);
  }
  appendToMarkdown(path.join(BASE, "highlights", "index.md"), highlight, `# All Highlights\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`);
  return { success: true, id: highlight.id };
}

function deleteHighlightById(id) {
  highlightStore = highlightStore.filter(h => h.id !== id);
  saveStore();
}

function updateHighlight(updated) {
  highlightStore = highlightStore.map(h => h.id === updated.id ? { ...h, ...updated } : h);
  saveStore();
}

function getAgents() {
  const agentDir = path.join(BASE, "agents");
  if (!fs.existsSync(agentDir)) return [];
  return fs.readdirSync(agentDir).filter(f => f.endsWith(".md")).map(f => {
    const slug = f.replace(".md", "");
    const content = fs.readFileSync(path.join(agentDir, f), "utf8");
    const nameMatch = content.match(/^# (.+)/m);
    return { slug, name: nameMatch ? nameMatch[1] : slug };
  });
}

function createAgent(name, description) {
  const slug = slugify(name);
  const agentPath = path.join(BASE, "agents", `${slug}.md`);
  const feedPath = path.join(BASE, "highlights", "by-agent", `${slug}.md`);
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, `# ${name}\n\n## Description\n${description || ""}\n\n## Context Feed\nSee: ../highlights/by-agent/${slug}.md\n`, "utf8");
  }
  ensureFile(feedPath, `# ${name} — Context Feed\n\nHighlights routed to this agent.\n\n---\n\n<!-- highlights will be appended here by the sync server -->\n`);
  return { success: true, slug, name };
}

// Export pure utility functions for testing
module.exports = { slugify, formatHighlightBlock, appendToMarkdown, deleteHighlightById, updateHighlight };

// Only start the HTTP server when run directly (not required as a module)
if (require.main === module) {
  loadStore();

  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/ping") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", base: BASE }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/agents") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getAgents()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/themes") {
      const themeDir = path.join(BASE, "highlights", "by-theme");
      const themes = fs.existsSync(themeDir) ? fs.readdirSync(themeDir).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")) : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(themes));
      return;
    }

    if (req.method === "GET" && url.pathname === "/highlights/raw") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(highlightStore));
      return;
    }

    if (req.method === "POST" && url.pathname === "/highlight") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const h = JSON.parse(body);
          h.createdAt = h.createdAt || new Date().toISOString();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(saveHighlight(h)));
        } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/highlight/update") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const updated = JSON.parse(body);
          updateHighlight(updated);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/agent") {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", () => {
        try {
          const { name, description } = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(createAgent(name, description)));
        } catch(e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/highlight/")) {
      const id = url.pathname.split("/").pop();
      deleteHighlightById(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n✦ Context Highlighter server running`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Knowledge base: ${BASE}\n`);
  });
}
