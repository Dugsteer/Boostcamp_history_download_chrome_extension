const btnCsv = document.getElementById("exportCsv");
const statusEl = document.getElementById("status");

let dataReady = false;

function withTab(fn) {
  chrome.tabs.query(
    { active: true, currentWindow: true },
    (tabs) => tabs[0] && fn(tabs[0].id)
  );
}
function send(tabId, type) {
  chrome.tabs.sendMessage(tabId, { type });
}

btnCsv.onclick = () => {
  if (!dataReady) {
    alert(
      "No workout data captured yet.\nReload the Boostcamp history page and try again."
    );
    return;
  }
  withTab((id) => send(id, "BC_EXPORT_CSV"));
};

// Listen for capture status from content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "BC_STATUS") return;
  if (msg.count > 0) {
    dataReady = true;
    statusEl.textContent = `✅ ${msg.count} responses captured — ready`;
    statusEl.style.color = "#0a0";
  } else {
    dataReady = false;
    statusEl.textContent = "Waiting for data…";
    statusEl.style.color = "#666";
  }
});
