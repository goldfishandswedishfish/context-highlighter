// Sidebar JS

let allHighlights = [];
let allAgents = [];
let currentView = "all";
let activeTheme = "All";
let searchQuery = "";
let manualSelectedAgent = null;
let editingId = null;

// ── Init ──────────────────────────────────────────────

function loadHighlights() {
  chrome.runtime.sendMessage({ type: "GET_HIGHLIGHTS" }, (res) => {
    if (chrome.runtime.lastError) return;
    allHighlights = res || [];
    render();
  });
}

function loadAgents(callback) {
  chrome.runtime.sendMessage({ type: "GET_AGENTS" }, (res) => {
    if (chrome.runtime.lastError) return;
    allAgents = res || [];
    if (callback) callback(allAgents);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "HIGHLIGHTS_UPDATED") { loadHighlights(); sendResponse({}); }
  return true;
});

// ── Filtering ─────────────────────────────────────────

function getFilteredHighlights() {
  return allHighlights.filter(h => {
    const matchesTheme = activeTheme === "All" || h.theme === activeTheme;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || h.text.toLowerCase().includes(q) || (h.note||"").toLowerCase().includes(q) || (h.theme||"").toLowerCase().includes(q);
    return matchesTheme && matchesSearch;
  });
}

function getThemes() {
  const counts = {};
  allHighlights.forEach(h => { const t = h.theme || "Untagged"; counts[t] = (counts[t]||0)+1; });
  return counts;
}

// ── Rendering ─────────────────────────────────────────

function render() {
  renderStats(); renderThemeBar();
  if (currentView === "all") renderAll(); else renderByTheme();
}

function renderStats() {
  document.getElementById("stat-total").textContent = allHighlights.length;
  document.getElementById("stat-themes").textContent = Object.keys(getThemes()).length;
}

function renderThemeBar() {
  const themes = getThemes();
  const bar = document.getElementById("theme-bar");
  bar.innerHTML = ["All", ...Object.keys(themes)].map(t => {
    const count = t === "All" ? allHighlights.length : themes[t];
    return `<div class="theme-pill ${activeTheme===t?"active":""}" data-theme="${t}">${t}<span class="count">${count}</span></div>`;
  }).join("");
  bar.querySelectorAll(".theme-pill").forEach(pill => {
    pill.addEventListener("click", () => { activeTheme = pill.dataset.theme; render(); });
  });
}

function renderAll() {
  const filtered = getFilteredHighlights();
  const container = document.getElementById("main-content");
  if (!filtered.length) { container.innerHTML = emptyState(); return; }
  container.innerHTML = filtered.map(h => cardHTML(h)).join("");
  bindCardEvents(container);
}

function renderByTheme() {
  const filtered = getFilteredHighlights();
  const container = document.getElementById("main-content");
  if (!filtered.length) { container.innerHTML = emptyState(); return; }
  const groups = {};
  filtered.forEach(h => { const t = h.theme||"Untagged"; if(!groups[t]) groups[t]=[]; groups[t].push(h); });
  container.innerHTML = Object.entries(groups).map(([theme, highlights]) => `
    <div class="theme-group">
      <div class="theme-group-header"><div class="theme-group-name">${escHtml(theme)}</div><div class="theme-group-count">${highlights.length} item${highlights.length!==1?"s":""}</div></div>
      ${highlights.map(h => cardHTML(h)).join("")}
    </div>`).join("");
  bindCardEvents(container);
}

function cardHTML(h) {
  const date = new Date(h.createdAt).toLocaleDateString("en-US", { month:"short", day:"numeric" });
  return `
    <div class="highlight-card" data-id="${h.id}">
      <div class="card-theme">${escHtml(h.theme||'Untagged')}${h.agent ? ' → ' + escHtml(h.agent) : ''}</div>
      <div class="card-text">${escHtml(h.text)}</div>
      ${h.note?`<div class="card-note">${escHtml(h.note)}</div>`:""}
      ${h.url?`<div class="card-source">${escHtml(h.url)}</div>`:""}
      <div class="card-meta">
        <span>${date}</span>
        <div class="card-actions">
          <button class="card-action-btn edit-btn" data-id="${h.id}">Edit</button>
          <button class="card-action-btn del" data-id="${h.id}">Delete</button>
        </div>
      </div>
    </div>`;
}

function emptyState() {
  return `<div class="empty-state"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><p>${searchQuery?"No highlights match your search.":"Select text on any webpage<br>and click <strong>Save</strong> to highlight it.<br>Or use <strong>+ Add Manually</strong> below."}</p></div>`;
}

function bindCardEvents(container) {
  container.querySelectorAll(".edit-btn").forEach(btn => btn.addEventListener("click", () => openEditModal(btn.dataset.id)));
  container.querySelectorAll(".del").forEach(btn => btn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "DELETE_HIGHLIGHT", id: btn.dataset.id }, () => loadHighlights());
  }));
}

// ── Agent chips helper ────────────────────────────────

function renderAgentChips(containerId, onSelect) {
  const container = document.getElementById(containerId);
  const chips = allAgents.map(a =>
    `<span class="modal-chip agent-chip" data-value="${a.slug}" data-name="${a.name}">${a.name}</span>`
  ).join("");
  container.innerHTML = chips + `<span class="modal-chip add-new" id="${containerId}-add">+ New Agent</span>`;

  let selected = null;
  container.querySelectorAll(".agent-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (selected === chip.dataset.value) {
        selected = null; chip.classList.remove("active");
      } else {
        selected = chip.dataset.value;
        container.querySelectorAll(".agent-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
      onSelect(selected);
    });
  });

  document.getElementById(`${containerId}-add`).addEventListener("click", () => {
    openAgentModal(() => {
      loadAgents(() => renderAgentChips(containerId, onSelect));
    });
  });
}

// ── Edit Modal ────────────────────────────────────────

function openEditModal(id) {
  const h = allHighlights.find(x => x.id === id);
  if (!h) return;
  editingId = id;
  document.getElementById("edit-text").value = h.text;
  document.getElementById("edit-note").value = h.note || "";
  document.getElementById("edit-theme").value = h.theme || "";
  document.getElementById("edit-overlay").classList.add("open");
  document.getElementById("edit-text").focus();
}

function closeEditModal() { document.getElementById("edit-overlay").classList.remove("open"); editingId = null; }

function saveEdit() {
  if (!editingId) return;
  const text = document.getElementById("edit-text").value.trim();
  if (!text) { document.getElementById("edit-text").style.borderColor="#c45c5c"; return; }
  chrome.runtime.sendMessage({
    type: "UPDATE_HIGHLIGHT",
    highlight: { id: editingId, text, note: document.getElementById("edit-note").value.trim(), theme: document.getElementById("edit-theme").value.trim() || "Untagged" }
  }, () => { closeEditModal(); loadHighlights(); });
}

document.getElementById("edit-cancel").addEventListener("click", closeEditModal);
document.getElementById("edit-save").addEventListener("click", saveEdit);
document.getElementById("edit-overlay").addEventListener("click", e => { if (e.target===document.getElementById("edit-overlay")) closeEditModal(); });

// ── Add Agent Modal ───────────────────────────────────

let agentCreatedCallback = null;

function openAgentModal(callback) {
  agentCreatedCallback = callback;
  document.getElementById("agent-name").value = "";
  document.getElementById("agent-description").value = "";
  document.getElementById("agent-overlay").classList.add("open");
  document.getElementById("agent-name").focus();
}

function closeAgentModal() { document.getElementById("agent-overlay").classList.remove("open"); }

function saveAgent() {
  const name = document.getElementById("agent-name").value.trim();
  if (!name) { document.getElementById("agent-name").style.borderColor="#c45c5c"; return; }
  const description = document.getElementById("agent-description").value.trim();
  chrome.runtime.sendMessage({ type: "CREATE_AGENT", name, description }, () => {
    closeAgentModal();
    if (agentCreatedCallback) agentCreatedCallback();
  });
}

document.getElementById("agent-cancel").addEventListener("click", closeAgentModal);
document.getElementById("agent-save").addEventListener("click", saveAgent);
document.getElementById("agent-overlay").addEventListener("click", e => { if (e.target===document.getElementById("agent-overlay")) closeAgentModal(); });

// ── Manual Add Modal ──────────────────────────────────

function openManualModal() {
  manualSelectedAgent = null;
  const themes = [...new Set(allHighlights.map(h=>h.theme).filter(t=>t&&t!=="Untagged"))].slice(0,6);
  const themeChips = document.getElementById("manual-theme-chips");
  themeChips.innerHTML = themes.map(t=>`<span class="modal-chip" data-value="${t}">${t}</span>`).join("");
  themeChips.querySelectorAll(".modal-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.getElementById("manual-theme").value = chip.dataset.value;
      themeChips.querySelectorAll(".modal-chip").forEach(c=>c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  renderAgentChips("manual-agent-chips", (val) => { manualSelectedAgent = val; });

  document.getElementById("manual-text").value = "";
  document.getElementById("manual-note").value = "";
  document.getElementById("manual-theme").value = "";
  document.getElementById("manual-source").value = "";
  document.getElementById("manual-overlay").classList.add("open");
  document.getElementById("manual-text").focus();
}

function closeManualModal() { document.getElementById("manual-overlay").classList.remove("open"); }

function saveManualHighlight() {
  const text = document.getElementById("manual-text").value.trim();
  if (!text) { document.getElementById("manual-text").style.borderColor="#c45c5c"; return; }
  chrome.runtime.sendMessage({
    type: "SAVE_HIGHLIGHT",
    text,
    note: document.getElementById("manual-note").value.trim(),
    theme: document.getElementById("manual-theme").value.trim() || "Untagged",
    agent: manualSelectedAgent,
    url: document.getElementById("manual-source").value.trim() || "Manual entry"
  }, (res) => {
    if (res?.error) { alert("Server not running."); return; }
    closeManualModal(); loadHighlights();
  });
}

document.getElementById("manual-add-btn").addEventListener("click", openManualModal);
document.getElementById("manual-cancel").addEventListener("click", closeManualModal);
document.getElementById("manual-save").addEventListener("click", saveManualHighlight);
document.getElementById("manual-overlay").addEventListener("click", e => { if (e.target===document.getElementById("manual-overlay")) closeManualModal(); });

// ── Export ────────────────────────────────────────────

document.getElementById("export-btn").addEventListener("click", () => {
  const groups = {};
  allHighlights.forEach(h => { const t=h.theme||"Untagged"; if(!groups[t]) groups[t]=[]; groups[t].push(h); });
  let md = `# Context Highlights\n_Exported ${new Date().toLocaleDateString()}_\n\n`;
  Object.entries(groups).forEach(([theme, highlights]) => {
    md += `## ${theme}\n\n`;
    highlights.forEach(h => { md += `> ${h.text}\n\n`; if(h.note) md+=`**Note:** ${h.note}\n\n`; if(h.agent) md+=`**Agent:** ${h.agent}\n\n`; md+="---\n\n"; });
  });
  const blob = new Blob([md], {type:"text/markdown"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="context-highlights.md"; a.click(); URL.revokeObjectURL(url);
});

// ── View toggle & Search ──────────────────────────────

document.querySelectorAll(".view-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active"); currentView=btn.dataset.view; render();
  });
});

document.getElementById("search-input").addEventListener("input", e => { searchQuery=e.target.value.trim(); render(); });

// ── Helpers ───────────────────────────────────────────

function escHtml(str) { return (str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

// ── Boot ─────────────────────────────────────────────

loadAgents(() => { loadHighlights(); });
setInterval(loadHighlights, 5000);
