// options.js — settings + erase + self-test metrics
(function(){
  function $(id){ return document.getElementById(id); }

  async function load(){
    const s = await chrome.storage.sync.get([
      "apiUrl","userCode","autoPrompt","riskThreshold","autoPrice","autoAbandon","noBodyScan","maxScanChars"
    ]);
    $('apiUrl').value      = s.apiUrl || "";
    $('userCode').value    = s.userCode || "";
    $('autoPrompt').checked   = !!s.autoPrompt;
    $('riskThreshold').value  = s.riskThreshold || "1";
    $('autoPrice').checked    = !!s.autoPrice;
    $('autoAbandon').checked  = !!s.autoAbandon;
    $('noBodyScan').checked   = !!s.noBodyScan;
    $('maxScanChars').value   = s.maxScanChars != null ? String(s.maxScanChars) : "8000";
  }
  async function save(){
    await chrome.storage.sync.set({
      apiUrl: $('apiUrl').value.trim(),
      userCode: $('userCode').value.trim(),
      autoPrompt: $('autoPrompt').checked,
      riskThreshold: $('riskThreshold').value,
      autoPrice: $('autoPrice').checked,
      autoAbandon: $('autoAbandon').checked,
      noBodyScan: $('noBodyScan').checked,
      maxScanChars: Number($('maxScanChars').value || 8000)
    });
    $('status').textContent = "Saved!";
    setTimeout(function(){ $('status').textContent = ""; }, 1200);
  }
  async function erase(){
    if (!confirm("Erase extension settings and queued saves?")) return;
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    $('status').textContent = "Erased extension data";
    setTimeout(function(){ $('status').textContent = ""; }, 1200);
    load();
  }

  // -------- classifier self-test (WAICY metrics) --------
  function metricsReport(results, labels){
    // confusion matrix
    var idx = {}; labels.forEach(function(l,i){ idx[l]=i; });
    var cm = []; for (var i=0;i<labels.length;i++){ cm[i]=[]; for(var j=0;j<labels.length;j++) cm[i][j]=0; }
    var correct=0;
    results.forEach(function(r){
      var a=idx[r.actual], p=idx[r.predicted];
      cm[a][p]++; if (r.actual===r.predicted) correct++;
    });
    var total = results.length, accuracy = total? (correct/total):0;

    // precision/recall per class
    function colSum(c){ var s=0; for(var i=0;i<labels.length;i++) s+=cm[i][c]; return s; }
    function rowSum(r){ var s=0; for(var j=0;j<labels.length;j++) s+=cm[r][j]; return s; }
    var pr = labels.map(function(l,i){
      var tp = cm[i][i], fp = colSum(i)-tp, fn = rowSum(i)-tp;
      var precision = (tp+fp)? tp/(tp+fp) : 0;
      var recall    = (tp+fn)? tp/(tp+fn) : 0;
      return { label:l, precision:precision, recall:recall };
    });
    var macroP = pr.reduce((a,b)=>a+b.precision,0)/labels.length;
    var macroR = pr.reduce((a,b)=>a+b.recall,0)/labels.length;

    // format
    var lines = [];
    lines.push("Samples: " + total);
    lines.push("Accuracy: " + (accuracy*100).toFixed(1) + "%");
    lines.push("Macro Precision: " + (macroP*100).toFixed(1) + "%");
    lines.push("Macro Recall: " + (macroR*100).toFixed(1) + "%");
    lines.push("\nConfusion Matrix (rows=actual, cols=pred):");
    lines.push("          " + labels.map(l=>("     "+l).slice(-8)).join(" "));
    labels.forEach(function(l,i){
      lines.push((("     "+l).slice(-8)) + " " + cm[i].map(n=>("     "+n).slice(-8)).join(" "));
    });
    lines.push("\nPer-class:");
    pr.forEach(function(x){ lines.push(x.label + "  P=" + (x.precision*100).toFixed(1) + "%  R=" + (x.recall*100).toFixed(1) + "%"); });
    return lines.join("\n");
  }

  async function runTest(){
    $('testStatus').textContent = "Running…";
    try {
      const url = chrome.runtime.getURL("testset.json");
      const data = await fetch(url).then(r=>r.json());
      const samples = data.samples || [];
      const labels  = data.labels  || ["coffee","food","shopping","transport","gaming","other"];
      // Use the same logic as classifier.js here (host+title keywords)
      function classifyHostTitle(host, title){
        host = (host||"").toLowerCase();
        title = (title||"").toLowerCase();
        // simple mirror of classifier.js rules (keep aligned manually)
        var hostRules = [
          ["amazon.","shopping"],["ebay.","shopping"],["shein.","shopping"],["temu.","shopping"],
          ["ubereats","food"],["doordash","food"],["grubhub","food"],
          ["starbucks","coffee"],["dunkin","coffee"],
          ["uber","transport"],["lyft","transport"],
          ["steampowered","gaming"],["epicgames","gaming"],["playstation","gaming"],["xbox","gaming"],
          ["nike.","shopping"],["apple.","shopping"]
        ];
        var cat="other";
        for (var i=0;i<hostRules.length;i++){ if (host.indexOf(hostRules[i][0])!==-1){ cat=hostRules[i][1]; break; } }
        var kw = {
          "coffee":["latte","espresso","frapp","coffee","café"],
          "food":["delivery","takeout","uber eats","doordash","grubhub","pizza","burger","order"],
          "shopping":["cart","checkout","buy now","add to bag","add to cart","order summary","subtotal"],
          "transport":["ride","dropoff","pickup","uber","lyft","fare"],
          "gaming":["game","dlc","coins","gems","battle pass","in-app","purchase"]
        };
        for (var k in kw){
          if (kw[k].some(w=>title.indexOf(w)!==-1)){ if (cat==="other") cat=k; }
        }
        return cat;
      }
      var results = samples.map(function(s){
        var predicted = classifyHostTitle(s.host, s.title);
        return { actual: s.label, predicted: predicted };
      });
      $('testReport').textContent = metricsReport(results, labels);
      $('testStatus').textContent = "Done";
    } catch(e){
      $('testStatus').textContent = "Error: " + e.message;
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    load();
    $('saveOpts').addEventListener('click', save);
    $('eraseExt').addEventListener('click', erase);
    $('runTest').addEventListener('click', runTest);
  });
})();
