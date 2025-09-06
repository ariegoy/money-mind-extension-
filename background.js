// background.js — queue + send; badge hooks
const DEFAULTS = { apiUrl: "https://YOUR-APP-DOMAIN/api/save", userCode: "" };
const QUEUE_KEY = "mm_queue";

async function getSettings() {
  const s = await chrome.storage.sync.get(["apiUrl","userCode"]);
  return { apiUrl: s.apiUrl || DEFAULTS.apiUrl, userCode: s.userCode || DEFAULTS.userCode };
}
async function enqueueSave(payload) {
  const s = await chrome.storage.local.get(QUEUE_KEY);
  const q = s[QUEUE_KEY] || [];
  q.push(payload);
  await chrome.storage.local.set({ [QUEUE_KEY]: q });
}
async function flushQueue() {
  const { apiUrl } = await getSettings();
  const s = await chrome.storage.local.get(QUEUE_KEY);
  const q = s[QUEUE_KEY] || [];
  const left = [];
  for (const item of q) {
    try {
      const r = await fetch(apiUrl, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(item) });
      if (!r.ok) left.push(item);
    } catch (e) { left.push(item); }
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: left });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#34d399" });
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MM_CHECKOUT_DETECTED" && sender.tab) {
    sendResponse && sendResponse({ ok:true }); return true;
  }
  if (msg.type === "MM_SAVE") {
    (async () => {
      const settings = await getSettings();
      const payload = {
        amount: msg.amount, category: msg.category || "other", notes: msg.notes || "",
        risk: msg.risk || 0, source: "extension", url: msg.url || "", title: msg.title || "",
        userCode: settings.userCode || ""
      };
      try {
        const r = await fetch(settings.apiUrl, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        sendResponse && sendResponse({ ok: true });
      } catch (e) {
        await enqueueSave(payload);
        sendResponse && sendResponse({ ok:false, queued:true });
      }
    })();
    return true;
  }
});
setInterval(flushQueue, 60 * 1000);
