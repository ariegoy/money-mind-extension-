// popup.js
(function(){
  function $(id){ return document.getElementById(id); }
  function num(v){ var n = Number(String(v||'').replace(/[^0-9.]/g,'')); return isFinite(n)?n:0; }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    return tab;
  }

  async function loadContext(){
    const tab = await getActiveTab();
    const key = "tab:" + tab.id;
    const s = await chrome.storage.session.get(key);
    const ctx = s[key] || {};
    // Set category + risk display
    if (ctx.category) $('category').value = ctx.category;
    var riskText = "Risk: " + (ctx.risk === 2 ? "High" : (ctx.risk === 1 ? "Medium" : "Low")) + (ctx.confidence ? (" · conf " + Math.round(ctx.confidence*100)+"%"):"");
    $('riskLine').textContent = riskText;
    return { tab, ctx };
  }

  async function doSave(){
    const amt = num($('amount').value);
    if (!amt || amt <= 0) { $('status').textContent = "Enter amount"; return; }
    $('status').textContent = "Saving…";
    const { tab, ctx } = await loadContext();
    chrome.runtime.sendMessage({
      type: "MM_SAVE",
      amount: amt,
      category: $('category').value,
      notes: $('notes').value || "",
      risk: ctx.risk || 0,
      url: ctx.url || (tab && tab.url) || "",
      title: ctx.title || (tab && tab.title) || ""
    }, function(resp){
      if (!resp) { $('status').textContent = "Error"; return; }
      if (resp.ok) $('status').textContent = "Saved!";
      else if (resp.queued) $('status').textContent = "Offline—queued";
      else $('status').textContent = "Error";
      setTimeout(function(){ $('status').textContent = ""; }, 1200);
      $('amount').value = "";
      $('notes').value = "";
    });
  }

  document.addEventListener('DOMContentLoaded', async function(){
    await loadContext();
    $('saveBtn').addEventListener('click', doSave);
    // Quick chips (optional)
    // document.querySelectorAll('[data-amt]').forEach(b => b.addEventListener('click', e => $('amount').value = b.dataset.amt));
  });
})();
