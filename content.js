// content.js
(function(){
  function looksLikeCheckout() {
    const t = (document.title || "").toLowerCase();
    const tx = document.body ? document.body.innerText.slice(0, 4000).toLowerCase() : "";
    const kw = ["checkout","order summary","place order","payment","billing","cart","add to cart","add to bag"];
    return kw.some(k => t.indexOf(k) !== -1 || tx.indexOf(k) !== -1);
  }

  if (looksLikeCheckout()) {
    chrome.runtime.sendMessage({ type: "MM_CHECKOUT_DETECTED", title: document.title, url: location.href });
  }
})();
