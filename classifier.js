// classifier.js — rules + explainability
(function () {
  const HOST_RULES = {
    "amazon.": "shopping","ebay.": "shopping","shein.": "shopping","temu.": "shopping",
    "ubereats": "food","doordash": "food","grubhub": "food",
    "starbucks": "coffee","dunkin": "coffee",
    "uber": "transport","lyft": "transport",
    "steampowered": "gaming","epicgames": "gaming","playstation": "gaming","xbox": "gaming",
    "nike.": "shopping","apple.": "shopping"
  };
  const KW_RULES = {
    "coffee":   ["latte","espresso","frapp","coffee","café"],
    "food":     ["delivery","takeout","uber eats","doordash","grubhub","pizza","burger","order"],
    "shopping": ["cart","checkout","buy now","add to bag","add to cart","order summary","subtotal"],
    "transport":["ride","dropoff","pickup","uber","lyft","fare"],
    "gaming":   ["game","dlc","coins","gems","battle pass","in-app","purchase"]
  };
  function riskFor(category) {
    const hour = new Date().getHours();
    const late = (hour >= 20 || hour <= 6);
    const highCats = { "food":1, "coffee":1, "shopping":1, "gaming":1 };
    let score = 0, reasons = [];
    if (late){ score += 1; reasons.push("late_hour"); }
    if (highCats[category]){ score += 1; reasons.push("category_high_risk"); }
    return { score, reasons }; // 0 low, 1 med, 2 high
  }
  function classify(tabUrl, pageTitle) {
    const host = (new URL(tabUrl)).hostname.toLowerCase();
    let cat = "other", conf = 0.3, reasons = { host:null, keywords:[] };

    for (const key in HOST_RULES) {
      if (host.indexOf(key) !== -1) { cat = HOST_RULES[key]; conf = 0.8; reasons.host = key; break; }
    }
    const title = (pageTitle || "").toLowerCase();
    for (const kCat in KW_RULES) {
      if (KW_RULES[kCat].some(w => title.indexOf(w) !== -1)) {
        if (cat === "other") { cat = kCat; conf = 0.6; } else { conf = Math.max(conf, 0.9); }
        reasons.keywords.push(kCat);
      }
    }
    const r = riskFor(cat);
    return { category: cat, confidence: conf, risk: r.score, riskReasons: r.reasons, explain: reasons };
  }
  window.MM_CLASSIFIER = { classify };
})();
