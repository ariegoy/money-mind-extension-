// background.js
const DEFAULTS = {
  apiUrl: "https://YOUR-APP-DOMAIN/api/save", // change to your Render URL + endpoint
  userCode: ""                                // optional referral / user id
};

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
    } catch(e) { left.push(item); }
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: left });
}

chrome.runtime.onInstalled.addListener(() => chrome.action.setBadgeBackgroundColor({ color: "#34d399" }));

// Listen from content
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "MM_CHECKOUT_DETECTED") {
    // classify
    const { classify } = await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => window.MM_CLASSIFIER.classify(location.href, document.title)
    }).then(r => r[0].result);

    const badgeText = classify.risk === 2 ? "Hi" : (classify.risk === 1 ? "Med" : "Low");
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: badgeText });

    // Stash latest page info per tab
    chrome.storage.session.set({ ["tab:" + sender.tab.id]: {
      url: msg.url, title: msg.title, category: classify.category, risk: classify.risk, confidence: classify.confidence
    }});
  }
  sendResponse && sendResponse({ ok: true });
  return true;
});

// From popup → save
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === "MM_SAVE") {
    const settings = await getSettings();
    const payload = {
      amount: msg.amount,
      category: msg.category,
      notes: msg.notes || "",
      risk: msg.risk || 0,
      source: "extension",
      url: msg.url || "",
      title: msg.title || "",
      userCode: settings.userCode || ""
    };
    try {
      const r = await fetch(settings.apiUrl, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      sendResponse({ ok: true });
    } catch (e) {
      await enqueueSave(payload);
      sendResponse({ ok: false, queued: true });
    }
    return true;
  }
});

// Retry queue occasionally
setInterval(() => { flushQueue(); }, 60 * 1000);
