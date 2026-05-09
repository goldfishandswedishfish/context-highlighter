// Sidebar JS

let allHighlights = [];
let currentView = "all";
let activeTheme = "All";
let searchQuery = "";
let editingId = null;

// ── Init ──────────────────────────────────────────────

function loadHighlights() {
  chrome.runtime.sendMessage({ type: "GET_HIGHLIGHTS" }, (res) => {
    allHighlights = res?.highlights || [];
    render();
  });
}

// Listen for updates from background (new saves)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "HIGHLIGHTS_UPDATED") loadHighlights();
});

// ── Filtering ─────────────────────────────────────────

function getFilteredHighlights() {
  return allHighlights.filter(h => {
    const matchesTheme = activeTheme === "All" || h.theme === activeTheme;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      h.text.toLowerCase().includes(q) ||
      (h.note || "").toLowerCase().includes(q) ||
      (h.theme || "").toLowerCase().includes(q);
    return matchesTheme && matchesSearch;
  });
}

function getThemes() {
  const counts = {};
  allHighlights.forEach(h => {
    const t = h.theme || "Untagged";
    counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

// ── Rendering ─────────────────────────────────────────

function render() {
  renderStats();
  renderThemeBar();
  if (currentView === "all") renderAll();
  else renderByTheme();
}

function renderStats() {
  const themes = Object.keys(getThemes()).length;
  document.getElementById("stat-total").textContent = allHighlights.length;
  document.getElementById("stat-themes").textContent = themes;
}

function renderThemeBar() {
  const themes = getThemes();
  const bar = document.getElementById("theme-bar");
  const all = ["All", ...Object.keys(themes)];
  bar.innerHTML = all.map(t => {
    const count = t === "All" ? allHighlights.length : themes[t];
    return `<div class="theme-pill ${activeTheme === t ? "active" : ""}" data-theme="${t}">
      ${t}<span class="count">${count}</span>
    </div>`;
  }).join("");

  bar.querySelectorAll(".theme-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      activeTheme = pill.dataset.theme;
      render();
    });
  });
}

function renderAll() {
  const filtered = getFilteredHighlights();
  const container = document.getElementById("main-content");
  if (!filtered.length) {
    container.innerHTML = emptyState();
    return;
  }
  container.innerHTML = filtered.map(h => cardHTML(h)).join("");
  bindCardEvents(container);
}

function renderByTheme() {
  const filtered = getFilteredHighlights();
  const container = document.getElementById("main-content");
  if (!filtered.length) { container.innerHTML = emptyState(); return; }

  const groups = {};
  filtered.forEach(h => {
    const t = h.theme || "Untagged";
    if (!groups[t]) groups[t] = [];
    groups[t].push(h);
  });

  container.innerHTML = Object.entries(groups).map(([theme, highlights]) => `
    <div class="theme-group">
      <div class="theme-group-header">
        <div class="theme-group-name">${escHtml(theme)}</div>
        <div class="theme-group-count">${highlights.length} item${highlights.length !== 1 ? "s" : ""}</div>
      </div>
      ${highlights.map(h => cardHTML(h)).join("")}
    </div>
  `).join("");
  bindCardEvents(container);
}

function cardHTML(h) {
  const date = new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `
    <div class="highlight-card" data-id="${h.id}">
      <div class="card-theme">${escHtml(h.theme || "Untagged")}</div>
      <div class="card-text">${escHtml(h.text)}</div>
      ${h.note ? `<div class="card-note">${escHtml(h.note)}</div>` : ""}
      <div class="card-meta">
        <span>${date}</span>
        <div class="card-actions">
          <button class="card-action-btn edit-btn" data-id="${h.id}">Edit</button>
          <button class="card-action-btn del" data-id="${h.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
      <p>${searchQuery ? "No highlights match your search." : "Select text in a Claude conversation<br>and click <strong>Save</strong> to highlight it."}</p>
    </div>
  `;
}

function bindCardEvents(container) {
  container.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEdit(btn.dataset.id));
  });
  container.querySelectorAll(".del").forEach(btn => {
    btn.addEventListener("click", () => deleteHighlight(btn.dataset.id));
  });
}

// ── Edit ──────────────────────────────────────────────

function openEdit(id) {
  const h = allHighlights.find(x => x.id === id);
  if (!h) return;
  editingId = id;
  document.getElementById("edit-note").value = h.note || "";
  document.getElementById("edit-theme").value = h.theme || "";
  document.getElementById("edit-overlay").classList.add("open");
}

function closeEdit() {
  document.getElementById("edit-overlay").classList.remove("open");
  editingId = null;
}

document.getElementById("edit-cancel").addEventListener("click", closeEdit);
document.getElementById("edit-save").addEventListener("click", () => {
  if (!editingId) return;
  const note = document.getElementById("edit-note").value.trim();
  const theme = document.getElementById("edit-theme").value.trim() || "Untagged";
  chrome.runtime.sendMessage({
    type: "UPDATE_HIGHLIGHT",
    highlight: { id: editingId, note, theme }
  }, () => { closeEdit(); loadHighlights(); });
});

// ── Delete ────────────────────────────────────────────

function deleteHighlight(id) {
  chrome.runtime.sendMessage({ type: "DELETE_HIGHLIGHT", id }, () => loadHighlights());
}

// ── Export ────────────────────────────────────────────

document.getElementById("export-btn").addEventListener("click", () => {
  const themes = getThemes();
  const groups = {};
  allHighlights.forEach(h => {
    const t = h.theme || "Untagged";
    if (!groups[t]) groups[t] = [];
    groups[t].push(h);
  });

  let md = `# Claude Highlights\n_Exported ${new Date().toLocaleDateString()}_\n\n`;
  Object.entries(groups).forEach(([theme, highlights]) => {
    md += `## ${theme}\n\n`;
    highlights.forEach(h => {
      md += `> ${h.text}\n\n`;
      if (h.note) md += `**Note:** ${h.note}\n\n`;
      md += `---\n\n`;
    });
  });

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "claude-highlights.md"; a.click();
  URL.revokeObjectURL(url);
});

// ── View toggle ───────────────────────────────────────

document.querySelectorAll(".view-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    render();
  });
});

// ── Search ────────────────────────────────────────────

document.getElementById("search-input").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  render();
});

// ── Escape edit overlay ───────────────────────────────

document.getElementById("edit-overlay").addEventListener("click", (e) => {
  if (e.target === document.getElementById("edit-overlay")) closeEdit();
});

// ── Helpers ───────────────────────────────────────────

function escHtml(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Boot ─────────────────────────────────────────────

loadHighlights();
