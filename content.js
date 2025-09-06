// content.js — checkout detection + persuasive banner + auto price + auto-abandon + site deny + privacy limits
(function () {
  // -------- helpers --------
  function looksLikeCheckout(maxChars) {
    var t  = (document.title || '').toLowerCase();
    if (t.indexOf('checkout') !== -1) return true;
    var tx = document.body ? (document.body.innerText || '') : '';
    if (typeof maxChars === "number") tx = tx.slice(0, Math.max(0, maxChars));
    tx = tx.toLowerCase();
    var kw = ['checkout','order summary','place order','payment','billing','cart','add to cart','add to bag'];
    for (var i=0;i<kw.length;i++){
      if (tx.indexOf(kw[i]) !== -1) return true;
    }
    return false;
  }
  function hostKey() { try{ return (new URL(location.href)).hostname.toLowerCase(); } catch(e){ return 'unknown-host'; } }
  var SNOOZE_MS = 2 * 60 * 60 * 1000;
  function isSnoozed(){ var k='mm_snooze:'+hostKey(); var raw=sessionStorage.getItem(k); if(!raw) return false; var until=Number(raw); return isFinite(until)&&Date.now()<until; }
  function snoozeNow(){ var k='mm_snooze:'+hostKey(); sessionStorage.setItem(k, String(Date.now()+SNOOZE_MS)); }

  // success/abandon
  var SUCCESS_WORDS = ["thank you","order confirmed","order complete","payment received","receipt","order placed"];
  function purchaseLooksDone(maxChars){
    var t=(document.title||'').toLowerCase(); if(SUCCESS_WORDS.some(w=>t.indexOf(w)!==-1)) return true;
    var tx=document.body?(document.body.innerText||''):'';
    if (typeof maxChars === "number") tx = tx.slice(0, Math.max(0,maxChars));
    tx=tx.toLowerCase();
    return SUCCESS_WORDS.some(w=>tx.indexOf(w)!==-1);
  }

  // money parsing
  function parseMoney(text){
    if (!text) return 0;
    var m = String(text).match(/(?:[$€£]\s*)?(\d{1,3}(?:[,\s]\d{3})*|\d+)(?:\.\d{1,2})?/);
    if (!m) return 0;
    var numStr = m[0].replace(/[^\d.,]/g,'').replace(/\s+/g,'').replace(/(\d)[,](?=\d{3}\b)/g,'$1').replace(/(\d)[\s](?=\d{3}\b)/g,'$1');
    var hasDot = numStr.indexOf('.') !== -1, hasComma = numStr.indexOf(',') !== -1;
    if (hasDot && hasComma) numStr = numStr.replace(/,/g,''); else if (!hasDot && hasComma) numStr = numStr.replace(',', '.');
    var n = Number(numStr); return isFinite(n) ? n : 0;
  }
  function getPriceFromDOM(maxChars, noBodyScan){
    // structured tags first
    var el = document.querySelector('[itemprop="price"]') || document.querySelector('meta[itemprop="price"]');
    if (el){ var v = el.content || el.getAttribute('content') || el.textContent; var n = parseMoney(v); if (n>0) return n; }
    el = document.querySelector('meta[property="og:price:amount"], meta[name="twitter:data1"]');
    if (el){ var v2 = el.content || el.getAttribute('content'); var n2 = parseFloat(v2); if (isFinite(n2) && n2>0) return n2; }
    // known total nodes
    var sels=['#order-total','#grand-total','#total','#cart-total','#subtotal','.grand-total','.order-total','.cart-total','.checkout-total','[data-test="grand-total"]','[data-test="order-total"]'];
    for (var i=0;i<sels.length;i++){ var node=document.querySelector(sels[i]); if(node){ var n3=parseMoney(node.textContent||node.value); if(n3>0) return n3; } }
    if (noBodyScan) return 0;
    var all = document.body ? document.body.innerText : '';
    if (typeof maxChars === "number") all = all.slice(0, Math.max(0,maxChars));
    // prefer lines with "total"
    var lines = all.split(/\n+/).filter(function(line){ return /total|grand|subtotal/i.test(line); });
    var best=0; for(var j=0;j<lines.length;j++){ var cand=parseMoney(lines[j]); if(cand>best) best=cand; }
    if (best>0) return best;
    var matches = all.match(/[$€£]?\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?/g) || [];
    var maxSeen=0; for(var k=0;k<matches.length;k++){ var c=parseMoney(matches[k]); if(c>maxSeen && c<1000000) maxSeen=c; }
    return maxSeen;
  }

  // persuasive copy
  function nudgeMessage(ctx) {
    var cat = ctx.category || 'purchase';
    var risk = ctx.risk || 0;
    var high = ['Late-night '+cat+'? Save Instead & keep your streak 🔥','Impulse alert: skip this '+cat+' and power up your streak 💪','This '+cat+' adds up fast — want to Save Instead?'];
    var med  = ['You’re on a streak — one skip brings your goal closer 🏅','Nice momentum! Save Instead and unlock your next badge ✨','Keep the streak alive — skip this '+cat+' for your goal'];
    var low  = ['Want to save this '+cat+' for your goal?','Every skip counts — Save Instead 💡','A small save now → big wins later 📈'];
    var pool = risk===2?high:(risk===1?med:low);
    return pool[Math.floor(Math.random()*pool.length)];
  }

  var ABANDON_SENT = false;
  var LAST_CTX = { amount: 0, category: "other", risk: 0, url: "", title: "" };

  function injectBanner(ctx, detectedAmount) {
    if (document.getElementById('mm-save-banner')) return;
    var bar=document.createElement('div');
    bar.id='mm-save-banner';
    bar.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;background:#0ea5e9;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.25);';
    var msg=document.createElement('div'); msg.style.cssText='flex:1;min-width:220px;font-weight:700;'; msg.textContent=nudgeMessage(ctx);
    var info=document.createElement('div'); info.style.cssText='width:100%;font-size:12px;opacity:.9';
    info.textContent='Why: ' + ((ctx.explain&&ctx.explain.host)?('host: '+ctx.explain.host+'; '):'') + ((ctx.explain&&ctx.explain.keywords&&ctx.explain.keywords.length)?('kw: '+ctx.explain.keywords.join(', ')): 'rule-based');
    var amt=document.createElement('input'); amt.type='text'; amt.placeholder='Amount'; amt.inputMode='decimal'; amt.style.cssText='width:120px;padding:10px;border-radius:10px;border:0;color:#0f172a;';
    if (detectedAmount && detectedAmount>0){ amt.value=String(detectedAmount.toFixed(2)); LAST_CTX.amount=detectedAmount; }
    var btnYes=document.createElement('button'); btnYes.textContent='Save Instead'; btnYes.style.cssText='padding:10px 12px;border:0;border-radius:10px;background:#34d399;color:#001b0a;font-weight:800;cursor:pointer;';
    var btnNo=document.createElement('button'); btnNo.textContent='Not now'; btnNo.style.cssText='padding:10px 12px;border:0;border-radius:10px;background:#ffffff33;color:#fff;cursor:pointer;';
    var btnNever=document.createElement('button'); btnNever.textContent='Don’t show on this site'; btnNever.style.cssText='padding:10px 12px;border:0;border-radius:10px;background:#ffffff33;color:#fff;cursor:pointer;';

    bar.appendChild(msg); bar.appendChild(amt); bar.appendChild(btnYes); bar.appendChild(btnNo); bar.appendChild(btnNever); bar.appendChild(info);
    document.body.appendChild(bar);

    function parseAmount(v){ var n=Number(String(v||'').replace(/[^0-9.]/g,'')); if(!isFinite(n)||n<=0) return 0; return Math.min(n,100000); }
    btnNo.onclick=function(){ snoozeNow(); bar.remove(); };
    btnNever.onclick=async function(){ try{ const d=hostKey(); const s=await chrome.storage.sync.get(['mm_deny']); const set=new Set(s.mm_deny||[]); if(d) set.add(d); await chrome.storage.sync.set({ mm_deny:Array.from(set) }); }catch(e){} snoozeNow(); bar.remove(); };
    btnYes.onclick=function(){
      var amount=parseAmount(amt.value); if(!amount){ amt.focus(); return; }
      ABANDON_SENT=true;
      chrome.runtime.sendMessage({ type:'MM_SAVE', amount:amount, category:ctx.category||'other', notes:'Auto-prompt', risk:ctx.risk||0, url:location.href, title:document.title }, function(resp){
        msg.textContent=(resp&&resp.ok)?'Saved!':(resp&&resp.queued?'Offline — queued':'Saved (queued)');
        btnYes.disabled=btnNo.disabled=btnNever.disabled=amt.disabled=true; setTimeout(function(){ bar.remove(); }, 900);
      });
    };
  }

  async function maybeAutoAbandon(noBodyScan, maxChars){
    if (ABANDON_SENT) return;
    if (purchaseLooksDone(maxChars)) return;
    const cfg = await chrome.storage.sync.get(['autoAbandon']);
    if (!cfg.autoAbandon) return;
    var amount = LAST_CTX.amount;
    if (!amount || amount<=0) return;
    ABANDON_SENT=true;
    chrome.runtime.sendMessage({ type:'MM_SAVE', amount:amount, category:LAST_CTX.category||'other', notes:'Auto-abandon save', risk:LAST_CTX.risk||0, url:LAST_CTX.url||location.href, title:LAST_CTX.title||document.title }, function(){});
  }

  // -------- main --------
  async function maybePrompt() {
    try {
      const cfg = await chrome.storage.sync.get(['autoPrompt','riskThreshold','autoPrice','mm_deny','noBodyScan','maxScanChars']);
      var deny = new Set(cfg.mm_deny || []);
      var noBodyScan = !!cfg.noBodyScan;
      var maxChars = Number(cfg.maxScanChars || 8000);

      if (!looksLikeCheckout(noBodyScan ? 0 : maxChars)) return;
      if (isSnoozed()) return;
      if (deny.has(hostKey())) return;
      if (!cfg.autoPrompt) return;

      if (!window.MM_CLASSIFIER) return;
      var info = window.MM_CLASSIFIER.classify(location.href, document.title);
      if (typeof info.risk !== 'number') info.risk = 0;

      var threshold = Number(cfg.riskThreshold || '1'); // 1=Med+, 2=High only
      chrome.runtime.sendMessage({ type:'MM_CHECKOUT_DETECTED', title:document.title, url:location.href });

      var detected = 0;
      if (!!cfg.autoPrice) { try { detected = getPriceFromDOM(maxChars, noBodyScan) || 0; } catch(e){} }

      if (info.risk >= threshold) {
        LAST_CTX.category = info.category || 'other';
        LAST_CTX.risk     = info.risk || 0;
        LAST_CTX.url      = location.href;
        LAST_CTX.title    = document.title;
        if (detected && detected>0) LAST_CTX.amount = detected;
        injectBanner(info, detected);
      }

      // sync price as DOM changes
      if (!!cfg.autoPrice && !noBodyScan){
        var mo=new MutationObserver(function(){
          var v=getPriceFromDOM(maxChars, noBodyScan);
          var input=document.querySelector('#mm-save-banner input[type="text"]');
          if (input && v && !isNaN(v) && v>0){ input.value=String(v.toFixed(2)); LAST_CTX.amount=v; }
        });
        mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
      }
    } catch(e){}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybePrompt); else maybePrompt();

  document.addEventListener('visibilitychange', async function(){
    if (document.visibilityState === 'hidden') {
      const cfg = await chrome.storage.sync.get(['noBodyScan','maxScanChars']);
      maybeAutoAbandon(!!cfg.noBodyScan, Number(cfg.maxScanChars||8000));
    }
  });
  window.addEventListener('pagehide', async function(){
    const cfg = await chrome.storage.sync.get(['noBodyScan','maxScanChars']);
    maybeAutoAbandon(!!cfg.noBodyScan, Number(cfg.maxScanChars||8000));
  });
  window.addEventListener('beforeunload', async function(){
    const cfg = await chrome.storage.sync.get(['noBodyScan','maxScanChars']);
    maybeAutoAbandon(!!cfg.noBodyScan, Number(cfg.maxScanChars||8000));
  });
})();
