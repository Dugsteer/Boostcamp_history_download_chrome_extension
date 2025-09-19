(function inject() {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "BC_EXPORT_CSV") {
    window.postMessage({ source: "BC_CONTENT", type: "BC_DOWNLOAD_CSV" }, "*");
  }
});

// Relay capture count from inject.js to popup.js
window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (!msg || msg.source !== "BC_INJECT_STATUS") return;
  chrome.runtime.sendMessage({ type: "BC_STATUS", count: msg.count });
});
