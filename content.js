// content.js — persuasive auto-prompt banner on checkout-like pages
(function () {
  // --- Helpers --------------------------------------------------------------
  function looksLikeCheckout() {
    var t  = (document.title || '').toLowerCase();
    var tx = document.body ? (document.body.innerText || '').slice(0, 4000).toLowerCase() : '';
    var kw = ['checkout','order summary','place order','payment','billing','cart','add to cart','add to bag'];
    for (var i=0;i<kw.length;i++){
      if (t.indexOf(kw[i]) !== -1 || tx.indexOf(kw[i]) !== -1) return true;
    }
    return false;
  }

  function hostKey() {
    try { return (new URL(location.href)).hostname.toLowerCase(); }
    catch(e){ return 'unknown-host'; }
  }

  // session snooze for this host (ms)
  var SNOOZE_MS = 2 * 60 * 60 * 1000; // 2 hours
  function isSnoozed() {
    var k = 'mm_snooze:' + hostKey();
    var raw = sessionStorage.getItem(k);
    if (!raw) return false;
    var until = Number(raw);
    return isFinite(until) && Date.now() < until;
  }
  function snoozeNow() {
    var k = 'mm_snooze:' + hostKey();
    sessionStorage.setItem(k, String(Date.now() + SNOOZE_MS));
  }

  // Pick a friendly nudge line based on risk + category
  function nudgeMessage(ctx) {
    var cat = ctx.category || 'purchase';
    var risk = ctx.risk || 0; // 0 low, 1 med, 2 high
    var poolHigh = [
      'Late-night ' + cat + '? Save Instead and keep your streak 🔥',
      'Impulse alert: skip this ' + cat + ' and power up your streak 💪',
      'This ' + cat + ' adds up fast — want to Save Instead?'
    ];
    var poolMed = [
      'You’re on a streak — one skip brings your goal closer 🏅',
      'Nice momentum! Save Instead and unlock your next badge ✨',
      'Keep the streak alive — skip this ' + cat + ' for your goal'
    ];
    var poolLow = [
      'Want to save this ' + cat + ' for later?',
      'Every skip counts — Save Instead for your goal 💡',
      'A small save now → big wins later 📈'
    ];
    var pool = risk === 2 ? poolHigh : (risk === 1 ? poolMed : poolLow);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Inject the non-blocking banner UI
  function injectBanner(ctx) {
    if (document.getElementById('mm-save-banner')) return;

    var bar = document.createElement('div');
    bar.id = 'mm-save-banner';
    bar.style.cssText =
      'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;' +
      'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' +
      'padding:12px 14px;border-radius:12px;' +
      'background:#0ea5e9;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.25);';

    var msg = document.createElement('div');
    msg.style.cssText = 'flex:1;min-width:220px;font-weight:700;';
    msg.textContent = nudgeMessage(ctx);

    var amt = document.createElement('input');
    amt.type = 'text';
    amt.placeholder = 'Amount';
    amt.inputMode = 'decimal';
    amt.style.cssText = 'width:120px;padding:10px;border-radius:10px;border:0;color:#0f172a;';
    amt.addEventListener('keydown', function(e){ if(e.key === 'Enter') btnYes.click(); });

    var btnYes = document.createElement('button');
    btnYes.textContent = 'Save Instead';
    btnYes.style.cssText =
      'padding:10px 12px;border:0;border-radius:10px;' +
      'background:#34d399;color:#001b0a;font-weight:800;cursor:pointer;';

    var btnNo = document.createElement('button');
    btnNo.textContent = 'Not now';
    btnNo.style.cssText =
      'padding:10px 12px;border:0;border-radius:10px;' +
      'background:#ffffff33;color:#fff;cursor:pointer;';

    bar.appendChild(msg);
    bar.appendChild(amt);
    bar.appendChild(btnYes);
    bar.appendChild(btnNo);
    document.body.appendChild(bar);

    function parseAmount(v) {
      var n = Number(String(v || '').replace(/[^0-9.]/g, ''));
      if (!isFinite(n) || n <= 0) return 0;
      return Math.min(n, 100000);
    }

    btnNo.onclick = function () {
      snoozeNow();
      bar.remove();
    };

    btnYes.onclick = function () {
      var amount = parseAmount(amt.value);
      if (!amount) { amt.focus(); return; }
      // send to background for API/queue
      chrome.runtime.sendMessage({
        type: 'MM_SAVE',
        amount: amount,
        category: ctx.category || 'other',
        notes: 'Auto-prompt',
        risk: ctx.risk || 0,
        url: location.href,
        title: document.title
      }, function (resp) {
        msg.textContent = (resp && resp.ok) ? 'Saved!' : (resp && resp.queued ? 'Offline — queued' : 'Saved (queued)');
        btnYes.disabled = true; btnNo.disabled = true; amt.disabled = true;
        setTimeout(function(){ bar.remove(); }, 900);
      });
    };
  }

  // Main: decide whether to prompt
  async function maybePrompt() {
    try {
      if (!looksLikeCheckout()) return;
      if (isSnoozed()) return;

      var cfg = await chrome.storage.sync.get(['autoPrompt','riskThreshold']);
      var autoPrompt = !!cfg.autoPrompt;
      var threshold  = Number(cfg.riskThreshold || '1'); // 1=Med+, 2=High only
      if (!autoPrompt) return;

      if (!window.MM_CLASSIFIER) return; // classifier.js not loaded yet
      var info = window.MM_CLASSIFIER.classify(location.href, document.title);
      if (typeof info.risk !== 'number') info.risk = 0;

      // Optional: update badge via background (nice to have)
      chrome.runtime.sendMessage({ type:'MM_CHECKOUT_DETECTED', title:document.title, url:location.href });

      if (info.risk >= threshold) {
        injectBanner(info);
      }
    } catch (e) {
      // Fail silently (never break the page)
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybePrompt);
  } else {
    maybePrompt();
  }
})();
