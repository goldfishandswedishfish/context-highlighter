// Background service worker
const SERVER = "http://localhost:3747";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-highlight",
    title: "Save to Context Highlighter",
    contexts: ["selection"]
  });
  chrome.sidePanel.setOptions({ enabled: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-highlight" && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: "SAVE_SELECTION",
      text: info.selectionText,
      url: tab.url,
      title: tab.title
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── Server communication ──────────────────────────────

async function serverGet(path) {
  try {
    const res = await fetch(`${SERVER}${path}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function serverPost(path, body) {
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch {
    return { error: "Server not running" };
  }
}

async function serverDelete(path) {
  try {
    const res = await fetch(`${SERVER}${path}`, { method: "DELETE" });
    return await res.json();
  } catch {
    return { error: "Server not running" };
  }
}

// ── Message handling ──────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GET_AGENTS") {
    serverGet("/agents").then(r => sendResponse(r || []));
    return true;
  }

  if (message.type === "GET_THEMES") {
    serverGet("/themes").then(r => sendResponse(r || []));
    return true;
  }

  if (message.type === "PING_SERVER") {
    serverGet("/ping").then(r => sendResponse(r));
    return true;
  }

  if (message.type === "GET_HIGHLIGHTS") {
    serverGet("/highlights/raw").then(r => sendResponse(r || []));
    return true;
  }

  if (message.type === "SAVE_HIGHLIGHT") {
    serverPost("/highlight", {
      text: message.text,
      note: message.note || "",
      theme: message.theme || "Untagged",
      agent: message.agent || null,
      url: message.url,
      createdAt: new Date().toISOString()
    }).then(r => {
      sendResponse(r);
      chrome.runtime.sendMessage({ type: "HIGHLIGHTS_UPDATED" }).catch(() => {});
    });
    return true;
  }

  if (message.type === "UPDATE_HIGHLIGHT") {
    serverPost("/highlight/update", message.highlight).then(r => {
      sendResponse(r);
      chrome.runtime.sendMessage({ type: "HIGHLIGHTS_UPDATED" }).catch(() => {});
    });
    return true;
  }

  if (message.type === "DELETE_HIGHLIGHT") {
    serverDelete(`/highlight/${message.id}`).then(r => {
      sendResponse(r);
      chrome.runtime.sendMessage({ type: "HIGHLIGHTS_UPDATED" }).catch(() => {});
    });
    return true;
  }

  if (message.type === "CREATE_AGENT") {
    serverPost("/agent", { name: message.name, description: message.description || "" }).then(r => {
      sendResponse(r);
    });
    return true;
  }
});
