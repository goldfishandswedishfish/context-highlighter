// Content script — runs on all URLs

let floatingBtn = null;
let saveModal = null;
let currentSelection = null;
let availableAgents = [];
let availableThemes = [];

// Pre-fetch agents and themes
chrome.runtime.sendMessage({ type: "GET_AGENTS" }, (res) => { availableAgents = res || []; });
chrome.runtime.sendMessage({ type: "GET_THEMES" }, (res) => { availableThemes = res || []; });

// ── Floating button ───────────────────────────────────

function createFloatingButton() {
  const btn = document.createElement("div");
  btn.id = "ch-float-btn";
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
    Save
  `;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openSaveModal(currentSelection);
  });
  document.body.appendChild(btn);
  return btn;
}

// ── Save modal ────────────────────────────────────────

function createSaveModal() {
  const modal = document.createElement("div");
  modal.id = "ch-modal-overlay";
  modal.innerHTML = `
    <div id="ch-modal">
      <div class="ch-modal-header">
        <span class="ch-modal-title">Save Highlight</span>
        <button class="ch-close-btn" id="ch-close">✕</button>
      </div>
      <div class="ch-selected-text" id="ch-selected-preview"></div>
      <div class="ch-field">
        <label>Note <span class="ch-optional">(optional)</span></label>
        <textarea id="ch-note" placeholder="Add your thoughts..."></textarea>
      </div>
      <div class="ch-field">
        <label>Theme</label>
        <input id="ch-theme-input" type="text" placeholder="e.g. Key Concepts, Action Items..." list="ch-themes-list"/>
        <datalist id="ch-themes-list"></datalist>
        <div id="ch-theme-chips" class="ch-chips"></div>
      </div>
      <div class="ch-field">
        <label>Route to Agent <span class="ch-optional">(optional)</span></label>
        <div id="ch-agent-chips" class="ch-chips"></div>
      </div>
      <div id="ch-server-warning" class="ch-warning" style="display:none">
        ⚠️ Sync server not running — start it with: <code>cd server && node index.js</code>
      </div>
      <div class="ch-modal-footer">
        <button id="ch-cancel" class="ch-btn-secondary">Cancel</button>
        <button id="ch-save" class="ch-btn-primary">Save Highlight</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#ch-close").addEventListener("click", closeModal);
  modal.querySelector("#ch-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector("#ch-save").addEventListener("click", saveHighlight);
  return modal;
}

let selectedAgent = null;

function openSaveModal(selectionData) {
  if (!saveModal) saveModal = createSaveModal();
  selectedAgent = null;

  // Check server
  chrome.runtime.sendMessage({ type: "PING_SERVER" }, (res) => {
    saveModal.querySelector("#ch-server-warning").style.display = res ? "none" : "block";
  });

  // Theme chips
  const themeChips = saveModal.querySelector("#ch-theme-chips");
  const datalist = saveModal.querySelector("#ch-themes-list");
  datalist.innerHTML = availableThemes.map(t => `<option value="${t}">`).join("");
  themeChips.innerHTML = availableThemes.slice(0, 5).map(t =>
    `<span class="ch-chip" data-value="${t}">${t}</span>`
  ).join("");
  themeChips.querySelectorAll(".ch-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      saveModal.querySelector("#ch-theme-input").value = chip.dataset.value;
      themeChips.querySelectorAll(".ch-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // Agent chips
  const agentChips = saveModal.querySelector("#ch-agent-chips");
  agentChips.innerHTML = availableAgents.map(a =>
    `<span class="ch-chip ch-agent-chip" data-value="${a.slug}" data-name="${a.name}">${a.name}</span>`
  ).join("");
  agentChips.querySelectorAll(".ch-agent-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (selectedAgent === chip.dataset.value) {
        selectedAgent = null;
        chip.classList.remove("active");
      } else {
        selectedAgent = chip.dataset.value;
        agentChips.querySelectorAll(".ch-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
      }
    });
  });

  // Preview
  saveModal.querySelector("#ch-selected-preview").textContent =
    selectionData.text.length > 200 ? selectionData.text.substring(0, 200) + "…" : selectionData.text;
  saveModal.querySelector("#ch-note").value = "";
  saveModal.querySelector("#ch-theme-input").value = "";
  saveModal.style.display = "flex";
  saveModal.querySelector("#ch-note").focus();
}

function closeModal() {
  if (saveModal) saveModal.style.display = "none";
  if (floatingBtn) floatingBtn.style.display = "none";
}

function saveHighlight() {
  if (!currentSelection) return;
  const note = saveModal.querySelector("#ch-note").value.trim();
  const theme = saveModal.querySelector("#ch-theme-input").value.trim() || "Untagged";
  const savedText = currentSelection.text;

  chrome.runtime.sendMessage({
    type: "SAVE_HIGHLIGHT",
    text: savedText,
    note,
    theme,
    agent: selectedAgent,
    url: window.location.href,
    conversationTitle: document.title || ""
  }, (res) => {
    if (res?.error) {
      saveModal.querySelector("#ch-server-warning").style.display = "block";
      return;
    }
    applyHighlightMark(savedText, res.id);
    closeModal();
    showToast(selectedAgent ? `Saved & routed to ${selectedAgent}` : "Highlight saved");
  });
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "ch-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("visible"), 10);
  setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 2500);
}

// ── Selection detection ───────────────────────────────

document.addEventListener("mouseup", (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 10) {
      currentSelection = { text };
      if (!floatingBtn) floatingBtn = createFloatingButton();
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      floatingBtn.style.display = "flex";
      floatingBtn.style.top = `${window.scrollY + rect.top - 44}px`;
      floatingBtn.style.left = `${window.scrollX + rect.left + rect.width / 2 - 40}px`;
    } else if (!e.target.closest("#ch-float-btn") && !e.target.closest("#ch-modal")) {
      if (floatingBtn) floatingBtn.style.display = "none";
    }
  }, 10);
});

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SAVE_SELECTION") {
    currentSelection = { text: message.text };
    openSaveModal(currentSelection);
  }
});

// ── Page highlight marking ────────────────────────────

function applyHighlightMark(text, id) {
  if (!text || !text.trim()) return;
  const searchText = text.trim();

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName;
      if (tag && ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.parentElement?.closest(".ch-highlight")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const positions = [];
  let combined = "";
  let node;
  while ((node = walker.nextNode())) {
    positions.push({ node, start: combined.length });
    combined += node.textContent;
  }

  const idx = combined.indexOf(searchText);
  if (idx === -1) return;
  const end = idx + searchText.length;

  const range = document.createRange();
  let startSet = false;

  for (const { node: n, start } of positions) {
    const nodeEnd = start + n.textContent.length;
    if (!startSet && idx >= start && idx < nodeEnd) {
      range.setStart(n, idx - start);
      startSet = true;
    }
    if (startSet && end <= nodeEnd) {
      range.setEnd(n, end - start);
      break;
    }
  }

  if (!startSet) return;

  try {
    const mark = document.createElement("mark");
    mark.className = "ch-highlight";
    mark.dataset.chId = id || "";
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  } catch (_) {
    // DOM structure (e.g. cross-element range) prevented wrapping — silently skip
  }
}

function loadAndApplyHighlights() {
  chrome.runtime.sendMessage({ type: "GET_PAGE_HIGHLIGHTS", url: window.location.href }, (highlights) => {
    if (!highlights || !highlights.length) return;
    highlights.forEach(h => applyHighlightMark(h.text, h.id));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadAndApplyHighlights);
} else {
  loadAndApplyHighlights();
}
