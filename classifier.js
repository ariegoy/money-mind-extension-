// classifier.js
(function () {
  const HOST_RULES = {
    "amazon.": "shopping",
    "ebay.": "shopping",
    "shein.": "shopping",
    "temu.": "shopping",
    "uber": "transport",
    "lyft": "transport",
    "ubereats": "food",
    "doordash": "food",
    "grubhub": "food",
    "starbucks": "coffee",
    "dunkin": "coffee",
    "nike.": "shopping",
    "apple.": "shopping",
    "steamPowered": "gaming",
    "epicgames": "gaming",
    "playstation": "gaming",
    "xbox": "gaming"
  };

  const KW_RULES = {
    "coffee": ["latte","espresso","frapp","coffee","café"],
    "food": ["delivery","takeout","ubereats","doordash","grubhub","pizza","burger"],
    "shopping": ["cart","checkout","buy now","add to bag","add to cart","order summary","subtotal"],
    "transport": ["ride","dropoff","pickup","uber","lyft","fare"],
    "gaming": ["game","dlc","coins","gems","battle pass","in-app"]
  };

  // Simple risk based on time + category
  function riskFor(category) {
    const hour = new Date().getHours();
    const late = (hour >= 20 || hour <= 6); // 8pm–6am → higher risk
    const highCats = { "food":1, "coffee":1, "shopping":1, "gaming":1 };
    let score = 0;
    if (late) score += 1;
    if (highCats[category]) score += 1;
    // 0 = low, 1 = medium, 2 = high
    return score;
  }

  function classify(tabUrl, pageTitle) {
    const host = (new URL(tabUrl)).hostname.toLowerCase();
    let cat = "other", conf = 0.3;

    // Hostname match
    for (const key in HOST_RULES) {
      if (host.indexOf(key) !== -1) {
        cat = HOST_RULES[key];
        conf = 0.8;
        break;
      }
    }

    // Keywords in title
    const title = (pageTitle || "").toLowerCase();
    for (const kCat in KW_RULES) {
      if (KW_RULES[kCat].some(w => title.indexOf(w) !== -1)) {
        // if we already had a host match, boost; else use medium
        if (cat === "other") { cat = kCat; conf = 0.6; }
        else { conf = Math.max(conf, 0.9); }
      }
    }

    const risk = riskFor(cat);
    return { category: cat, confidence: conf, risk: risk };
  }

  // Expose
  window.MM_CLASSIFIER = { classify };
})();
