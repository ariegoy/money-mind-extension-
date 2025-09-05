// options.js
(function(){
  function $(id){ return document.getElementById(id); }

  async function load(){
    const s = await chrome.storage.sync.get(["apiUrl","userCode"]);
    $('apiUrl').value = s.apiUrl || "";
    $('userCode').value = s.userCode || "";
  }
  async function save(){
    const apiUrl = $('apiUrl').value.trim();
    const userCode = $('userCode').value.trim();
    await chrome.storage.sync.set({ apiUrl, userCode });
    $('status').textContent = "Saved!";
    setTimeout(function(){ $('status').textContent = ""; }, 1200);
  }

  document.addEventListener('DOMContentLoaded', function(){
    load();
    $('saveOpts').addEventListener('click', save);
  });
})();
